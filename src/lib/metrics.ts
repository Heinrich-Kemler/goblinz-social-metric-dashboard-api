import { existsSync, type Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { formatMonthLabel } from "@/lib/format";
import { loadLinkedInApiSnapshot } from "@/lib/providers/linkedin-api";
import { loadXApiSnapshot } from "@/lib/providers/x-api";

// ----------------------------
// Types
// ----------------------------

export type Platform = "x" | "linkedin";

export type DailyMetric = {
  source: Platform;
  date: Date;
  views: number;
  likes: number;
  comments: number;
  reposts: number;
  clicks: number;
  shares: number;
  bookmarks: number;
  profileVisits: number;
  engagements: number;
  videoViews: number;
  videoWatchViews: number;
  videoWatchTimeMs: number;
  videoCompletionRateSum: number;
  posts: number;
  newFollows: number;
  unfollows: number;
};

export type MonthSummary = {
  monthKey: string; // YYYY-MM
  label: string; // e.g., Jan 2026
  views: number;
  likes: number;
  comments: number;
  reposts: number;
  clicks: number;
  shares: number;
  bookmarks: number;
  profileVisits: number;
  engagements: number;
  videoViews: number;
  videoWatchViews: number;
  videoWatchTimeMs: number;
  videoCompletionRateSum: number;
  posts: number;
  newFollows: number;
  unfollows: number;
  days: number;
};

export type Coverage = {
  start: Date | null;
  end: Date | null;
  days: number;
};

export type DashboardData = {
  x: PlatformData;
  linkedin: PlatformData;
  combined: PlatformData;
  engagementMix: { label: string; value: number }[];
  mom: Record<string, number | null>;
  lastMonthLabel: string;
  previousMonthLabel: string;
  xTopPosts: XPostSummary[];
  xBestTimes: BestTimeSlot[];
  xTimeMatrix: BestTimeSlot[];
  xTimeOfDayAvailable: boolean;
  xPerPostStats: PerPostStats;
  linkedinTopPosts: LinkedInPostSummary[];
  linkedinTopPostsByRate: LinkedInPostSummary[];
  linkedinContentTypes: LinkedInContentTypeSummary[];
  linkedinTimeMatrix: BestTimeSlot[];
  linkedinPerPostStats: PerPostStats;
  dayOfWeek: DayOfWeekSummary[];
  bestTimes: BestTimeSlot[];
  timeOfDayAvailable: boolean;
  dataQuality: DataQualitySummary[];
  csvValidation: CsvValidation[];
  usingSampleData: boolean;
  sourceStates: SourceState[];
  setupChecks: SetupCheck[];
};

export type PlatformData = {
  daily: DailyMetric[];
  monthly: MonthSummary[];
  totals: MonthSummary;
  coverage: Coverage;
};

export type LinkedInPostSummary = {
  title: string;
  link: string;
  createdAt: Date;
  impressions: number;
  views: number;
  clicks: number;
  likes: number;
  comments: number;
  reposts: number;
  engagementRate: number | null;
  contentType: string;
};

export type XPostSummary = {
  text: string;
  link: string;
  createdAt: Date | null;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  engagements: number;
  engagementRate: number | null;
};

export type LinkedInContentTypeSummary = {
  type: string;
  posts: number;
  impressions: number;
  views: number;
  engagements: number;
};

export type DayOfWeekSummary = {
  day: string;
  averageViews: number;
  totalViews: number;
  days: number;
};

export type BestTimeSlot = {
  label: string;
  day: string;
  hour: number | null;
  posts: number;
  impressions: number;
  engagements: number;
  engagementRate: number | null;
};

export type PerPostStats = {
  averagePerPost: number | null;
  medianPerPost: number | null;
  averagePerPostLatestMonth: number | null;
  medianPerPostLatestMonth: number | null;
  latestMonthLabel: string;
};

type MetricKey = Exclude<keyof DailyMetric, "source" | "date">;

const METRIC_KEYS: MetricKey[] = [
  "views",
  "likes",
  "comments",
  "reposts",
  "clicks",
  "shares",
  "bookmarks",
  "profileVisits",
  "engagements",
  "videoViews",
  "videoWatchViews",
  "videoWatchTimeMs",
  "videoCompletionRateSum",
  "posts",
  "newFollows",
  "unfollows"
];

export type CsvValidation = {
  id: string;
  label: string;
  filePath: string;
  source: "raw" | "sample" | "missing";
  rowCount: number;
  missingRequired: string[];
  missingOptional: string[];
};

export type DataQualitySummary = {
  label: string;
  coverage: Coverage;
  expectedDays: number | null;
  missingDays: number | null;
  zeroViewDays: number;
};

export type SourceState = {
  platform: Platform;
  mode: "api" | "csv" | "hybrid";
  detail: string;
  note?: string;
  lastApiRefreshIso?: string | null;
};

export type SetupCheck = {
  id: string;
  label: string;
  status: "ok" | "warning" | "info";
  detail: string;
};

type DashboardOptions = {
  forceRefresh?: boolean;
};

type DataMode = "auto" | "api" | "csv";
type RefreshMode = "manual" | "auto";

// ----------------------------
// File locations (v1: local CSV files)
// ----------------------------

const DATA_DIR_RAW = path.join(process.cwd(), "Data", "raw");
const DATA_DIR_SAMPLE = path.join(process.cwd(), "Data", "sample");

const X_CSV = process.env.X_CSV_PATH ?? "x_account_analytics.csv";
const X_CSV_SAMPLE = "x_account_analytics_sample.csv";
const X_POSTS_CSV = process.env.X_POSTS_CSV_PATH ?? "x_post_analytics.csv";
const X_POSTS_CSV_SAMPLE = "x_post_analytics_sample.csv";
const X_VIDEO_OVERVIEW_CSV =
  process.env.X_VIDEO_OVERVIEW_CSV_PATH ?? "x_video_overview.csv";
const X_VIDEO_OVERVIEW_CSV_SAMPLE = "x_video_overview_sample.csv";
const LINKEDIN_CSV = process.env.LINKEDIN_CSV_PATH ?? "linkedin_metrics.csv";
const LINKEDIN_CSV_SAMPLE = "linkedin_metrics_sample.csv";
const LINKEDIN_POSTS_CSV =
  process.env.LINKEDIN_POSTS_CSV_PATH ?? "linkedin_posts.csv";
const LINKEDIN_POSTS_CSV_SAMPLE = "linkedin_posts_sample.csv";

// LinkedIn export uses MM/DD/YYYY in most locales. Change to "DMY" if needed.
const LINKEDIN_DATE_FORMAT: "MDY" | "DMY" = "MDY";
const X_DATA_MODE = resolveDataMode(process.env.X_DATA_MODE);
const LINKEDIN_DATA_MODE = resolveDataMode(process.env.LINKEDIN_DATA_MODE);
const API_REFRESH_MODE = resolveRefreshMode(process.env.API_REFRESH_MODE);

// ----------------------------
// Public API: used by the page
// ----------------------------

export async function getDashboardData(
  options: DashboardOptions = {}
): Promise<DashboardData> {
  const [xPostsData, linkedInPostsData, xApiSnapshot, linkedInApiSnapshot] = await Promise.all([
    loadXPostsData(),
    loadLinkedInPostsData(),
    loadXApiSnapshotForMode({ forceRefresh: options.forceRefresh }),
    loadLinkedInApiSnapshotForMode({ forceRefresh: options.forceRefresh })
  ]);
  const [xDailyResult, linkedInDailyResult] = await Promise.all([
    loadXDailyMetrics(),
    loadLinkedInDailyMetrics(linkedInPostsData.postsByDate)
  ]);

  const xSelection = selectMetricsForMode(
    X_DATA_MODE,
    xDailyResult.metrics,
    xApiSnapshot.daily
  );
  const linkedInSelection = selectMetricsForMode(
    LINKEDIN_DATA_MODE,
    linkedInDailyResult.metrics,
    linkedInApiSnapshot.daily
  );
  const useXApi = xSelection.usesApi;
  const useLinkedInApi = linkedInSelection.usesApi;
  const xMetrics = xSelection.metrics;
  const linkedinMetrics = linkedInSelection.metrics;
  const xTopPosts = selectXTopPosts({
    mode: X_DATA_MODE,
    csvTopPosts: xPostsData.topPosts,
    apiTopPosts: xApiSnapshot.topPosts
  });
  const xBestTimes = selectBestTimes({
    mode: X_DATA_MODE,
    csvBestTimes: xPostsData.bestTimes,
    apiBestTimes: xApiSnapshot.bestTimes
  });
  const xTimeMatrix = selectTimeMatrix({
    mode: X_DATA_MODE,
    csvTimeMatrix: xPostsData.timeMatrix,
    apiTimeMatrix: xApiSnapshot.timeMatrix
  });
  const xTimeOfDayAvailable = xSelection.usesApi
    ? xApiSnapshot.timeOfDayAvailable || xPostsData.timeOfDayAvailable
    : xPostsData.timeOfDayAvailable;
  const linkedinTopPosts =
    useLinkedInApi && linkedInApiSnapshot.topPosts.length > 0
      ? linkedInApiSnapshot.topPosts
      : linkedInPostsData.topPosts;
  const linkedinTopPostsByRate =
    useLinkedInApi && linkedInApiSnapshot.topPostsByRate.length > 0
      ? linkedInApiSnapshot.topPostsByRate
      : linkedInPostsData.topPostsByRate;
  const linkedinContentTypes =
    useLinkedInApi && linkedInApiSnapshot.contentTypes.length > 0
      ? linkedInApiSnapshot.contentTypes
      : linkedInPostsData.contentTypes;
  const linkedInBestTimes = selectBestTimes({
    mode: LINKEDIN_DATA_MODE,
    csvBestTimes: linkedInPostsData.bestTimes,
    apiBestTimes: linkedInApiSnapshot.bestTimes
  });
  const linkedinTimeMatrix = selectTimeMatrix({
    mode: LINKEDIN_DATA_MODE,
    csvTimeMatrix: linkedInPostsData.timeMatrix,
    apiTimeMatrix: linkedInApiSnapshot.timeMatrix
  });
  const linkedInTimeOfDayAvailable =
    useLinkedInApi && linkedInApiSnapshot.timeOfDayAvailable
      ? true
      : linkedInPostsData.timeOfDayAvailable;

  const xData = buildPlatformData(xMetrics);
  const linkedinData = buildPlatformData(linkedinMetrics);
  const combinedData = buildPlatformData([
    ...xMetrics,
    ...linkedinMetrics
  ]);

  const engagementMix = buildEngagementMix(combinedData.totals);
  const { mom, lastMonthLabel, previousMonthLabel } = calculateMomGrowth(
    combinedData.monthly
  );
  const dayOfWeek = buildDayOfWeekSummary(combinedData.daily);
  const xPerPostStats = buildPerPostStats(xMetrics);
  const linkedinPerPostStats = buildPerPostStats(linkedinMetrics);
  const dataQuality = [
    buildDataQuality("X", xMetrics),
    buildDataQuality("LinkedIn", linkedinMetrics),
    buildDataQuality("Combined", combinedData.daily)
  ];

  const csvValidation = [
    xDailyResult.validation,
    xDailyResult.videoValidation,
    xPostsData.validation,
    linkedInDailyResult.validation,
    linkedInPostsData.validation
  ];
  const usingSampleData = csvValidation.some((item) => {
    if (item.source !== "sample") return false;
    if (!xSelection.usesCsv && item.id.startsWith("x-")) return false;
    if (!linkedInSelection.usesCsv && item.id.startsWith("linkedin-")) return false;
    return true;
  });

  const sourceStates: SourceState[] = [
    buildXSourceState(xSelection, xApiSnapshot),
    buildLinkedInSourceState(linkedInSelection, linkedInApiSnapshot)
  ];
  const setupChecks = buildSetupChecks({
    useXApi,
    useXCsv: xSelection.usesCsv,
    useLinkedInApi,
    useLinkedInCsv: linkedInSelection.usesCsv,
    xApiSnapshot,
    linkedInApiSnapshot
  });

  return {
    x: xData,
    linkedin: linkedinData,
    combined: combinedData,
    engagementMix,
    mom,
    lastMonthLabel,
    previousMonthLabel,
    xTopPosts,
    xBestTimes,
    xTimeMatrix,
    xTimeOfDayAvailable,
    xPerPostStats,
    linkedinTopPosts,
    linkedinTopPostsByRate,
    linkedinContentTypes,
    linkedinTimeMatrix,
    linkedinPerPostStats,
    dayOfWeek,
    bestTimes: linkedInBestTimes,
    timeOfDayAvailable: linkedInTimeOfDayAvailable,
    dataQuality,
    csvValidation,
    usingSampleData,
    sourceStates,
    setupChecks
  };
}

// ----------------------------
// Loading + parsing helpers
// ----------------------------

type ColumnGroup = { label: string; fields: string[] };

type MetricSelection = {
  metrics: DailyMetric[];
  usesApi: boolean;
  usesCsv: boolean;
};

function resolveDataMode(raw: string | undefined): DataMode {
  const normalized = (raw ?? "auto").toLowerCase();
  if (normalized === "api" || normalized === "csv" || normalized === "auto") {
    return normalized;
  }
  return "auto";
}

function resolveRefreshMode(raw: string | undefined): RefreshMode {
  return (raw ?? "manual").toLowerCase() === "auto" ? "auto" : "manual";
}

async function loadXApiSnapshotForMode(
  options: DashboardOptions
): Promise<Awaited<ReturnType<typeof loadXApiSnapshot>>> {
  if (X_DATA_MODE === "csv") {
    return {
      daily: [],
      topPosts: [],
      bestTimes: [],
      timeMatrix: [],
      timeOfDayAvailable: false,
      source: "disabled",
      fetchedAt: null
    };
  }
  return loadXApiSnapshot({
    ...options,
    manualOnly: API_REFRESH_MODE === "manual"
  });
}

async function loadLinkedInApiSnapshotForMode(
  options: DashboardOptions
): Promise<Awaited<ReturnType<typeof loadLinkedInApiSnapshot>>> {
  if (LINKEDIN_DATA_MODE === "csv") {
    return {
      daily: [],
      topPosts: [],
      topPostsByRate: [],
      contentTypes: [],
      bestTimes: [],
      timeMatrix: [],
      timeOfDayAvailable: false,
      source: "disabled",
      fetchedAt: null
    };
  }
  return loadLinkedInApiSnapshot({
    ...options,
    manualOnly: API_REFRESH_MODE === "manual"
  });
}

function selectMetricsForMode(
  mode: DataMode,
  csvMetrics: DailyMetric[],
  apiMetrics: DailyMetric[]
): MetricSelection {
  if (mode === "csv") {
    return { metrics: csvMetrics, usesApi: false, usesCsv: true };
  }

  if (mode === "api") {
    if (apiMetrics.length > 0) {
      return { metrics: apiMetrics, usesApi: true, usesCsv: false };
    }
    return { metrics: csvMetrics, usesApi: false, usesCsv: true };
  }

  if (apiMetrics.length > 0) {
    return {
      metrics: mergeDailyMetrics([...csvMetrics, ...apiMetrics]),
      usesApi: true,
      usesCsv: true
    };
  }

  return { metrics: csvMetrics, usesApi: false, usesCsv: true };
}

function selectXTopPosts(args: {
  mode: DataMode;
  csvTopPosts: XPostSummary[];
  apiTopPosts: XPostSummary[];
}): XPostSummary[] {
  if (args.mode === "csv") {
    return args.csvTopPosts;
  }

  if (args.mode === "api") {
    return args.apiTopPosts.length > 0 ? args.apiTopPosts : args.csvTopPosts;
  }

  if (args.apiTopPosts.length === 0) {
    return args.csvTopPosts;
  }

  const byKey = new Map<string, XPostSummary>();
  [...args.csvTopPosts, ...args.apiTopPosts].forEach((post) => {
    const key = post.link || `${post.text}-${post.createdAt?.toISOString() ?? ""}`;
    const existing = byKey.get(key);
    if (!existing || post.impressions > existing.impressions) {
      byKey.set(key, post);
    }
  });

  return Array.from(byKey.values())
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);
}

function selectBestTimes(args: {
  mode: DataMode;
  csvBestTimes: BestTimeSlot[];
  apiBestTimes: BestTimeSlot[];
}): BestTimeSlot[] {
  if (args.mode === "csv") {
    return rankTopTimeSlots(args.csvBestTimes);
  }

  if (args.mode === "api") {
    return rankTopTimeSlots(
      args.apiBestTimes.length > 0 ? args.apiBestTimes : args.csvBestTimes
    );
  }

  if (args.apiBestTimes.length === 0) {
    return rankTopTimeSlots(args.csvBestTimes);
  }

  return rankTopTimeSlots(
    mergeTimeMatrixSlots([...args.csvBestTimes, ...args.apiBestTimes])
  );
}

function selectTimeMatrix(args: {
  mode: DataMode;
  csvTimeMatrix: BestTimeSlot[];
  apiTimeMatrix: BestTimeSlot[];
}): BestTimeSlot[] {
  if (args.mode === "csv") {
    return mergeTimeMatrixSlots(args.csvTimeMatrix);
  }

  if (args.mode === "api") {
    return mergeTimeMatrixSlots(
      args.apiTimeMatrix.length > 0 ? args.apiTimeMatrix : args.csvTimeMatrix
    );
  }

  if (args.apiTimeMatrix.length === 0) {
    return mergeTimeMatrixSlots(args.csvTimeMatrix);
  }

  return mergeTimeMatrixSlots([...args.csvTimeMatrix, ...args.apiTimeMatrix]);
}

function buildXSourceState(
  selection: MetricSelection,
  apiSnapshot: Awaited<ReturnType<typeof loadXApiSnapshot>>
): SourceState {
  if (selection.usesApi && selection.usesCsv) {
    return {
      platform: "x",
      mode: "hybrid",
      detail: "API + CSV",
      lastApiRefreshIso: apiSnapshot.fetchedAt?.toISOString() ?? null
    };
  }
  if (selection.usesApi) {
    return {
      platform: "x",
      mode: "api",
      detail: "API connected",
      lastApiRefreshIso: apiSnapshot.fetchedAt?.toISOString() ?? null
    };
  }
  if (apiSnapshot.source === "error" && apiSnapshot.error) {
    return {
      platform: "x",
      mode: "csv",
      detail: "CSV fallback",
      note: "X API returned an error. Check Setup Checklist for details."
    };
  }
  if (apiSnapshot.source === "api" && apiSnapshot.daily.length === 0 && X_DATA_MODE === "api") {
    return {
      platform: "x",
      mode: "csv",
      detail: "CSV fallback",
      note: "X API returned no usable daily rows. CSV remains active."
    };
  }
  if (apiSnapshot.source === "disabled" && X_DATA_MODE !== "csv") {
    return {
      platform: "x",
      mode: "csv",
      detail: "CSV fallback",
      note: "Set X_API_BEARER_TOKEN and X_API_USERNAME in .env.local to enable API mode."
    };
  }
  if (
    apiSnapshot.source === "paused" &&
    !(process.env.X_API_BEARER_TOKEN && process.env.X_API_USERNAME)
  ) {
    return {
      platform: "x",
      mode: "csv",
      detail: "CSV fallback",
      note: "Set X_API_BEARER_TOKEN and X_API_USERNAME in .env.local to enable API mode."
    };
  }
  if (apiSnapshot.source === "paused") {
    return {
      platform: "x",
      mode: "csv",
      detail: "CSV (API paused)",
      note:
        "API auto-pull is paused to control cost. Use Manual API Refresh when you want the latest API data.",
      lastApiRefreshIso: apiSnapshot.fetchedAt?.toISOString() ?? null
    };
  }
  return {
    platform: "x",
    mode: "csv",
    detail: "CSV only"
  };
}

function buildLinkedInSourceState(
  selection: MetricSelection,
  apiSnapshot: Awaited<ReturnType<typeof loadLinkedInApiSnapshot>>
): SourceState {
  if (selection.usesApi && selection.usesCsv) {
    return {
      platform: "linkedin",
      mode: "hybrid",
      detail: "API + CSV",
      lastApiRefreshIso: apiSnapshot.fetchedAt?.toISOString() ?? null
    };
  }
  if (selection.usesApi) {
    return {
      platform: "linkedin",
      mode: "api",
      detail: "API connected",
      lastApiRefreshIso: apiSnapshot.fetchedAt?.toISOString() ?? null
    };
  }
  if (apiSnapshot.source === "error" && apiSnapshot.error) {
    return {
      platform: "linkedin",
      mode: "csv",
      detail: "CSV fallback",
      note: "LinkedIn API returned an error. Check Setup Checklist for details."
    };
  }
  if (
    apiSnapshot.source === "api" &&
    apiSnapshot.daily.length === 0 &&
    LINKEDIN_DATA_MODE === "api"
  ) {
    return {
      platform: "linkedin",
      mode: "csv",
      detail: "CSV fallback",
      note: "LinkedIn API returned no usable daily rows. CSV remains active."
    };
  }
  if (apiSnapshot.source === "disabled" && LINKEDIN_DATA_MODE !== "csv") {
    return {
      platform: "linkedin",
      mode: "csv",
      detail: "CSV fallback",
      note: "Set LINKEDIN_API_ACCESS_TOKEN and LINKEDIN_ORGANIZATION_URN to enable API mode."
    };
  }
  if (
    apiSnapshot.source === "paused" &&
    !(process.env.LINKEDIN_API_ACCESS_TOKEN && process.env.LINKEDIN_ORGANIZATION_URN)
  ) {
    return {
      platform: "linkedin",
      mode: "csv",
      detail: "CSV fallback",
      note: "Set LINKEDIN_API_ACCESS_TOKEN and LINKEDIN_ORGANIZATION_URN to enable API mode."
    };
  }
  if (apiSnapshot.source === "paused") {
    return {
      platform: "linkedin",
      mode: "csv",
      detail: "CSV (API paused)",
      note:
        "API auto-pull is paused to control cost. Use Manual API Refresh when you want the latest API data.",
      lastApiRefreshIso: apiSnapshot.fetchedAt?.toISOString() ?? null
    };
  }
  return {
    platform: "linkedin",
    mode: "csv",
    detail: "CSV only"
  };
}

function buildSetupChecks(args: {
  useXApi: boolean;
  useXCsv: boolean;
  useLinkedInApi: boolean;
  useLinkedInCsv: boolean;
  xApiSnapshot: Awaited<ReturnType<typeof loadXApiSnapshot>>;
  linkedInApiSnapshot: Awaited<ReturnType<typeof loadLinkedInApiSnapshot>>;
}): SetupCheck[] {
  const checks: SetupCheck[] = [];
  const hasXCreds = Boolean(
    process.env.X_API_BEARER_TOKEN && process.env.X_API_USERNAME
  );
  const hasLinkedInCreds = Boolean(
    process.env.LINKEDIN_API_ACCESS_TOKEN && process.env.LINKEDIN_ORGANIZATION_URN
  );
  const hasPublicSecrets = Boolean(
    process.env.NEXT_PUBLIC_X_API_BEARER_TOKEN ||
      process.env.NEXT_PUBLIC_LINKEDIN_API_ACCESS_TOKEN
  );

  if (hasPublicSecrets) {
    checks.push({
      id: "public-secrets",
      label: "Public secret exposure check",
      status: "warning",
      detail:
        "Detected API token-like values in NEXT_PUBLIC env vars. Move all secrets to server-only env vars."
    });
  } else {
    checks.push({
      id: "server-only-secrets",
      label: "Server-only secrets check",
      status: "ok",
      detail:
        "No API token-like NEXT_PUBLIC env vars detected. Keep API keys in .env.local only."
    });
  }

  if (X_DATA_MODE === "csv") {
    checks.push({
      id: "x-mode-csv",
      label: "X source mode",
      status: "info",
      detail: "X_DATA_MODE=csv. API is disabled and CSV is authoritative."
    });
  } else if (!hasXCreds) {
    checks.push({
      id: "x-creds",
      label: "X API credentials",
      status: "warning",
      detail:
        "Set X_API_BEARER_TOKEN and X_API_USERNAME for API ingestion. CSV fallback is active."
    });
  } else if (args.xApiSnapshot.source === "paused") {
    checks.push({
      id: "x-manual-refresh",
      label: "X API refresh mode",
      status: "info",
      detail:
        "API auto-pull is paused to reduce spend. Use Manual API Refresh to pull the latest API snapshot."
    });
  } else if (args.useXApi) {
    checks.push({
      id: "x-connected",
      label: "X API connectivity",
      status: "ok",
      detail: args.useXCsv
        ? `Connected. Loaded ${args.xApiSnapshot.daily.length} API daily rows and merged with CSV history.`
        : `Connected. Loaded ${args.xApiSnapshot.daily.length} daily rows from API.`
    });
  } else if (args.xApiSnapshot.source === "api" && X_DATA_MODE === "api") {
    checks.push({
      id: "x-empty",
      label: "X API connectivity",
      status: "warning",
      detail: "API returned no usable daily rows. CSV fallback is active."
    });
  } else if (args.xApiSnapshot.source === "error") {
    checks.push({
      id: "x-error",
      label: "X API connectivity",
      status: "warning",
      detail: `API failed, CSV fallback active. ${args.xApiSnapshot.error ?? ""}`.trim()
    });
  }

  if (LINKEDIN_DATA_MODE === "csv") {
    checks.push({
      id: "linkedin-mode-csv",
      label: "LinkedIn source mode",
      status: "info",
      detail: "LINKEDIN_DATA_MODE=csv. API is disabled and CSV is authoritative."
    });
  } else if (!hasLinkedInCreds) {
    checks.push({
      id: "linkedin-creds",
      label: "LinkedIn API credentials",
      status: "warning",
      detail:
        "Set LINKEDIN_API_ACCESS_TOKEN and LINKEDIN_ORGANIZATION_URN for API ingestion. CSV fallback is active."
    });
  } else if (args.linkedInApiSnapshot.source === "paused") {
    checks.push({
      id: "linkedin-manual-refresh",
      label: "LinkedIn API refresh mode",
      status: "info",
      detail:
        "API auto-pull is paused to reduce spend. Use Manual API Refresh to pull the latest API snapshot."
    });
  } else if (args.useLinkedInApi) {
    checks.push({
      id: "linkedin-connected",
      label: "LinkedIn API connectivity",
      status: "ok",
      detail: args.useLinkedInCsv
        ? `Connected. Loaded ${args.linkedInApiSnapshot.daily.length} API daily rows and merged with CSV history.`
        : `Connected. Loaded ${args.linkedInApiSnapshot.daily.length} daily rows from API.`
    });
  } else if (
    args.linkedInApiSnapshot.source === "api" &&
    LINKEDIN_DATA_MODE === "api"
  ) {
    checks.push({
      id: "linkedin-empty",
      label: "LinkedIn API connectivity",
      status: "warning",
      detail: "API returned no usable daily rows. CSV fallback is active."
    });
  } else if (args.linkedInApiSnapshot.source === "error") {
    checks.push({
      id: "linkedin-error",
      label: "LinkedIn API connectivity",
      status: "warning",
      detail: `API failed, CSV fallback active. ${
        args.linkedInApiSnapshot.error ?? ""
      }`.trim()
    });
  }

  checks.push({
    id: "billing",
    label: "API usage cost notice",
    status: "info",
    detail:
      "API usage can incur cost. Keep CSV fallback enabled and use manual refresh to limit API calls."
  });

  return checks;
}

async function listCsvFiles(
  dir: string,
  include: (fileName: string) => boolean
): Promise<string[]> {
  const matches: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.toLowerCase().endsWith(".csv")) {
        continue;
      }
      if (!include(entry.name)) {
        continue;
      }
      matches.push(fullPath);
    }
  }

  try {
    await walk(dir);
    return matches.sort();
  } catch (error) {
    return [];
  }
}

function matchesAny(fileName: string, tokens: string[]): boolean {
  const lower = fileName.toLowerCase();
  return tokens.some((token) => lower.includes(token));
}

async function resolveXDailyFiles(): Promise<string[]> {
  if (process.env.X_CSV_PATH) {
    return [process.env.X_CSV_PATH];
  }
  const matches = await listCsvFiles(DATA_DIR_RAW, (name) =>
    matchesAny(name, ["x_account_analytics", "x account analytics"])
  );
  return matches.length > 0 ? matches : [X_CSV];
}

async function resolveXVideoOverviewFiles(): Promise<string[]> {
  if (process.env.X_VIDEO_OVERVIEW_CSV_PATH) {
    return [process.env.X_VIDEO_OVERVIEW_CSV_PATH];
  }
  const matches = await listCsvFiles(DATA_DIR_RAW, (name) =>
    matchesAny(name, ["x_video_overview", "video_overview", "video overview"])
  );
  return matches.length > 0 ? matches : [X_VIDEO_OVERVIEW_CSV];
}

async function resolveXPostFiles(): Promise<string[]> {
  if (process.env.X_POSTS_CSV_PATH) {
    return [process.env.X_POSTS_CSV_PATH];
  }
  const matches = await listCsvFiles(DATA_DIR_RAW, (name) =>
    matchesAny(name, [
      "x_post_analytics",
      "x post analytics",
      "account_analytics_content_"
    ])
  );
  return matches.length > 0 ? matches : [X_POSTS_CSV];
}

async function resolveLinkedInMetricFiles(): Promise<string[]> {
  if (process.env.LINKEDIN_CSV_PATH) {
    return [process.env.LINKEDIN_CSV_PATH];
  }
  const matches = await listCsvFiles(DATA_DIR_RAW, (name) =>
    matchesAny(name, ["linkedin_metrics", "linkedin metrics"])
  );
  return matches.length > 0 ? matches : [LINKEDIN_CSV];
}

async function resolveLinkedInPostsFiles(): Promise<string[]> {
  if (process.env.LINKEDIN_POSTS_CSV_PATH) {
    return [process.env.LINKEDIN_POSTS_CSV_PATH];
  }
  const matches = await listCsvFiles(DATA_DIR_RAW, (name) =>
    matchesAny(name, ["linkedin_posts", "linkedin posts", "all posts"])
  );
  return matches.length > 0 ? matches : [LINKEDIN_POSTS_CSV];
}

type CsvGroupSource = {
  texts: string[];
  filePaths: string[];
  source: "raw" | "sample" | "missing";
};

// Prefer raw user exports, but fall back to sample files so the UI never crashes.
async function readCsvGroupWithFallback(
  rawFiles: string[],
  sampleFile: string
): Promise<CsvGroupSource> {
  const rawPaths = Array.from(
    new Set(rawFiles.map((file) => resolveDataPath(file, DATA_DIR_RAW)))
  );
  const existingRawPaths = rawPaths.filter((filePath) => existsSync(filePath));

  if (existingRawPaths.length > 0) {
    const texts = await Promise.all(
      existingRawPaths.map((filePath) => fs.readFile(filePath, "utf-8"))
    );
    return {
      texts,
      filePaths: existingRawPaths,
      source: "raw"
    };
  }

  const samplePath = resolveDataPath(sampleFile, DATA_DIR_SAMPLE);
  if (existsSync(samplePath)) {
    return {
      texts: [await fs.readFile(samplePath, "utf-8")],
      filePaths: [samplePath],
      source: "sample"
    };
  }

  return {
    texts: [],
    filePaths: rawPaths,
    source: "missing"
  };
}

function formatFilePathLabel(filePaths: string[]): string {
  if (!filePaths || filePaths.length === 0) return "n/a";
  if (filePaths.length === 1) {
    return path.relative(process.cwd(), filePaths[0]);
  }
  const uniqueDirs = Array.from(
    new Set(filePaths.map((filePath) => path.relative(process.cwd(), path.dirname(filePath))))
  );
  const dirLabel = uniqueDirs.length === 1 ? uniqueDirs[0] : "Data/raw";
  return `${dirLabel} (${filePaths.length} files)`;
}

// Summarize which required and optional columns are missing for the UI.
function buildCsvValidation(args: {
  id: string;
  label: string;
  filePaths: string[];
  source: "raw" | "sample" | "missing";
  rowCount: number;
  headers: string[];
  requiredGroups: ColumnGroup[];
  optionalGroups: ColumnGroup[];
}): CsvValidation {
  const headersLower = new Set(args.headers.map((header) => header.toLowerCase()));
  const missingRequired = findMissingGroups(headersLower, args.requiredGroups);
  const missingOptional = findMissingGroups(headersLower, args.optionalGroups);

  return {
    id: args.id,
    label: args.label,
    filePath: formatFilePathLabel(args.filePaths),
    source: args.source,
    rowCount: args.rowCount,
    missingRequired,
    missingOptional
  };
}

function findMissingGroups(
  headersLower: Set<string>,
  groups: ColumnGroup[]
): string[] {
  return groups
    .filter((group) =>
      group.fields.every((field) => !headersLower.has(field.toLowerCase()))
    )
    .map((group) => group.label);
}

async function loadXDailyMetrics(): Promise<{
  metrics: DailyMetric[];
  validation: CsvValidation;
  videoValidation: CsvValidation;
}> {
  const { videoMap, validation: videoValidation } = await loadXVideoOverviewByDate();
  const files = await resolveXDailyFiles();
  const sourceGroup = await readCsvGroupWithFallback(files, X_CSV_SAMPLE);
  const parsedGroups = sourceGroup.texts.map((text) =>
    parseCsvWithHeader(text, "Date")
  );
  const headers = Array.from(
    new Set(parsedGroups.flatMap((group) => group.headers))
  );
  const rows = parsedGroups.flatMap((group) => group.rows);

  const validation = buildCsvValidation({
    id: "x-daily",
    label: "X account analytics",
    filePaths: sourceGroup.filePaths,
    source: sourceGroup.source,
    rowCount: rows.length,
    headers,
    requiredGroups: [
      { label: "Date", fields: ["Date"] },
      { label: "Impressions", fields: ["Impressions"] }
    ],
    optionalGroups: [
      { label: "Likes", fields: ["Likes"] },
      { label: "Replies", fields: ["Replies"] },
      { label: "Reposts", fields: ["Reposts", "Retweets"] },
      { label: "Shares", fields: ["Shares"] },
      { label: "Bookmarks", fields: ["Bookmarks"] },
      { label: "Profile visits", fields: ["Profile visits"] },
      { label: "Engagements", fields: ["Engagements"] },
      { label: "Video views", fields: ["Video views"] },
      { label: "Create Post", fields: ["Create Post"] },
      { label: "New follows", fields: ["New follows"] },
      { label: "Unfollows", fields: ["Unfollows"] }
    ]
  });

  const metrics = rows
    .map((row) => {
      const date = parseXDate(String(pickField(row, ["Date"])));
      if (!date) return null;

      const video = videoMap.get(toDayKey(date));
      const videoWatchViews = video?.views ?? 0;
      const videoWatchTimeMs = video?.watchTimeMs ?? 0;
      const videoCompletionRateSum = video
        ? video.completionRate * video.views
        : 0;
      const baseVideoViews = toNumber(pickField(row, ["Video views"]));

      return {
        source: "x" as const,
        date,
        views: toNumber(pickField(row, ["Impressions"])),
        likes: toNumber(pickField(row, ["Likes"])),
        comments: toNumber(pickField(row, ["Replies"])),
        reposts:
          toNumber(pickField(row, ["Reposts", "Retweets"])) +
          toNumber(pickField(row, ["Shares"])),
        clicks: 0,
        shares: toNumber(pickField(row, ["Shares"])),
        bookmarks: toNumber(pickField(row, ["Bookmarks"])),
        profileVisits: toNumber(pickField(row, ["Profile visits"])),
        engagements: toNumber(pickField(row, ["Engagements"])),
        videoViews: baseVideoViews || videoWatchViews,
        videoWatchViews,
        videoWatchTimeMs,
        videoCompletionRateSum,
        posts: toNumber(pickField(row, ["Create Post"])),
        newFollows: toNumber(pickField(row, ["New follows"])),
        unfollows: toNumber(pickField(row, ["Unfollows"]))
      };
    })
    .filter(Boolean) as DailyMetric[];

  return { metrics: mergeDailyMetrics(metrics), validation, videoValidation };
}

async function loadLinkedInDailyMetrics(
  postsByDate: Map<string, number>
): Promise<{ metrics: DailyMetric[]; validation: CsvValidation }> {
  const files = await resolveLinkedInMetricFiles();
  const sourceGroup = await readCsvGroupWithFallback(files, LINKEDIN_CSV_SAMPLE);
  const parsedGroups = sourceGroup.texts.map((text) =>
    parseLinkedInCsvRows(text, "Date")
  );
  const headers = Array.from(
    new Set(parsedGroups.flatMap((group) => group.headers))
  );
  const rows = parsedGroups.flatMap((group) => group.rows);

  const validation = buildCsvValidation({
    id: "linkedin-daily",
    label: "LinkedIn daily metrics",
    filePaths: sourceGroup.filePaths,
    source: sourceGroup.source,
    rowCount: rows.length,
    headers,
    requiredGroups: [
      { label: "Date", fields: ["Date"] },
      {
        label: "Impressions",
        fields: ["Impressions (total)", "Impressions", "Impressions (organic)"]
      }
    ],
    optionalGroups: [
      { label: "Clicks", fields: ["Clicks (total)", "Clicks", "Clicks (organic)"] },
      {
        label: "Reactions",
        fields: ["Reactions (total)", "Reactions", "Reactions (organic)"]
      },
      {
        label: "Comments",
        fields: ["Comments (total)", "Comments", "Comments (organic)"]
      },
      {
        label: "Reposts",
        fields: ["Reposts (total)", "Reposts", "Reposts (organic)", "Shares"]
      }
    ]
  });

  const metrics = rows
    .map((row) => {
      const dateValue = pickField(row, ["Date"]);
      const date = parseLinkedInDate(dateValue);
      if (!date) return null;

      return {
        source: "linkedin" as const,
        date,
        views: toNumber(
          pickField(row, [
            "Impressions (total)",
            "Impressions",
            "Impressions (organic)"
          ])
        ),
        clicks: toNumber(
          pickField(row, [
            "Clicks (total)",
            "Clicks",
            "Clicks (organic)"
          ])
        ),
        shares: 0,
        bookmarks: 0,
        profileVisits: 0,
        likes: toNumber(
          pickField(row, [
            "Reactions (total)",
            "Reactions",
            "Reactions (organic)"
          ])
        ),
        comments: toNumber(
          pickField(row, [
            "Comments (total)",
            "Comments",
            "Comments (organic)"
          ])
        ),
        reposts: toNumber(
          pickField(row, [
            "Reposts (total)",
            "Reposts",
            "Reposts (organic)",
            "Shares"
          ])
        ),
        engagements: 0,
        videoViews: 0,
        videoWatchViews: 0,
        videoWatchTimeMs: 0,
        videoCompletionRateSum: 0,
        posts: postsByDate.get(toDayKey(date)) ?? 0,
        newFollows: 0,
        unfollows: 0
      };
    })
    .filter(Boolean) as DailyMetric[];

  return { metrics: mergeDailyMetrics(metrics), validation };
}

// ----------------------------
// Aggregation helpers
// ----------------------------

function mergeDailyMetrics(metrics: DailyMetric[]): DailyMetric[] {
  const byDay = new Map<string, DailyMetric>();

  metrics.forEach((metric) => {
    const key = `${metric.source}-${toDayKey(metric.date)}`;
    const existing = byDay.get(key);

    if (!existing) {
      byDay.set(key, metric);
      return;
    }

    // Same day can appear in multiple monthly exports. Keep the most complete
    // values without double-counting by taking the max per metric.
    const merged: DailyMetric = { ...existing };
    METRIC_KEYS.forEach((field) => {
      merged[field] = Math.max(existing[field], metric[field]);
    });
    byDay.set(key, merged);
  });

  return Array.from(byDay.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
}

function mergeTimeMatrixSlots(slots: BestTimeSlot[]): BestTimeSlot[] {
  const byKey = new Map<string, BestTimeSlot>();

  slots.forEach((slot) => {
    const key = `${slot.day}-${slot.hour ?? "day"}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...slot });
      return;
    }

    existing.posts += slot.posts;
    existing.impressions += slot.impressions;
    existing.engagements += slot.engagements;
    existing.engagementRate = existing.impressions
      ? existing.engagements / existing.impressions
      : null;
  });

  return Array.from(byKey.values())
    .filter((slot) => slot.posts > 0)
    .sort((a, b) => {
      const dayDiff = dayOrder(a.day) - dayOrder(b.day);
      if (dayDiff !== 0) return dayDiff;
      if (a.hour === null && b.hour === null) return 0;
      if (a.hour === null) return -1;
      if (b.hour === null) return 1;
      return a.hour - b.hour;
    });
}

function rankTopTimeSlots(slots: BestTimeSlot[]): BestTimeSlot[] {
  return [...slots]
    .filter((slot) => slot.posts > 0)
    .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0))
    .slice(0, 5);
}

function dayOrder(day: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

function buildPlatformData(daily: DailyMetric[]): PlatformData {
  const monthly = aggregateByMonth(daily);
  const totals = summarizeTotals(monthly);
  const coverage = buildCoverage(daily);

  return { daily, monthly, totals, coverage };
}

function aggregateByMonth(daily: DailyMetric[]): MonthSummary[] {
  const buckets = new Map<string, MonthSummary>();

  daily.forEach((metric) => {
    const monthKey = toMonthKey(metric.date);
    const existing = buckets.get(monthKey);

    if (!existing) {
      buckets.set(monthKey, {
        monthKey,
        label: formatMonthLabel(monthKey),
        views: metric.views,
        likes: metric.likes,
        comments: metric.comments,
        reposts: metric.reposts,
        clicks: metric.clicks,
        shares: metric.shares,
        bookmarks: metric.bookmarks,
        profileVisits: metric.profileVisits,
        engagements: metric.engagements,
        videoViews: metric.videoViews,
        videoWatchViews: metric.videoWatchViews,
        videoWatchTimeMs: metric.videoWatchTimeMs,
        videoCompletionRateSum: metric.videoCompletionRateSum,
        posts: metric.posts,
        newFollows: metric.newFollows,
        unfollows: metric.unfollows,
        days: 1
      });
      return;
    }

    existing.views += metric.views;
    existing.likes += metric.likes;
    existing.comments += metric.comments;
    existing.reposts += metric.reposts;
    existing.clicks += metric.clicks;
    existing.shares += metric.shares;
    existing.bookmarks += metric.bookmarks;
    existing.profileVisits += metric.profileVisits;
    existing.engagements += metric.engagements;
    existing.videoViews += metric.videoViews;
    existing.videoWatchViews += metric.videoWatchViews;
    existing.videoWatchTimeMs += metric.videoWatchTimeMs;
    existing.videoCompletionRateSum += metric.videoCompletionRateSum;
    existing.posts += metric.posts;
    existing.newFollows += metric.newFollows;
    existing.unfollows += metric.unfollows;
    existing.days += 1;
  });

  return Array.from(buckets.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );
}

function summarizeTotals(monthly: MonthSummary[]): MonthSummary {
  return monthly.reduce(
    (acc, month) => {
      acc.views += month.views;
      acc.likes += month.likes;
      acc.comments += month.comments;
      acc.reposts += month.reposts;
      acc.clicks += month.clicks;
      acc.shares += month.shares;
      acc.bookmarks += month.bookmarks;
      acc.profileVisits += month.profileVisits;
      acc.engagements += month.engagements;
      acc.videoViews += month.videoViews;
      acc.videoWatchViews += month.videoWatchViews;
      acc.videoWatchTimeMs += month.videoWatchTimeMs;
      acc.videoCompletionRateSum += month.videoCompletionRateSum;
      acc.posts += month.posts;
      acc.newFollows += month.newFollows;
      acc.unfollows += month.unfollows;
      acc.days += month.days;
      return acc;
    },
    {
      monthKey: "total",
      label: "Total",
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
      unfollows: 0,
      days: 0
    }
  );
}

function buildCoverage(daily: DailyMetric[]): Coverage {
  if (daily.length === 0) {
    return { start: null, end: null, days: 0 };
  }

  const sorted = [...daily].sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    start: sorted[0].date,
    end: sorted[sorted.length - 1].date,
    days: sorted.length
  };
}

// Coverage + gaps help spot missing days or empty exports quickly.
function buildDataQuality(label: string, daily: DailyMetric[]): DataQualitySummary {
  const coverage = buildCoverage(daily);
  if (!coverage.start || !coverage.end) {
    return {
      label,
      coverage,
      expectedDays: null,
      missingDays: null,
      zeroViewDays: 0
    };
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const expectedDays =
    Math.round((coverage.end.getTime() - coverage.start.getTime()) / dayMs) + 1;
  const missingDays = Math.max(expectedDays - coverage.days, 0);
  const zeroViewDays = daily.filter((metric) => metric.views === 0).length;

  return {
    label,
    coverage,
    expectedDays,
    missingDays,
    zeroViewDays
  };
}

function buildEngagementMix(totals: MonthSummary): { label: string; value: number }[] {
  return [
    { label: "Likes", value: totals.likes },
    { label: "Comments", value: totals.comments },
    { label: "Reposts", value: totals.reposts }
  ].filter((entry) => entry.value > 0);
}

function buildDayOfWeekSummary(daily: DailyMetric[]): DayOfWeekSummary[] {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDate = new Map<string, { date: Date; views: number }>();

  daily.forEach((metric) => {
    const key = toDayKey(metric.date);
    const existing = byDate.get(key) ?? { date: metric.date, views: 0 };
    existing.views += metric.views;
    byDate.set(key, existing);
  });

  const summary = dayNames.map((day) => ({
    day,
    averageViews: 0,
    totalViews: 0,
    days: 0
  }));

  byDate.forEach((entry) => {
    const index = entry.date.getUTCDay();
    const bucket = summary[index];
    bucket.totalViews += entry.views;
    bucket.days += 1;
  });

  summary.forEach((bucket) => {
    bucket.averageViews = bucket.days ? bucket.totalViews / bucket.days : 0;
  });

  return summary;
}

function buildPerPostStats(daily: DailyMetric[]): PerPostStats {
  const withPosts = daily.filter((metric) => metric.posts > 0);
  if (withPosts.length === 0) {
    return {
      averagePerPost: null,
      medianPerPost: null,
      averagePerPostLatestMonth: null,
      medianPerPostLatestMonth: null,
      latestMonthLabel: "n/a"
    };
  }

  const latestMetric = [...withPosts].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  )[withPosts.length - 1];
  const latestMonthKey = toMonthKey(latestMetric.date);
  const latestMonthRows = withPosts.filter(
    (metric) => toMonthKey(metric.date) === latestMonthKey
  );

  const averagePerPost = calculateAveragePerPost(withPosts);
  const medianPerPost = calculateMedian(
    withPosts.map((metric) => metric.engagements / metric.posts)
  );
  const averagePerPostLatestMonth = calculateAveragePerPost(latestMonthRows);
  const medianPerPostLatestMonth = calculateMedian(
    latestMonthRows.map((metric) => metric.engagements / metric.posts)
  );

  return {
    averagePerPost,
    medianPerPost,
    averagePerPostLatestMonth,
    medianPerPostLatestMonth,
    latestMonthLabel: formatMonthLabel(latestMonthKey)
  };
}

function calculateAveragePerPost(rows: DailyMetric[]): number | null {
  const totalPosts = rows.reduce((sum, row) => sum + row.posts, 0);
  if (!totalPosts) return null;
  const totalEngagements = rows.reduce((sum, row) => sum + row.engagements, 0);
  return totalEngagements / totalPosts;
}

function calculateMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

async function loadXVideoOverviewByDate(): Promise<{
  videoMap: Map<string, { views: number; watchTimeMs: number; completionRate: number }>;
  validation: CsvValidation;
}> {
  const videoMap = new Map<
    string,
    { views: number; watchTimeMs: number; completionRate: number }
  >();
  const files = await resolveXVideoOverviewFiles();
  const sourceGroup = await readCsvGroupWithFallback(
    files,
    X_VIDEO_OVERVIEW_CSV_SAMPLE
  );
  const parsedGroups = sourceGroup.texts.map((text) =>
    parseCsvWithHeader(text, "Date")
  );
  const headers = Array.from(
    new Set(parsedGroups.flatMap((group) => group.headers))
  );
  const rows = parsedGroups.flatMap((group) => group.rows);

  const validation = buildCsvValidation({
    id: "x-video-overview",
    label: "X video overview",
    filePaths: sourceGroup.filePaths,
    source: sourceGroup.source,
    rowCount: rows.length,
    headers,
    requiredGroups: [
      { label: "Date", fields: ["Date"] },
      { label: "Views", fields: ["Views"] },
      { label: "Watch Time (ms)", fields: ["Watch Time (ms)"] }
    ],
    optionalGroups: [{ label: "Completion Rate", fields: ["Completion Rate"] }]
  });

  rows.forEach((row) => {
    const date = parseXDate(String(pickField(row, ["Date"])));
    if (!date) return;

    const views = toNumber(pickField(row, ["Views"]));
    const watchTimeMs = toNumber(pickField(row, ["Watch Time (ms)"]));
    const completionRate = toNumber(pickField(row, ["Completion Rate"])) / 100;
    const key = toDayKey(date);
    const existing = videoMap.get(key);

    if (
      !existing ||
      views > existing.views ||
      (views === existing.views && watchTimeMs > existing.watchTimeMs)
    ) {
      videoMap.set(key, { views, watchTimeMs, completionRate });
    }
  });

  return { videoMap, validation };
}

async function loadXPostsData(): Promise<{
  topPosts: XPostSummary[];
  bestTimes: BestTimeSlot[];
  timeMatrix: BestTimeSlot[];
  timeOfDayAvailable: boolean;
  validation: CsvValidation;
}> {
  const timeSlotMap = new Map<string, BestTimeSlot>();
  let timeOfDayAvailable = false;
  const files = await resolveXPostFiles();
  const sourceGroup = await readCsvGroupWithFallback(files, X_POSTS_CSV_SAMPLE);
  const parsedGroups = sourceGroup.texts.map((text) =>
    parseCsvWithHeader(text, "Impressions")
  );
  const headers = Array.from(
    new Set(parsedGroups.flatMap((group) => group.headers))
  );
  const rows = parsedGroups.flatMap((group) => group.rows);

  const validation = buildCsvValidation({
    id: "x-posts",
    label: "X post analytics",
    filePaths: sourceGroup.filePaths,
    source: sourceGroup.source,
    rowCount: rows.length,
    headers,
    requiredGroups: [
      { label: "Impressions", fields: ["Impressions"] },
      { label: "Post text or link", fields: ["Tweet text", "Text", "Post text", "Post", "Tweet", "Tweet permalink", "Post Link", "Permalink"] }
    ],
    optionalGroups: [
      { label: "Likes", fields: ["Likes"] },
      { label: "Replies", fields: ["Replies"] },
      { label: "Reposts", fields: ["Reposts", "Retweets", "Retweets (organic)"] },
      { label: "Engagements", fields: ["Engagements"] },
      { label: "Engagement rate", fields: ["Engagement rate"] },
      { label: "Created at", fields: ["Time", "time", "Created at", "Date"] }
    ]
  });

  const posts = rows
    .map((row) => {
      const impressions = toNumber(pickField(row, ["Impressions"]));
      const likes = toNumber(pickField(row, ["Likes"]));
      const replies = toNumber(pickField(row, ["Replies"]));
      const reposts = toNumber(
        pickField(row, ["Reposts", "Retweets", "Retweets (organic)"])
      );
      const engagements = toNumber(pickField(row, ["Engagements"]));
      const engagementRate =
        parseRate(pickField(row, ["Engagement rate"])) ??
        calculateEngagementRate(impressions, likes, replies, reposts);

      const text = decodeHtmlEntities(
        String(
          pickField(row, ["Tweet text", "Text", "Post text", "Tweet", "Post"])
        ).trim()
      );
      const link = String(
        pickField(row, [
          "Post Link",
          "Tweet permalink",
          "URL",
          "Tweet URL",
          "Permalink"
        ])
      ).trim();
      const createdAt = parseXPostDate(
        pickField(row, ["time", "Time", "Created at", "Date"])
      );
      const rawCreatedAt = String(
        pickField(row, ["time", "Time", "Created at", "Date"]) ?? ""
      ).trim();
      const hasTime = rawCreatedAt.includes(":");
      if (hasTime) {
        timeOfDayAvailable = true;
      }

      if (!text && !link) return null;

      return {
        text: sanitizeTitle(text),
        link,
        createdAt,
        impressions,
        likes,
        replies,
        reposts,
        engagements,
        engagementRate,
        hasTime
      } as XPostSummary & { hasTime: boolean };
    })
    .filter(Boolean) as (XPostSummary & { hasTime: boolean })[];

  const deduped = new Map<string, XPostSummary & { hasTime: boolean }>();
  posts.forEach((post) => {
    const key = post.link || `${post.text}-${post.createdAt?.toISOString() ?? ""}`;
    const existing = deduped.get(key);
    if (
      !existing ||
      post.impressions > existing.impressions ||
      (post.impressions === existing.impressions && post.hasTime && !existing.hasTime)
    ) {
      deduped.set(key, post);
    }
  });

  const uniquePosts = Array.from(deduped.values());
  uniquePosts.forEach((post) => {
    if (!post.createdAt) return;
    const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
      post.createdAt.getUTCDay()
    ];
    const hour = post.hasTime ? post.createdAt.getUTCHours() : null;
    const slotKey = hour === null ? dayName : `${dayName}-${hour}`;
    const slot =
      timeSlotMap.get(slotKey) ?? {
        label: hour === null ? dayName : `${dayName} ${String(hour).padStart(2, "0")}:00`,
        day: dayName,
        hour,
        posts: 0,
        impressions: 0,
        engagements: 0,
        engagementRate: null
      };

    slot.posts += 1;
    slot.impressions += post.impressions;
    slot.engagements += post.engagements || post.likes + post.replies + post.reposts;
    slot.engagementRate = slot.impressions ? slot.engagements / slot.impressions : null;
    timeSlotMap.set(slotKey, slot);
  });

  const topPosts = uniquePosts
    .sort((a, b) => b.impressions - a.impressions)
    .map(({ hasTime, ...summary }) => summary)
    .slice(0, 5);

  const timeMatrix = mergeTimeMatrixSlots(Array.from(timeSlotMap.values()));
  const bestTimes = rankTopTimeSlots(timeMatrix);

  return { topPosts, bestTimes, timeMatrix, timeOfDayAvailable, validation };
}

function calculateMomGrowth(monthly: MonthSummary[]): {
  mom: Record<string, number | null>;
  lastMonthLabel: string;
  previousMonthLabel: string;
} {
  if (monthly.length < 2) {
    return {
      mom: {
        views: null,
        likes: null,
        comments: null,
        reposts: null,
        posts: null
      },
      lastMonthLabel: monthly[0]?.label ?? "n/a",
      previousMonthLabel: "n/a"
    };
  }

  const last = monthly[monthly.length - 1];
  const prev = monthly[monthly.length - 2];

  return {
    mom: {
      views: percentDelta(prev.views, last.views),
      likes: percentDelta(prev.likes, last.likes),
      comments: percentDelta(prev.comments, last.comments),
      reposts: percentDelta(prev.reposts, last.reposts),
      posts: percentDelta(prev.posts, last.posts)
    },
    lastMonthLabel: last.label,
    previousMonthLabel: prev.label
  };
}

// ----------------------------
// Parsing + normalization utilities
// ----------------------------

function parseLinkedInCsvRows(
  csvText: string,
  headerLabel: string
): { headers: string[]; rows: Record<string, unknown>[] } {
  return parseCsvWithHeader(csvText, headerLabel);
}

function parseCsvWithHeader(
  csvText: string,
  headerLabel: string
): { headers: string[]; rows: Record<string, unknown>[] } {
  try {
    const rawRows = parseCsv(csvText, {
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true
    }) as string[][];

    const target = headerLabel.trim().toLowerCase();
    const headerRowIndex = rawRows.findIndex((row) =>
      row.some((cell) => String(cell).trim().toLowerCase() === target)
    );

    if (headerRowIndex === -1) {
      return { headers: [], rows: [] };
    }

    const headers = rawRows[headerRowIndex].map((cell) => String(cell).trim());
    const rows = rawRows
      .slice(headerRowIndex + 1)
      .filter((row) => row.some((cell) => String(cell).trim() !== ""))
      .map((row) =>
        headers.reduce<Record<string, unknown>>((acc, header, index) => {
          acc[header] = row[index] ?? "";
          return acc;
        }, {})
      );

    return { headers, rows };
  } catch (error) {
    return { headers: [], rows: [] };
  }
}

async function loadLinkedInPostsData(): Promise<{
  postsByDate: Map<string, number>;
  topPosts: LinkedInPostSummary[];
  topPostsByRate: LinkedInPostSummary[];
  contentTypes: LinkedInContentTypeSummary[];
  bestTimes: BestTimeSlot[];
  timeMatrix: BestTimeSlot[];
  timeOfDayAvailable: boolean;
  validation: CsvValidation;
}> {
  const postsByDate = new Map<string, number>();
  const contentTypeMap = new Map<string, LinkedInContentTypeSummary>();
  const timeSlotMap = new Map<string, BestTimeSlot>();
  let timeOfDayAvailable = false;
  const files = await resolveLinkedInPostsFiles();
  const sourceGroup = await readCsvGroupWithFallback(
    files,
    LINKEDIN_POSTS_CSV_SAMPLE
  );
  const parsedGroups = sourceGroup.texts.map((text) =>
    parseLinkedInCsvRows(text, "Created date")
  );
  const headers = Array.from(
    new Set(parsedGroups.flatMap((group) => group.headers))
  );
  const rows = parsedGroups.flatMap((group) => group.rows);

  const validation = buildCsvValidation({
    id: "linkedin-posts",
    label: "LinkedIn post analytics",
    filePaths: sourceGroup.filePaths,
    source: sourceGroup.source,
    rowCount: rows.length,
    headers,
    requiredGroups: [
      { label: "Created date", fields: ["Created date", "Created Date"] },
      { label: "Impressions", fields: ["Impressions"] }
    ],
    optionalGroups: [
      { label: "Views", fields: ["Views"] },
      { label: "Clicks", fields: ["Clicks"] },
      { label: "Likes", fields: ["Likes"] },
      { label: "Comments", fields: ["Comments"] },
      { label: "Reposts", fields: ["Reposts"] },
      { label: "Post title", fields: ["Post title"] },
      { label: "Post link", fields: ["Post link"] },
      { label: "Content Type", fields: ["Content Type", "Post type"] }
    ]
  });

  type LinkedInPostRecord = LinkedInPostSummary & { hasTime: boolean };
  const rawPosts: LinkedInPostRecord[] = [];

  rows.forEach((row) => {
    const dateValue = pickField(row, ["Created date", "Created Date"]);
    const rawDate = String(dateValue ?? "").trim();
    const hasTime = rawDate.includes(":");
    if (hasTime) {
      timeOfDayAvailable = true;
    }
    const createdAt = parseLinkedInDateTime(dateValue);
    if (!createdAt) return;

    const impressions = toNumber(pickField(row, ["Impressions"]));
    const views = toNumber(pickField(row, ["Views"]));
    const clicks = toNumber(pickField(row, ["Clicks"]));
    const likes = toNumber(pickField(row, ["Likes"]));
    const comments = toNumber(pickField(row, ["Comments"]));
    const reposts = toNumber(pickField(row, ["Reposts"]));
    const engagementRateRaw = pickField(row, [
      "Engagement rate",
      "Engagement rate (total)"
    ]);

    const engagementRate =
      parseRate(engagementRateRaw) ??
      calculateEngagementRate(impressions, likes, comments, reposts);

    const postSummary: LinkedInPostRecord = {
      title: sanitizeTitle(String(pickField(row, ["Post title"])).trim()),
      link: String(pickField(row, ["Post link"])).trim(),
      createdAt,
      impressions,
      views,
      clicks,
      likes,
      comments,
      reposts,
      engagementRate,
      contentType: String(pickField(row, ["Content Type", "Post type"])).trim(),
      hasTime
    };

    rawPosts.push(postSummary);
  });

  const dedupedPosts = new Map<string, LinkedInPostRecord>();
  rawPosts.forEach((post) => {
    const key = post.link || `${post.title}-${post.createdAt.toISOString()}`;
    const existing = dedupedPosts.get(key);
    if (
      !existing ||
      post.impressions > existing.impressions ||
      (post.impressions === existing.impressions && post.hasTime && !existing.hasTime)
    ) {
      dedupedPosts.set(key, post);
    }
  });

  const uniquePosts = Array.from(dedupedPosts.values());

  uniquePosts.forEach((post) => {
    const key = toDayKey(post.createdAt);
    postsByDate.set(key, (postsByDate.get(key) ?? 0) + 1);

    const contentType = post.contentType || "Unknown";
    const current = contentTypeMap.get(contentType) ?? {
      type: contentType,
      posts: 0,
      impressions: 0,
      views: 0,
      engagements: 0
    };
    current.posts += 1;
    current.impressions += post.impressions;
    current.views += post.views;
    current.engagements += post.likes + post.comments + post.reposts;
    contentTypeMap.set(contentType, current);

    const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
      post.createdAt.getUTCDay()
    ];
    const hour = post.hasTime ? post.createdAt.getUTCHours() : null;
    const slotKey = hour === null ? dayName : `${dayName}-${hour}`;
    const slot =
      timeSlotMap.get(slotKey) ?? {
        label: hour === null ? dayName : `${dayName} ${String(hour).padStart(2, "0")}:00`,
        day: dayName,
        hour,
        posts: 0,
        impressions: 0,
        engagements: 0,
        engagementRate: null
      };
    slot.posts += 1;
    slot.impressions += post.impressions;
    slot.engagements += post.likes + post.comments + post.reposts;
    slot.engagementRate = slot.impressions
      ? slot.engagements / slot.impressions
      : null;
    timeSlotMap.set(slotKey, slot);
  });

  const uniqueSummaries = uniquePosts.map(({ hasTime, ...summary }) => summary);

  // Rank by impressions first, then by views as a tiebreaker.
  const sortedTopPosts = uniqueSummaries
    .filter((post) => post.title || post.link)
    .sort((a, b) => {
      if (b.impressions !== a.impressions) {
        return b.impressions - a.impressions;
      }
      return b.views - a.views;
    })
    .slice(0, 5);

  const contentTypes = Array.from(contentTypeMap.values())
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 6);

  const sortedTopPostsByRate = uniqueSummaries
    .filter((post) => post.engagementRate !== null)
    .sort((a, b) => (b.engagementRate ?? 0) - (a.engagementRate ?? 0))
    .slice(0, 5);

  const timeMatrix = mergeTimeMatrixSlots(Array.from(timeSlotMap.values()));
  const bestTimes = rankTopTimeSlots(timeMatrix);

  return {
    postsByDate,
    topPosts: sortedTopPosts,
    topPostsByRate: sortedTopPostsByRate,
    contentTypes,
    bestTimes,
    timeMatrix,
    timeOfDayAvailable,
    validation
  };
}

function toMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function toDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const cleaned = String(value).replace(/,/g, "").trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRate(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateEngagementRate(
  impressions: number,
  likes: number,
  comments: number,
  reposts: number
): number | null {
  if (!impressions) return null;
  return (likes + comments + reposts) / impressions;
}

function sanitizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").slice(0, 140);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function resolveDataPath(fileName: string, baseDir: string): string {
  return path.isAbsolute(fileName) ? fileName : path.join(baseDir, fileName);
}

function percentDelta(previous: number, current: number): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

function parseXDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  );
}

function parseXPostDate(raw: unknown): Date | null {
  if (!raw) return null;
  const parsed = new Date(String(raw));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseLinkedInDate(raw: unknown): Date | null {
  const dateTime = parseLinkedInDateTime(raw);
  if (!dateTime) return null;
  return new Date(
    Date.UTC(
      dateTime.getUTCFullYear(),
      dateTime.getUTCMonth(),
      dateTime.getUTCDate()
    )
  );
}

function parseLinkedInDateTime(raw: unknown): Date | null {
  if (!raw) return null;

  if (raw instanceof Date) {
    return raw;
  }

  if (typeof raw === "number") {
    // Excel date serial number (days since 1899-12-30). Fractions include time.
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const millis = raw * 24 * 60 * 60 * 1000;
    return new Date(epoch.getTime() + millis);
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const [datePart, timePart, ampmPart] = trimmed.split(/\s+/);
    const datePieces = datePart.split("/");

    if (datePieces.length === 3) {
      const [p1, p2, p3] = datePieces.map((part) => Number(part));
      const month = LINKEDIN_DATE_FORMAT === "MDY" ? p1 : p2;
      const day = LINKEDIN_DATE_FORMAT === "MDY" ? p2 : p1;
      const year = p3;

      if (!Number.isNaN(month) && !Number.isNaN(day) && !Number.isNaN(year)) {
        let hour = 0;
        let minute = 0;

        if (timePart && timePart.includes(":")) {
          const [rawHour, rawMinute] = timePart.split(":").map(Number);
          if (!Number.isNaN(rawHour)) {
            hour = rawHour;
          }
          if (!Number.isNaN(rawMinute)) {
            minute = rawMinute;
          }

          const ampm = ampmPart?.toUpperCase();
          if (ampm === "PM" && hour < 12) {
            hour += 12;
          }
          if (ampm === "AM" && hour === 12) {
            hour = 0;
          }
        }

        return new Date(Date.UTC(year, month - 1, day, hour, minute));
      }
    }

    const fallback = new Date(trimmed);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  return null;
}

function pickField(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const key of candidates) {
    if (key in row) return row[key];
  }

  // Case-insensitive fallback for slightly different exports.
  const lower = new Map(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])
  );
  for (const key of candidates) {
    const value = lower.get(key.toLowerCase());
    if (value !== undefined) return value;
  }

  return "";
}

function applyDateRange(
  metrics: DailyMetric[],
  start: Date,
  end: Date
): DailyMetric[] {
  const startMs = start.getTime();
  const endMs = end.getTime();
  return metrics.filter((metric) => {
    const ms = metric.date.getTime();
    return ms >= startMs && ms <= endMs;
  });
}
