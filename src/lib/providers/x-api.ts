import type { BestTimeSlot, DailyMetric, XPostSummary } from "@/lib/metrics";

type XApiTweet = {
  id: string;
  text?: string;
  created_at?: string;
  public_metrics?: {
    like_count?: number;
    reply_count?: number;
    retweet_count?: number;
    quote_count?: number;
    impression_count?: number;
    bookmark_count?: number;
  };
  organic_metrics?: {
    impression_count?: number;
    user_profile_clicks?: number;
  };
  non_public_metrics?: {
    impression_count?: number;
    user_profile_clicks?: number;
  };
};

type XApiPage = {
  data?: XApiTweet[];
  errors?: Array<{
    title?: string;
    detail?: string;
  }>;
  meta?: {
    next_token?: string;
  };
};

export type XApiSnapshot = {
  daily: DailyMetric[];
  topPosts: XPostSummary[];
  bestTimes: BestTimeSlot[];
  timeMatrix: BestTimeSlot[];
  timeOfDayAvailable: boolean;
  source: "api" | "disabled" | "error" | "paused";
  fetchedAt: Date | null;
  error?: string;
};

type LoadOptions = {
  forceRefresh?: boolean;
  manualOnly?: boolean;
};

const API_BASE = "https://api.x.com/2";
const MAX_PAGES = 8;
const CACHE_SECONDS = clampNumber(process.env.X_API_CACHE_SECONDS, 900, 30, 86400);
let snapshotCache: { expiresAt: number; value: XApiSnapshot } | null = null;

export async function loadXApiSnapshot(options: LoadOptions = {}): Promise<XApiSnapshot> {
  if (!options.forceRefresh && snapshotCache) {
    if (options.manualOnly) {
      return snapshotCache.value;
    }
    if (Date.now() < snapshotCache.expiresAt) {
      return snapshotCache.value;
    }
  }

  if (options.manualOnly && !options.forceRefresh) {
    return {
      daily: [],
      topPosts: [],
      bestTimes: [],
      timeMatrix: [],
      timeOfDayAvailable: false,
      source: "paused",
      fetchedAt: snapshotCache?.value.fetchedAt ?? null
    };
  }

  const bearer = process.env.X_API_BEARER_TOKEN;
  const username = process.env.X_API_USERNAME;

  if (!bearer || !username) {
    return cacheAndReturn({
      daily: [],
      topPosts: [],
      bestTimes: [],
      timeMatrix: [],
      timeOfDayAvailable: false,
      source: "disabled",
      fetchedAt: null
    });
  }

  try {
    const user = await xFetch<{ data?: { id: string } }>(
      `${API_BASE}/users/by/username/${encodeURIComponent(username)}?user.fields=id`,
      bearer
    );

    const userId = user.data?.id;
    if (!userId) {
      return cacheAndReturn({
        daily: [],
        topPosts: [],
        bestTimes: [],
        timeMatrix: [],
        timeOfDayAvailable: false,
        source: "error",
        fetchedAt: null,
        error: "Unable to resolve X username to user id."
      });
    }

    const tweets = await fetchRecentTweets(userId, bearer);
    if (tweets.length === 0) {
      return cacheAndReturn({
        daily: [],
        topPosts: [],
        bestTimes: [],
        timeMatrix: [],
        timeOfDayAvailable: false,
        source: "api",
        fetchedAt: new Date()
      });
    }

    const daily = aggregateDaily(tweets);
    const timeMatrix = buildTimeMatrix(tweets);
    const bestTimes = rankTopSlots(timeMatrix);
    const topPosts = tweets
      .map(toPostSummary)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5);

    return cacheAndReturn({
      daily,
      topPosts,
      bestTimes,
      timeMatrix,
      timeOfDayAvailable: true,
      source: "api",
      fetchedAt: new Date()
    });
  } catch (error) {
    return cacheAndReturn({
      daily: [],
      topPosts: [],
      bestTimes: [],
      timeMatrix: [],
      timeOfDayAvailable: false,
      source: "error",
      fetchedAt: null,
      error: error instanceof Error ? error.message : "Unknown X API error"
    });
  }
}

async function fetchRecentTweets(userId: string, bearer: string): Promise<XApiTweet[]> {
  const lookbackDays = clampNumber(process.env.X_API_LOOKBACK_DAYS, 30, 7, 30);
  const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  // Keep fields to those broadly available in app-only auth. Requesting
  // restricted metrics can return 200 responses with only "errors" and no data.
  const fields = ["created_at", "public_metrics"].join(",");

  let nextToken: string | undefined;
  let pageCount = 0;
  const tweets: XApiTweet[] = [];

  while (pageCount < MAX_PAGES) {
    const params = new URLSearchParams({
      max_results: "100",
      exclude: "retweets,replies",
      "tweet.fields": fields,
      start_time: start
    });

    if (nextToken) {
      params.set("pagination_token", nextToken);
    }

    const page = await xFetch<XApiPage>(
      `${API_BASE}/users/${userId}/tweets?${params.toString()}`,
      bearer
    );

    if ((!page.data || page.data.length === 0) && page.errors?.length) {
      const details = page.errors
        .map((error) => error.detail ?? error.title)
        .filter(Boolean)
        .join(" | ");
      throw new Error(`X API field access error: ${details.slice(0, 220)}`);
    }

    tweets.push(...(page.data ?? []));

    nextToken = page.meta?.next_token;
    pageCount += 1;

    if (!nextToken) {
      break;
    }
  }

  return tweets;
}

async function xFetch<T>(url: string, bearer: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearer}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`X API ${response.status}: ${body.slice(0, 200)}`);
  }

  return (await response.json()) as T;
}

function aggregateDaily(tweets: XApiTweet[]): DailyMetric[] {
  const byDay = new Map<string, DailyMetric>();

  tweets.forEach((tweet) => {
    const createdAt = parseXDate(tweet.created_at);
    if (!createdAt) return;

    const key = toDayKey(createdAt);
    const views =
      tweet.non_public_metrics?.impression_count ??
      tweet.organic_metrics?.impression_count ??
      tweet.public_metrics?.impression_count ??
      0;
    const likes = tweet.public_metrics?.like_count ?? 0;
    const comments = tweet.public_metrics?.reply_count ?? 0;
    const reposts =
      (tweet.public_metrics?.retweet_count ?? 0) +
      (tweet.public_metrics?.quote_count ?? 0);
    const profileVisits =
      tweet.non_public_metrics?.user_profile_clicks ??
      tweet.organic_metrics?.user_profile_clicks ??
      0;
    const bookmarks = tweet.public_metrics?.bookmark_count ?? 0;

    const existing =
      byDay.get(key) ??
      {
        source: "x" as const,
        date: createdAt,
        views: 0,
        likes: 0,
        comments: 0,
        reposts: 0,
        clicks: 0,
        shares: 0,
        bookmarks: 0,
        profileVisits: 0,
        engagements: 0,
        videoViews: 0,
        videoWatchViews: 0,
        videoWatchTimeMs: 0,
        videoCompletionRateSum: 0,
        posts: 0,
        newFollows: 0,
        unfollows: 0
      };

    existing.views += views;
    existing.likes += likes;
    existing.comments += comments;
    existing.reposts += reposts;
    existing.bookmarks += bookmarks;
    existing.profileVisits += profileVisits;
    existing.engagements += likes + comments + reposts;
    existing.posts += 1;

    byDay.set(key, existing);
  });

  return Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function toPostSummary(tweet: XApiTweet): XPostSummary {
  const impressions =
    tweet.non_public_metrics?.impression_count ??
    tweet.organic_metrics?.impression_count ??
    tweet.public_metrics?.impression_count ??
    0;
  const likes = tweet.public_metrics?.like_count ?? 0;
  const replies = tweet.public_metrics?.reply_count ?? 0;
  const reposts =
    (tweet.public_metrics?.retweet_count ?? 0) +
    (tweet.public_metrics?.quote_count ?? 0);
  const engagements = likes + replies + reposts;

  return {
    text: sanitizeText(tweet.text ?? ""),
    link: `https://x.com/i/web/status/${tweet.id}`,
    createdAt: parseIsoDate(tweet.created_at),
    impressions,
    likes,
    replies,
    reposts,
    engagements,
    engagementRate: impressions ? engagements / impressions : null
  };
}

function buildTimeMatrix(tweets: XApiTweet[]): BestTimeSlot[] {
  const slotMap = new Map<string, BestTimeSlot>();

  tweets.forEach((tweet) => {
    const createdAt = parseIsoDate(tweet.created_at);
    if (!createdAt) return;

    const impressions =
      tweet.non_public_metrics?.impression_count ??
      tweet.organic_metrics?.impression_count ??
      tweet.public_metrics?.impression_count ??
      0;
    const engagements =
      (tweet.public_metrics?.like_count ?? 0) +
      (tweet.public_metrics?.reply_count ?? 0) +
      (tweet.public_metrics?.retweet_count ?? 0) +
      (tweet.public_metrics?.quote_count ?? 0);
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
      createdAt.getUTCDay()
    ];
    const hour = createdAt.getUTCHours();
    const label = `${day} ${String(hour).padStart(2, "0")}:00`;
    const key = `${day}-${hour}`;

    const slot =
      slotMap.get(key) ?? {
        label,
        day,
        hour,
        posts: 0,
        impressions: 0,
        engagements: 0,
        engagementRate: null
      };
    slot.posts += 1;
    slot.impressions += impressions;
    slot.engagements += engagements;
    slot.engagementRate = slot.impressions ? slot.engagements / slot.impressions : null;
    slotMap.set(key, slot);
  });

  return Array.from(slotMap.values())
    .filter((slot) => slot.posts > 0)
    .sort((a, b) => {
      const dayDiff = dayOrder(a.day) - dayOrder(b.day);
      if (dayDiff !== 0) return dayDiff;
      return (a.hour ?? 0) - (b.hour ?? 0);
    });
}

function rankTopSlots(slots: BestTimeSlot[]): BestTimeSlot[] {
  return [...slots]
    .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0))
    .slice(0, 5);
}

function dayOrder(day: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 140);
}

function parseIsoDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseXDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function toDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampNumber(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function cacheAndReturn(value: XApiSnapshot): XApiSnapshot {
  snapshotCache = {
    expiresAt: Date.now() + CACHE_SECONDS * 1000,
    value
  };
  return value;
}
