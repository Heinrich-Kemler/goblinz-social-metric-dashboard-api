import type { DailyMetric, XPostSummary } from "@/lib/metrics";

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
  meta?: {
    next_token?: string;
  };
};

export type XApiSnapshot = {
  daily: DailyMetric[];
  topPosts: XPostSummary[];
  source: "api" | "disabled" | "error";
  error?: string;
};

const API_BASE = "https://api.x.com/2";
const MAX_PAGES = 8;

export async function loadXApiSnapshot(): Promise<XApiSnapshot> {
  const bearer = process.env.X_API_BEARER_TOKEN;
  const username = process.env.X_API_USERNAME;

  if (!bearer || !username) {
    return { daily: [], topPosts: [], source: "disabled" };
  }

  try {
    const user = await xFetch<{ data?: { id: string } }>(
      `${API_BASE}/users/by/username/${encodeURIComponent(username)}?user.fields=id`,
      bearer
    );

    const userId = user.data?.id;
    if (!userId) {
      return {
        daily: [],
        topPosts: [],
        source: "error",
        error: "Unable to resolve X username to user id."
      };
    }

    const tweets = await fetchRecentTweets(userId, bearer);
    if (tweets.length === 0) {
      return { daily: [], topPosts: [], source: "api" };
    }

    const daily = aggregateDaily(tweets);
    const topPosts = tweets
      .map(toPostSummary)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5);

    return { daily, topPosts, source: "api" };
  } catch (error) {
    return {
      daily: [],
      topPosts: [],
      source: "error",
      error: error instanceof Error ? error.message : "Unknown X API error"
    };
  }
}

async function fetchRecentTweets(userId: string, bearer: string): Promise<XApiTweet[]> {
  const lookbackDays = clampNumber(process.env.X_API_LOOKBACK_DAYS, 30, 7, 30);
  const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const fields = [
    "created_at",
    "public_metrics",
    "organic_metrics",
    "non_public_metrics"
  ].join(",");

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
