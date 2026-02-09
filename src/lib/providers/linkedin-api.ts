import type {
  BestTimeSlot,
  DailyMetric,
  LinkedInContentTypeSummary,
  LinkedInPostSummary
} from "@/lib/metrics";

type LinkedInApiResponse = {
  elements?: Array<Record<string, unknown>>;
};

export type LinkedInApiSnapshot = {
  daily: DailyMetric[];
  topPosts: LinkedInPostSummary[];
  topPostsByRate: LinkedInPostSummary[];
  contentTypes: LinkedInContentTypeSummary[];
  bestTimes: BestTimeSlot[];
  timeOfDayAvailable: boolean;
  source: "api" | "disabled" | "error";
  error?: string;
};

const API_BASE = process.env.LINKEDIN_API_BASE_URL ?? "https://api.linkedin.com/rest";
const API_VERSION = process.env.LINKEDIN_API_VERSION ?? "202506";

export async function loadLinkedInApiSnapshot(): Promise<LinkedInApiSnapshot> {
  const token = process.env.LINKEDIN_API_ACCESS_TOKEN;
  const org = normalizeOrganizationUrn(process.env.LINKEDIN_ORGANIZATION_URN);

  if (!token || !org) {
    return emptySnapshot("disabled");
  }

  try {
    const lookbackDays = clampNumber(process.env.LINKEDIN_API_LOOKBACK_DAYS, 30, 7, 365);
    const end = Date.now();
    const start = end - lookbackDays * 24 * 60 * 60 * 1000;

    const [shareStats, pageStats, followerStats] = await Promise.all([
      fetchShareStats(token, org, start, end),
      fetchPageStats(token, org, start, end),
      fetchFollowerStats(token, org, start, end)
    ]);

    const daily = mergeLinkedInDaily(shareStats, pageStats, followerStats);
    return {
      daily,
      topPosts: [],
      topPostsByRate: [],
      contentTypes: [],
      bestTimes: [],
      timeOfDayAvailable: false,
      source: "api"
    };
  } catch (error) {
    return {
      ...emptySnapshot("error"),
      error: error instanceof Error ? error.message : "Unknown LinkedIn API error"
    };
  }
}

async function fetchShareStats(
  token: string,
  orgUrn: string,
  start: number,
  end: number
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    q: "organizationalEntity",
    organizationalEntity: orgUrn,
    "timeIntervals.timeGranularityType": "DAY",
    "timeIntervals.timeRange.start": String(start),
    "timeIntervals.timeRange.end": String(end)
  });

  const body = await linkedinFetch<LinkedInApiResponse>(
    `${API_BASE}/organizationalEntityShareStatistics?${params.toString()}`,
    token
  );
  return body.elements ?? [];
}

async function fetchPageStats(
  token: string,
  orgUrn: string,
  start: number,
  end: number
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    q: "organization",
    organization: orgUrn,
    "timeIntervals.timeGranularityType": "DAY",
    "timeIntervals.timeRange.start": String(start),
    "timeIntervals.timeRange.end": String(end)
  });

  const body = await linkedinFetch<LinkedInApiResponse>(
    `${API_BASE}/organizationPageStatistics?${params.toString()}`,
    token
  );
  return body.elements ?? [];
}

async function fetchFollowerStats(
  token: string,
  orgUrn: string,
  start: number,
  end: number
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    q: "organizationalEntity",
    organizationalEntity: orgUrn,
    "timeIntervals.timeGranularityType": "DAY",
    "timeIntervals.timeRange.start": String(start),
    "timeIntervals.timeRange.end": String(end)
  });

  const body = await linkedinFetch<LinkedInApiResponse>(
    `${API_BASE}/organizationalEntityFollowerStatistics?${params.toString()}`,
    token
  );
  return body.elements ?? [];
}

async function linkedinFetch<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": API_VERSION,
      "X-Restli-Protocol-Version": "2.0.0"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LinkedIn API ${response.status}: ${body.slice(0, 220)}`);
  }

  return (await response.json()) as T;
}

function mergeLinkedInDaily(
  shareStats: Array<Record<string, unknown>>,
  pageStats: Array<Record<string, unknown>>,
  followerStats: Array<Record<string, unknown>>
): DailyMetric[] {
  const byDay = new Map<string, DailyMetric>();

  shareStats.forEach((entry) => {
    const key = extractDayKey(entry);
    if (!key) return;

    const stats = readObject(entry, ["totalShareStatistics", "shareStatistics"]);
    const metric = ensureMetric(byDay, key);
    metric.views += readNumber(stats, [
      "impressionCount",
      "impressionsCount",
      "uniqueImpressionsCount"
    ]);
    metric.clicks += readNumber(stats, ["clickCount", "clicksCount"]);
    metric.likes += readNumber(stats, ["likeCount", "likesCount"]);
    metric.comments += readNumber(stats, ["commentCount", "commentsCount"]);
    metric.reposts += readNumber(stats, ["shareCount", "sharesCount"]);
    metric.engagements = metric.likes + metric.comments + metric.reposts;
  });

  pageStats.forEach((entry) => {
    const key = extractDayKey(entry);
    if (!key) return;

    const stats = readObject(entry, ["totalPageStatistics", "pageStatistics"]);
    const metric = ensureMetric(byDay, key);
    metric.views += readNumber(stats, ["views", "pageViews", "viewCount"]);
    metric.clicks += readNumber(stats, ["clicks", "clickCount"]);
  });

  followerStats.forEach((entry) => {
    const key = extractDayKey(entry);
    if (!key) return;

    const metric = ensureMetric(byDay, key);
    metric.newFollows += readNumber(entry, [
      "followerGains",
      "organicFollowerGain",
      "paidFollowerGain"
    ]);
  });

  return Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

function ensureMetric(byDay: Map<string, DailyMetric>, dayKey: string): DailyMetric {
  const existing = byDay.get(dayKey);
  if (existing) return existing;

  const date = parseDayKey(dayKey);
  const metric: DailyMetric = {
    source: "linkedin",
    date,
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
  byDay.set(dayKey, metric);
  return metric;
}

function emptySnapshot(source: "disabled" | "error"): LinkedInApiSnapshot {
  return {
    daily: [],
    topPosts: [],
    topPostsByRate: [],
    contentTypes: [],
    bestTimes: [],
    timeOfDayAvailable: false,
    source
  };
}

function extractDayKey(entry: Record<string, unknown>): string | null {
  const range = readObject(entry, ["timeRange", "timeInterval"]);
  const start = readNumber(range, ["start", "time"]).valueOf();
  if (!start) return null;
  return toDayKey(new Date(start));
}

function readObject(
  input: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  for (const key of keys) {
    const value = input[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return {};
}

function readNumber(input: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = input[key];
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function parseDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function toDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeOrganizationUrn(value: string | undefined): string {
  if (!value) return "";
  if (value.startsWith("urn:li:organization:")) {
    return value;
  }
  return `urn:li:organization:${value}`;
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
