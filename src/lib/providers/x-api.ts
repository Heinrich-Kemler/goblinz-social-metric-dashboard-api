import fs from "node:fs/promises";
import path from "node:path";
import type {
  BestTimeSlot,
  ContentTypeBestWindow,
  DailyMetric,
  XAmplifierAccount,
  XAmplifierConcentrationPoint,
  XAmplifiersInsight,
  XBrandAuthor,
  XBrandDaily,
  XBrandListeningInsight,
  XEngagementCohortInsight,
  XFollowerInsight,
  XFollowerSnapshot,
  XMentionAccount,
  XMentionDaily,
  XMentionsInsight,
  XPostHalfLifeInsight,
  XPostSummary,
  XQuoteAuthor,
  XQuoteDaily,
  XQuotedPost,
  XQuotesInsight,
  XSupporterCohortInsight,
  XSupporterRetentionPoint,
  XRefreshGuardrail
} from "@/lib/metrics";
import {
  appendXApiSnapshotToStore,
  loadLatestXApiSnapshotFromStore
} from "@/lib/storage/metrics-db";

type XApiUser = {
  id: string;
  username?: string;
  name?: string;
  verified?: boolean;
  public_metrics?: {
    followers_count?: number;
  };
};

type XApiTweet = {
  id: string;
  text?: string;
  created_at?: string;
  author_id?: string;
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

type XApiTweetPage = {
  data?: XApiTweet[];
  includes?: {
    users?: XApiUser[];
  };
  errors?: Array<{
    title?: string;
    detail?: string;
  }>;
  meta?: {
    next_token?: string;
  };
};

type XApiUserPage = {
  data?: XApiUser[];
  errors?: Array<{
    title?: string;
    detail?: string;
  }>;
  meta?: {
    next_token?: string;
  };
};

type PersistedXState = {
  followerSnapshots: Array<{ capturedAt: string; followers: number }>;
  postEngagementSnapshots: Array<{
    capturedAt: string;
    signature: string;
    posts: Array<{ tweetId: string; createdAt: string; engagements: number }>;
  }>;
  refreshUsage: {
    dayKey: string;
    used: number;
    nextAllowedAtMs: number;
  };
};

export type XApiSnapshot = {
  daily: DailyMetric[];
  topPosts: XPostSummary[];
  bestTimes: BestTimeSlot[];
  bestByContentType: ContentTypeBestWindow[];
  timeMatrix: BestTimeSlot[];
  timeOfDayAvailable: boolean;
  mentions: XMentionsInsight;
  quotes: XQuotesInsight;
  amplifiers: XAmplifiersInsight;
  engagementCohort: XEngagementCohortInsight;
  postHalfLife: XPostHalfLifeInsight;
  followers: XFollowerInsight;
  brandListening: XBrandListeningInsight;
  guardrail: XRefreshGuardrail;
  source: "api" | "disabled" | "error" | "paused";
  fetchedAt: Date | null;
  error?: string;
};

type LoadOptions = {
  forceRefresh?: boolean;
  forceRefreshOverride?: boolean;
  manualOnly?: boolean;
};

const API_BASE = "https://api.x.com/2";
const MAX_PAGES = 8;
const MAX_QUOTE_PAGES_PER_POST = 2;
const MAX_INTERACTION_PAGES_PER_POST = 2;
const MAX_SEARCH_PAGES = 4;
const CACHE_SECONDS = clampNumber(process.env.X_API_CACHE_SECONDS, 900, 30, 86400);
const REFRESH_COOLDOWN_SECONDS = clampNumber(
  process.env.X_API_REFRESH_COOLDOWN_SECONDS,
  10_800,
  0,
  86_400
);
const REFRESH_DAILY_CAP = clampNumber(process.env.X_API_DAILY_REFRESH_CAP, 2, 1, 500);
const QUOTE_SOURCE_POST_LIMIT = clampNumber(
  process.env.X_QUOTE_SOURCE_POST_LIMIT,
  12,
  1,
  50
);
const AMPLIFIER_SOURCE_POST_LIMIT = clampNumber(
  process.env.X_AMPLIFIER_SOURCE_POST_LIMIT,
  8,
  1,
  30
);
const REPEAT_SUPPORTER_THRESHOLD = clampNumber(
  process.env.X_REPEAT_SUPPORTER_THRESHOLD,
  5,
  2,
  500
);
const FOLLOWER_HISTORY_LIMIT = clampNumber(
  process.env.X_FOLLOWER_HISTORY_LIMIT,
  180,
  7,
  1000
);
const FOLLOWER_SNAPSHOT_MIN_MINUTES = clampNumber(
  process.env.X_FOLLOWER_SNAPSHOT_MIN_MINUTES,
  30,
  1,
  1440
);
const POST_SNAPSHOT_HISTORY_LIMIT = clampNumber(
  process.env.X_POST_SNAPSHOT_HISTORY_LIMIT,
  90,
  10,
  1000
);
const POST_SNAPSHOT_MIN_MINUTES = clampNumber(
  process.env.X_POST_SNAPSHOT_MIN_MINUTES,
  30,
  1,
  1440
);
const POST_SNAPSHOT_POST_LIMIT = clampNumber(
  process.env.X_POST_SNAPSHOT_POST_LIMIT,
  250,
  20,
  1000
);
const HALF_LIFE_MIN_FINAL_ENGAGEMENTS = clampNumber(
  process.env.X_HALF_LIFE_MIN_FINAL_ENGAGEMENTS,
  10,
  1,
  10_000
);
const MENTIONS_SPIKE_RATIO_THRESHOLD = clampDecimal(
  process.env.X_MENTIONS_SPIKE_RATIO_THRESHOLD,
  1.8,
  1.1,
  10
);
const MENTIONS_SPIKE_DELTA_THRESHOLD = clampNumber(
  process.env.X_MENTIONS_SPIKE_DELTA_THRESHOLD,
  5,
  1,
  500
);
const QUOTE_HIGH_INTENT_ENGAGEMENT_THRESHOLD = clampNumber(
  process.env.X_QUOTE_HIGH_INTENT_ENGAGEMENT_THRESHOLD,
  5,
  1,
  10_000
);
const COHORT_AGE_BUCKETS: Array<{ key: string; minHours: number; maxHours: number }> = [
  { key: "0-24h", minHours: 0, maxHours: 24 },
  { key: "1-3d", minHours: 24, maxHours: 72 },
  { key: "3-7d", minHours: 72, maxHours: 168 },
  { key: "7-14d", minHours: 168, maxHours: 336 },
  { key: "14-30d", minHours: 336, maxHours: 720 },
  { key: "30d+", minHours: 720, maxHours: Number.POSITIVE_INFINITY }
];
const STATE_FILE = path.join(process.cwd(), "Data", "cache", "x_api_state.json");

let snapshotCache: { expiresAt: number; value: XApiSnapshot } | null = null;
let refreshInFlight = false;
let persistedStateCache: PersistedXState | null = null;

export async function loadXApiSnapshot(options: LoadOptions = {}): Promise<XApiSnapshot> {
  const state = await loadPersistedState();
  rotateRefreshUsageDay(state);
  const baseGuardrail = buildGuardrail(state, null);
  if (!snapshotCache) {
    const persistedSnapshot = loadLatestXApiSnapshotFromStore();
    if (persistedSnapshot) {
      snapshotCache = {
        expiresAt: Date.now() + CACHE_SECONDS * 1000,
        value: persistedSnapshot
      };
    }
  }

  if (!options.forceRefresh && snapshotCache) {
    if (options.manualOnly) {
      return withGuardrail(snapshotCache.value, baseGuardrail);
    }
    if (Date.now() < snapshotCache.expiresAt) {
      return withGuardrail(snapshotCache.value, baseGuardrail);
    }
  }

  if (options.manualOnly && !options.forceRefresh) {
    return {
      ...emptySnapshot("paused"),
      fetchedAt: snapshotCache?.value.fetchedAt ?? null,
      followers: buildFollowerInsight(state, null),
      guardrail: baseGuardrail
    };
  }

  const bearer = process.env.X_API_BEARER_TOKEN;
  const username = process.env.X_API_USERNAME;

  if (!bearer || !username) {
    const persistedFallback = snapshotCache?.value ?? loadLatestXApiSnapshotFromStore();
    if (persistedFallback) {
      return withGuardrail(persistedFallback, baseGuardrail);
    }
    return cacheAndReturn({
      ...emptySnapshot("disabled"),
      followers: buildFollowerInsight(state, null),
      guardrail: baseGuardrail
    });
  }

  if (options.forceRefresh) {
    const blockedReason = getGuardrailBlockReason(
      state,
      options.forceRefreshOverride === true
    );
    if (blockedReason) {
      const fallback =
        snapshotCache?.value ??
        ({
          ...emptySnapshot("paused"),
          followers: buildFollowerInsight(state, null),
          fetchedAt: snapshotCache?.value.fetchedAt ?? null
        } as XApiSnapshot);
      return withGuardrail(fallback, buildGuardrail(state, blockedReason));
    }

    state.refreshUsage.used += 1;
    state.refreshUsage.nextAllowedAtMs = Date.now() + REFRESH_COOLDOWN_SECONDS * 1000;
    await savePersistedState(state);
    refreshInFlight = true;
  }

  try {
    const user = await xFetch<{ data?: XApiUser }>(
      `${API_BASE}/users/by/username/${encodeURIComponent(
        username
      )}?user.fields=id,public_metrics`,
      bearer
    );

    const userId = user.data?.id;
    if (!userId) {
      return cacheAndReturn({
        ...emptySnapshot("error"),
        followers: buildFollowerInsight(state, null),
        guardrail: buildGuardrail(state, "Unable to resolve X username to user id."),
        error: "Unable to resolve X username to user id."
      });
    }

    const [tweets, mentionsOutcome, brandOutcome] = await Promise.all([
      fetchRecentTweets(userId, bearer),
      loadMentionsInsight(userId, bearer),
      loadBrandListeningInsight(bearer)
    ]);

    const quoteSources = selectSourceTweets(tweets, QUOTE_SOURCE_POST_LIMIT);
    const amplifierSources = selectSourceTweets(tweets, AMPLIFIER_SOURCE_POST_LIMIT);

    const [quotesInsight, amplifiersInsight] = await Promise.all([
      loadQuoteInsight(quoteSources, bearer),
      loadAmplifierInsight(amplifierSources, bearer)
    ]);

    const followerCount = toOptionalNumber(user.data?.public_metrics?.followers_count);
    await maybeStoreFollowerSnapshot(state, followerCount);
    await maybeStorePostEngagementSnapshot(state, tweets);
    const followerInsight = buildFollowerInsight(state, followerCount);
    const postHalfLife = buildPostHalfLifeInsight(state, username);

    const daily = aggregateDaily(tweets);
    const timeMatrix = buildTimeMatrix(tweets);
    const bestTimes = rankTopSlots(timeMatrix);
    const bestByContentType = buildBestByContentTypeFromTweets(tweets);
    const engagementCohort = buildEngagementCohort(tweets, new Date());
    const topPosts = tweets
      .map(toPostSummary)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5);

    const liveSnapshot: XApiSnapshot = {
      daily,
      topPosts,
      bestTimes,
      bestByContentType,
      timeMatrix,
      timeOfDayAvailable: true,
      mentions: mentionsOutcome,
      quotes: quotesInsight,
      amplifiers: amplifiersInsight,
      engagementCohort,
      postHalfLife,
      followers: followerInsight,
      brandListening: brandOutcome,
      guardrail: buildGuardrail(state, null),
      source: "api",
      fetchedAt: new Date()
    };
    appendXApiSnapshotToStore(liveSnapshot);
    return cacheAndReturn(liveSnapshot);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown X API error";
    const persistedFallback = snapshotCache?.value ?? loadLatestXApiSnapshotFromStore();
    if (persistedFallback) {
      return withGuardrail(
        persistedFallback,
        buildGuardrail(
          state,
          `X API fetch failed; showing last persisted snapshot. ${errorMessage}`
        )
      );
    }
    return cacheAndReturn({
      ...emptySnapshot("error"),
      followers: buildFollowerInsight(state, null),
      guardrail: buildGuardrail(state, errorMessage),
      error: errorMessage
    });
  } finally {
    if (options.forceRefresh) {
      refreshInFlight = false;
    }
  }
}

async function fetchRecentTweets(userId: string, bearer: string): Promise<XApiTweet[]> {
  const lookbackDays = clampNumber(process.env.X_API_LOOKBACK_DAYS, 30, 7, 30);
  const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    max_results: "100",
    exclude: "retweets,replies",
    "tweet.fields": "created_at,author_id,public_metrics",
    start_time: start
  });

  const { tweets } = await fetchPaginatedTweets({
    baseUrl: `${API_BASE}/users/${userId}/tweets`,
    baseParams: params,
    maxPages: MAX_PAGES,
    bearer
  });
  return tweets;
}

async function loadMentionsInsight(
  userId: string,
  bearer: string
): Promise<XMentionsInsight> {
  const lookbackDays = clampNumber(process.env.X_MENTIONS_LOOKBACK_DAYS, 30, 7, 30);
  const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    max_results: "100",
    "tweet.fields": "created_at,author_id,public_metrics,text",
    expansions: "author_id",
    "user.fields": "id,name,username,verified",
    start_time: start
  });

  try {
    const { tweets, users } = await fetchPaginatedTweets({
      baseUrl: `${API_BASE}/users/${userId}/mentions`,
      baseParams: params,
      maxPages: MAX_PAGES,
      bearer
    });

    const byDay = new Map<
      string,
      {
        date: Date;
        mentions: number;
        mentionerIds: Set<string>;
        verifiedMentionerIds: Set<string>;
        engagements: number;
      }
    >();
    const byAccount = new Map<
      string,
      {
        profile: XApiUser;
        mentions: number;
        engagements: number;
        lastMentionAt: Date | null;
      }
    >();
    const sourceMixCounter = new Map<string, number>();
    const hashtagTerms = new Map<string, number>();
    const keywordTerms = new Map<string, number>();

    for (const tweet of tweets) {
      const day = parseXDate(tweet.created_at);
      if (!day) continue;
      const dayKey = toDayKey(day);
      const authorId = tweet.author_id ?? "unknown";
      const author = users.get(authorId) ?? { id: authorId };
      const engagements =
        (tweet.public_metrics?.like_count ?? 0) +
        (tweet.public_metrics?.reply_count ?? 0) +
        (tweet.public_metrics?.retweet_count ?? 0) +
        (tweet.public_metrics?.quote_count ?? 0);

      const dayEntry =
        byDay.get(dayKey) ??
        {
          date: day,
          mentions: 0,
          mentionerIds: new Set<string>(),
          verifiedMentionerIds: new Set<string>(),
          engagements: 0
        };
      dayEntry.mentions += 1;
      dayEntry.mentionerIds.add(authorId);
      if (author.verified) {
        dayEntry.verifiedMentionerIds.add(authorId);
      }
      dayEntry.engagements += engagements;
      byDay.set(dayKey, dayEntry);

      const existing =
        byAccount.get(authorId) ??
        {
          profile: author,
          mentions: 0,
          engagements: 0,
          lastMentionAt: null
        };
      existing.mentions += 1;
      existing.engagements += engagements;
      const mentionTime = parseIsoDate(tweet.created_at);
      if (
        mentionTime &&
        (!existing.lastMentionAt || mentionTime.getTime() > existing.lastMentionAt.getTime())
      ) {
        existing.lastMentionAt = mentionTime;
      }
      existing.profile = author;
      byAccount.set(authorId, existing);

      const sourceLabel = classifyMentionSource(tweet.text ?? "");
      sourceMixCounter.set(sourceLabel, (sourceMixCounter.get(sourceLabel) ?? 0) + 1);
      extractMentionTerms(tweet.text ?? "", hashtagTerms, keywordTerms);
    }

    const daily: XMentionDaily[] = Array.from(byDay.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((entry) => ({
        date: entry.date,
        mentions: entry.mentions,
        uniqueMentioners: entry.mentionerIds.size,
        verifiedMentioners: entry.verifiedMentionerIds.size,
        engagements: entry.engagements
      }));

    const topMentioners: XMentionAccount[] = Array.from(byAccount.entries())
      .map(([userId, entry]) => ({
        userId,
        handle: entry.profile.username ? `@${entry.profile.username}` : "@unknown",
        name: entry.profile.name ?? "Unknown",
        verified: Boolean(entry.profile.verified),
        mentions: entry.mentions,
        engagements: entry.engagements,
        lastMentionAt: entry.lastMentionAt
      }))
      .sort((a, b) => {
        if (b.mentions !== a.mentions) return b.mentions - a.mentions;
        return b.engagements - a.engagements;
      })
      .slice(0, 15);

    const verifiedMentioners = Array.from(byAccount.values()).filter(
      (entry) => Boolean(entry.profile.verified)
    ).length;
    const velocity = buildMentionsVelocity(daily);
    const spikes = detectMentionSpikes(velocity);
    const sourceMix = buildMentionSourceMix(sourceMixCounter, tweets.length);
    const topicLeaderboard = buildTopicLeaderboard(hashtagTerms, keywordTerms);

    return {
      available: true,
      note: null,
      totalMentions: tweets.length,
      uniqueMentioners: byAccount.size,
      verifiedMentioners,
      daily,
      velocity,
      spikes,
      sourceMix,
      topicLeaderboard,
      topMentioners
    };
  } catch (error) {
    return {
      ...emptyMentionsInsight(),
      note:
        error instanceof Error
          ? `Mentions endpoint unavailable: ${error.message}`
          : "Mentions endpoint unavailable."
    };
  }
}

async function loadQuoteInsight(
  sourceTweets: XApiTweet[],
  bearer: string
): Promise<XQuotesInsight> {
  if (sourceTweets.length === 0) {
    return {
      ...emptyQuotesInsight(),
      available: false,
      note: "No source posts in current lookback window."
    };
  }

  const byDay = new Map<
    string,
    { date: Date; quotes: number; authorIds: Set<string>; engagements: number }
  >();
  const bySource = new Map<
    string,
    {
      sourceTweetId: string;
      sourceText: string;
      sourceLink: string;
      sourceCreatedAt: Date | null;
      quotes: number;
      authorIds: Set<string>;
      verifiedAuthorIds: Set<string>;
      engagements: number;
    }
  >();
  const byAuthor = new Map<
    string,
    {
      profile: XApiUser;
      quotes: number;
      engagements: number;
      lastQuoteAt: Date | null;
    }
  >();

  try {
    let totalQuoteEngagements = 0;
    let highIntentQuotes = 0;
    for (const sourceTweet of sourceTweets) {
      const sourceKey = sourceTweet.id;
      const sourceEntry =
        bySource.get(sourceKey) ??
        {
          sourceTweetId: sourceTweet.id,
          sourceText: sanitizeText(sourceTweet.text ?? ""),
          sourceLink: `https://x.com/i/web/status/${sourceTweet.id}`,
          sourceCreatedAt: parseIsoDate(sourceTweet.created_at),
          quotes: 0,
          authorIds: new Set<string>(),
          verifiedAuthorIds: new Set<string>(),
          engagements: 0
        };

      const { tweets, users } = await fetchPaginatedTweets({
        baseUrl: `${API_BASE}/tweets/${sourceTweet.id}/quote_tweets`,
        baseParams: new URLSearchParams({
          max_results: "100",
          "tweet.fields": "created_at,author_id,public_metrics",
          expansions: "author_id",
          "user.fields": "id,name,username,verified"
        }),
        maxPages: MAX_QUOTE_PAGES_PER_POST,
        bearer
      });

      for (const quote of tweets) {
        const day = parseXDate(quote.created_at);
        if (!day) continue;
        const dayKey = toDayKey(day);
        const authorId = quote.author_id ?? "unknown";
        const author = users.get(authorId) ?? { id: authorId };
        const engagements =
          (quote.public_metrics?.like_count ?? 0) +
          (quote.public_metrics?.reply_count ?? 0) +
          (quote.public_metrics?.retweet_count ?? 0) +
          (quote.public_metrics?.quote_count ?? 0);
        totalQuoteEngagements += engagements;
        if (engagements >= QUOTE_HIGH_INTENT_ENGAGEMENT_THRESHOLD) {
          highIntentQuotes += 1;
        }

        sourceEntry.quotes += 1;
        sourceEntry.authorIds.add(authorId);
        if (author.verified) {
          sourceEntry.verifiedAuthorIds.add(authorId);
        }
        sourceEntry.engagements += engagements;

        const dayEntry =
          byDay.get(dayKey) ??
          { date: day, quotes: 0, authorIds: new Set<string>(), engagements: 0 };
        dayEntry.quotes += 1;
        dayEntry.authorIds.add(authorId);
        dayEntry.engagements += engagements;
        byDay.set(dayKey, dayEntry);

        const existing =
          byAuthor.get(authorId) ??
          {
            profile: author,
            quotes: 0,
            engagements: 0,
            lastQuoteAt: null
          };
        existing.profile = author;
        existing.quotes += 1;
        existing.engagements += engagements;
        const quoteTime = parseIsoDate(quote.created_at);
        if (
          quoteTime &&
          (!existing.lastQuoteAt || quoteTime.getTime() > existing.lastQuoteAt.getTime())
        ) {
          existing.lastQuoteAt = quoteTime;
        }
        byAuthor.set(authorId, existing);
      }

      bySource.set(sourceKey, sourceEntry);
    }

    const daily: XQuoteDaily[] = Array.from(byDay.values())
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((entry) => ({
        date: entry.date,
        quotes: entry.quotes,
        uniqueAuthors: entry.authorIds.size,
        avgEngagement: entry.quotes ? entry.engagements / entry.quotes : 0
      }));

    const topQuotedPosts: XQuotedPost[] = Array.from(bySource.values())
      .map((entry) => ({
        sourceTweetId: entry.sourceTweetId,
        sourceText: entry.sourceText,
        sourceLink: entry.sourceLink,
        sourceCreatedAt: entry.sourceCreatedAt,
        quotes: entry.quotes,
        uniqueAuthors: entry.authorIds.size,
        verifiedAuthors: entry.verifiedAuthorIds.size,
        avgQuoteEngagement: entry.quotes ? entry.engagements / entry.quotes : 0
      }))
      .sort((a, b) => {
        if (b.quotes !== a.quotes) return b.quotes - a.quotes;
        return b.avgQuoteEngagement - a.avgQuoteEngagement;
      })
      .slice(0, 10);

    const topQuoteAuthors: XQuoteAuthor[] = Array.from(byAuthor.entries())
      .map(([userId, entry]) => ({
        userId,
        handle: entry.profile.username ? `@${entry.profile.username}` : "@unknown",
        name: entry.profile.name ?? "Unknown",
        verified: Boolean(entry.profile.verified),
        quotes: entry.quotes,
        engagements: entry.engagements,
        avgEngagement: entry.quotes ? entry.engagements / entry.quotes : 0,
        lastQuoteAt: entry.lastQuoteAt
      }))
      .sort((a, b) => {
        if (b.quotes !== a.quotes) return b.quotes - a.quotes;
        return b.engagements - a.engagements;
      })
      .slice(0, 15);

    const totalQuotes = daily.reduce((acc, entry) => acc + entry.quotes, 0);
    const funnel = {
      quotes: totalQuotes,
      quoteEngagements: totalQuoteEngagements,
      highIntentQuotes,
      engagementPerQuote: totalQuotes > 0 ? totalQuoteEngagements / totalQuotes : null,
      highIntentRate: totalQuotes > 0 ? highIntentQuotes / totalQuotes : null,
      highIntentThreshold: QUOTE_HIGH_INTENT_ENGAGEMENT_THRESHOLD,
      profileClicks: null,
      profileClickRate: null,
      note: "Direct profile-click attribution from quote tweets is unavailable in X API v2."
    };

    return {
      available: true,
      note: null,
      totalQuotes,
      totalQuoteEngagements,
      highIntentQuotes,
      uniqueQuoteAuthors: byAuthor.size,
      verifiedQuoteAuthors: Array.from(byAuthor.values()).filter((entry) =>
        Boolean(entry.profile.verified)
      ).length,
      funnel,
      daily,
      topQuotedPosts,
      topQuoteAuthors
    };
  } catch (error) {
    return {
      ...emptyQuotesInsight(),
      note:
        error instanceof Error
          ? `Quote posts endpoint unavailable: ${error.message}`
          : "Quote posts endpoint unavailable."
    };
  }
}

async function loadAmplifierInsight(
  sourceTweets: XApiTweet[],
  bearer: string
): Promise<XAmplifiersInsight> {
  if (sourceTweets.length === 0) {
    return {
      ...emptyAmplifiersInsight(),
      available: false,
      note: "No source posts in current lookback window."
    };
  }

  const byAccount = new Map<
    string,
    {
      profile: XApiUser;
      likes: number;
      reposts: number;
      supportingPosts: Set<string>;
    }
  >();
  const byWeekSupporters = new Map<string, Set<string>>();
  const weekStartByKey = new Map<string, Date>();

  try {
    for (const sourceTweet of sourceTweets) {
      const tweetId = sourceTweet.id;
      const createdAt = parseIsoDate(sourceTweet.created_at);
      const weekStart = createdAt ? getWeekStartUtc(createdAt) : null;
      const weekKey = weekStart ? toDayKey(weekStart) : null;
      const [likingUsers, retweetedUsers] = await Promise.all([
        fetchTweetInteractionUsers(tweetId, "liking_users", bearer),
        fetchTweetInteractionUsers(tweetId, "retweeted_by", bearer)
      ]);

      const likedIds = new Set(likingUsers.map((user) => user.id));
      const repostedIds = new Set(retweetedUsers.map((user) => user.id));
      const interactionIds = new Set<string>([...likedIds, ...repostedIds]);

      if (weekKey) {
        const weekSet = byWeekSupporters.get(weekKey) ?? new Set<string>();
        interactionIds.forEach((userId) => weekSet.add(userId));
        byWeekSupporters.set(weekKey, weekSet);
        if (!weekStartByKey.has(weekKey)) {
          weekStartByKey.set(weekKey, weekStart ?? parseDayKey(weekKey));
        }
      }

      for (const user of likingUsers) {
        const entry =
          byAccount.get(user.id) ??
          {
            profile: user,
            likes: 0,
            reposts: 0,
            supportingPosts: new Set<string>()
          };
        entry.profile = user;
        if (likedIds.has(user.id)) {
          entry.likes += 1;
        }
        entry.supportingPosts.add(tweetId);
        byAccount.set(user.id, entry);
      }

      for (const user of retweetedUsers) {
        const entry =
          byAccount.get(user.id) ??
          {
            profile: user,
            likes: 0,
            reposts: 0,
            supportingPosts: new Set<string>()
          };
        entry.profile = user;
        if (repostedIds.has(user.id)) {
          entry.reposts += 1;
        }
        entry.supportingPosts.add(tweetId);
        byAccount.set(user.id, entry);
      }
    }

    const accountStats: XAmplifierAccount[] = Array.from(byAccount.entries()).map(
      ([userId, entry]) => {
        const interactions = entry.likes + entry.reposts;
        return {
          userId,
          handle: entry.profile.username ? `@${entry.profile.username}` : "@unknown",
          name: entry.profile.name ?? "Unknown",
          verified: Boolean(entry.profile.verified),
          likes: entry.likes,
          reposts: entry.reposts,
          interactions,
          supportingPosts: entry.supportingPosts.size
        };
      }
    );

    const leaderboard: XAmplifierAccount[] = [...accountStats]
      .sort((a, b) => {
        if (b.interactions !== a.interactions) return b.interactions - a.interactions;
        return b.supportingPosts - a.supportingPosts;
      })
      .slice(0, 50);

    const repeatSupporters = accountStats.filter(
      (entry) => entry.interactions >= REPEAT_SUPPORTER_THRESHOLD
    );
    const retention = buildSupporterRetentionSeries(byWeekSupporters, weekStartByKey);
    const verifiedSupporters = accountStats.filter((entry) => entry.verified).length;
    const totalInteractions = accountStats.reduce(
      (sum, entry) => sum + entry.interactions,
      0
    );
    const sortedCounts = accountStats
      .map((entry) => entry.interactions)
      .filter((value) => value > 0)
      .sort((a, b) => b - a);
    const concentrationCurve = buildConcentrationCurve(sortedCounts, totalInteractions, [
      1, 3, 5, 10, 20, 50
    ]);
    const top10Share = shareForTopN(sortedCounts, totalInteractions, 10);
    const top20Share = shareForTopN(sortedCounts, totalInteractions, 20);
    const gini = calculateGini(sortedCounts, totalInteractions);
    const hhi = calculateHhi(sortedCounts, totalInteractions);
    const concentrationRisk = classifyConcentrationRisk(top10Share, gini);
    const cohortRetention = buildSupporterCohortRetention(
      byWeekSupporters,
      weekStartByKey
    );

    return {
      available: true,
      note: null,
      repeatThreshold: REPEAT_SUPPORTER_THRESHOLD,
      scannedPosts: sourceTweets.length,
      totalSupporters: byAccount.size,
      verifiedSupporters,
      repeatSupporters: repeatSupporters.length,
      repeatSupportersVerified: repeatSupporters.filter((entry) => entry.verified).length,
      totalInteractions,
      top10Share,
      top20Share,
      gini,
      hhi,
      concentrationRisk,
      concentrationCurve,
      retention,
      cohortRetention,
      leaderboard
    };
  } catch (error) {
    return {
      ...emptyAmplifiersInsight(),
      note:
        error instanceof Error
          ? `Amplifier endpoints unavailable: ${error.message}`
          : "Amplifier endpoints unavailable."
    };
  }
}

async function loadBrandListeningInsight(bearer: string): Promise<XBrandListeningInsight> {
  const query = (process.env.X_BRAND_QUERY ?? "").trim();
  if (!query) {
    return {
      ...emptyBrandListeningInsight(),
      note: "Set X_BRAND_QUERY to enable brand listening."
    };
  }

  const compareQuery = (process.env.X_BRAND_COMPARE_QUERY ?? "").trim() || null;
  const lookbackDays = clampNumber(process.env.X_BRAND_LOOKBACK_DAYS, 7, 1, 7);
  const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const [brandResult, compareResult] = await Promise.all([
      fetchSearchRecentTweets(query, start, bearer),
      compareQuery
        ? fetchSearchRecentTweets(compareQuery, start, bearer)
        : Promise.resolve({ tweets: [], users: new Map<string, XApiUser>() })
    ]);

    const brandByDay = new Map<string, { date: Date; count: number; authorIds: Set<string> }>();
    const compareByDay = new Map<string, { date: Date; count: number }>();
    const topAuthors = new Map<string, { profile: XApiUser; mentions: number }>();

    for (const tweet of brandResult.tweets) {
      const day = parseXDate(tweet.created_at);
      if (!day) continue;
      const key = toDayKey(day);
      const authorId = tweet.author_id ?? "unknown";
      const author = brandResult.users.get(authorId) ?? { id: authorId };

      const dayEntry =
        brandByDay.get(key) ?? { date: day, count: 0, authorIds: new Set<string>() };
      dayEntry.count += 1;
      dayEntry.authorIds.add(authorId);
      brandByDay.set(key, dayEntry);

      const authorEntry = topAuthors.get(authorId) ?? { profile: author, mentions: 0 };
      authorEntry.profile = author;
      authorEntry.mentions += 1;
      topAuthors.set(authorId, authorEntry);
    }

    for (const tweet of compareResult.tweets) {
      const day = parseXDate(tweet.created_at);
      if (!day) continue;
      const key = toDayKey(day);
      const dayEntry = compareByDay.get(key) ?? { date: day, count: 0 };
      dayEntry.count += 1;
      compareByDay.set(key, dayEntry);
    }

    const allDayKeys = new Set<string>([
      ...brandByDay.keys(),
      ...compareByDay.keys()
    ]);
    const daily: XBrandDaily[] = Array.from(allDayKeys)
      .map((key) => {
        const brandEntry = brandByDay.get(key);
        const compareEntry = compareByDay.get(key);
        const brandMentions = brandEntry?.count ?? 0;
        const compareMentions = compareEntry?.count ?? 0;
        const denominator = brandMentions + compareMentions;
        return {
          date: brandEntry?.date ?? compareEntry?.date ?? parseDayKey(key),
          brandMentions,
          compareMentions,
          shareOfVoice: denominator > 0 ? brandMentions / denominator : null,
          uniqueAuthors: brandEntry?.authorIds.size ?? 0
        };
      })
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const topAuthorList: XBrandAuthor[] = Array.from(topAuthors.entries())
      .map(([userId, entry]) => ({
        userId,
        handle: entry.profile.username ? `@${entry.profile.username}` : "@unknown",
        name: entry.profile.name ?? "Unknown",
        verified: Boolean(entry.profile.verified),
        mentions: entry.mentions
      }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 15);

    const shareSamples = daily
      .map((entry) => entry.shareOfVoice)
      .filter((entry): entry is number => entry !== null);
    const averageShareOfVoice =
      shareSamples.length > 0
        ? shareSamples.reduce((sum, value) => sum + value, 0) / shareSamples.length
        : null;

    return {
      enabled: true,
      note: null,
      query,
      compareQuery,
      totalBrandMentions: brandResult.tweets.length,
      totalCompareMentions: compareResult.tweets.length,
      averageShareOfVoice,
      daily,
      topAuthors: topAuthorList
    };
  } catch (error) {
    return {
      ...emptyBrandListeningInsight(),
      enabled: true,
      query,
      compareQuery,
      note:
        error instanceof Error
          ? `Brand listening endpoint unavailable: ${error.message}`
          : "Brand listening endpoint unavailable."
    };
  }
}

async function fetchSearchRecentTweets(
  query: string,
  startTime: string,
  bearer: string
): Promise<{ tweets: XApiTweet[]; users: Map<string, XApiUser> }> {
  const params = new URLSearchParams({
    query,
    max_results: "100",
    start_time: startTime,
    "tweet.fields": "created_at,author_id,public_metrics",
    expansions: "author_id",
    "user.fields": "id,name,username,verified"
  });

  return fetchPaginatedTweets({
    baseUrl: `${API_BASE}/tweets/search/recent`,
    baseParams: params,
    maxPages: MAX_SEARCH_PAGES,
    bearer
  });
}

async function fetchTweetInteractionUsers(
  tweetId: string,
  endpoint: "liking_users" | "retweeted_by",
  bearer: string
): Promise<XApiUser[]> {
  const params = new URLSearchParams({
    max_results: "100",
    "user.fields": "id,name,username,verified"
  });
  const { users } = await fetchPaginatedUsers({
    baseUrl: `${API_BASE}/tweets/${tweetId}/${endpoint}`,
    baseParams: params,
    maxPages: MAX_INTERACTION_PAGES_PER_POST,
    bearer
  });
  return users;
}

type PaginatedTweetArgs = {
  baseUrl: string;
  baseParams: URLSearchParams;
  maxPages: number;
  bearer: string;
};

async function fetchPaginatedTweets(
  args: PaginatedTweetArgs
): Promise<{ tweets: XApiTweet[]; users: Map<string, XApiUser> }> {
  let nextToken: string | undefined;
  let pageCount = 0;
  const tweets: XApiTweet[] = [];
  const users = new Map<string, XApiUser>();

  while (pageCount < args.maxPages) {
    const params = new URLSearchParams(args.baseParams.toString());
    if (nextToken) {
      params.set("pagination_token", nextToken);
    }
    const page = await xFetch<XApiTweetPage>(
      `${args.baseUrl}?${params.toString()}`,
      args.bearer
    );
    throwIfFieldAccessError(page.errors, page.data);
    for (const user of page.includes?.users ?? []) {
      users.set(user.id, user);
    }
    tweets.push(...(page.data ?? []));
    nextToken = page.meta?.next_token;
    pageCount += 1;
    if (!nextToken) break;
  }

  return { tweets, users };
}

type PaginatedUserArgs = {
  baseUrl: string;
  baseParams: URLSearchParams;
  maxPages: number;
  bearer: string;
};

async function fetchPaginatedUsers(
  args: PaginatedUserArgs
): Promise<{ users: XApiUser[] }> {
  let nextToken: string | undefined;
  let pageCount = 0;
  const users = new Map<string, XApiUser>();

  while (pageCount < args.maxPages) {
    const params = new URLSearchParams(args.baseParams.toString());
    if (nextToken) {
      params.set("pagination_token", nextToken);
    }
    const page = await xFetch<XApiUserPage>(
      `${args.baseUrl}?${params.toString()}`,
      args.bearer
    );
    throwIfFieldAccessError(page.errors, page.data);
    for (const user of page.data ?? []) {
      users.set(user.id, user);
    }
    nextToken = page.meta?.next_token;
    pageCount += 1;
    if (!nextToken) break;
  }

  return { users: Array.from(users.values()) };
}

function throwIfFieldAccessError(
  errors: Array<{ title?: string; detail?: string }> | undefined,
  data: unknown[] | undefined
): void {
  if ((data?.length ?? 0) > 0) return;
  if (!errors || errors.length === 0) return;
  const details = errors
    .map((error) => error.detail ?? error.title)
    .filter(Boolean)
    .join(" | ");
  throw new Error(details ? `X API field access error: ${details}` : "X API field access error.");
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
    throw new Error(`X API ${response.status}: ${body.slice(0, 220)}`);
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

function buildBestByContentTypeFromTweets(tweets: XApiTweet[]): ContentTypeBestWindow[] {
  const typeSlotMaps = new Map<string, Map<string, BestTimeSlot>>();

  for (const tweet of tweets) {
    const createdAt = parseIsoDate(tweet.created_at);
    if (!createdAt) continue;

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
    const slotKey = `${day}-${hour}`;
    const contentType = inferXTweetType(tweet.text ?? "");

    const perTypeMap = typeSlotMaps.get(contentType) ?? new Map<string, BestTimeSlot>();
    const slot =
      perTypeMap.get(slotKey) ?? {
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
    perTypeMap.set(slotKey, slot);
    typeSlotMaps.set(contentType, perTypeMap);
  }

  const rows: ContentTypeBestWindow[] = [];
  for (const [contentType, slotMap] of typeSlotMaps.entries()) {
    const best = rankTopSlots(Array.from(slotMap.values()))[0];
    if (!best) continue;
    rows.push({
      platform: "x",
      contentType,
      label: best.label,
      day: best.day,
      hour: best.hour,
      posts: best.posts,
      engagementRate: best.engagementRate
    });
  }

  return rows
    .filter((row) => row.posts > 0)
    .sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1))
    .slice(0, 12);
}

function inferXTweetType(text: string): string {
  const normalized = text.toLowerCase();
  if (/https?:\/\//.test(normalized)) return "Link";
  const hashtags = normalized.match(/#[a-z0-9_]+/g) ?? [];
  if (hashtags.length >= 2) return "Hashtag-led";
  if (hashtags.length === 1) return "Hashtag";
  if (normalized.length > 0 && normalized.length <= 90) return "Short text";
  return "Text";
}

function classifyMentionSource(text: string): string {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return "Unknown";
  if (normalized.startsWith("@")) return "Reply-style";
  if (/https?:\/\//.test(normalized)) return "Link mention";
  if (/#[a-z0-9_]+/.test(normalized)) return "Hashtag mention";
  return "Plain mention";
}

function extractMentionTerms(
  text: string,
  hashtags: Map<string, number>,
  keywords: Map<string, number>
): void {
  const normalized = text.toLowerCase();
  const hashtagMatches = normalized.match(/#[a-z0-9_]{2,40}/g) ?? [];
  for (const match of hashtagMatches) {
    hashtags.set(match, (hashtags.get(match) ?? 0) + 1);
  }

  const clean = normalized
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#[a-z0-9_]+/g, " ")
    .replace(/@[a-z0-9_]+/g, " ");
  const stopwords = new Set([
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "your",
    "you",
    "are",
    "was",
    "have",
    "has",
    "will",
    "about",
    "into",
    "just",
    "can",
    "our",
    "its",
    "out",
    "how",
    "not"
  ]);
  const tokens = clean.split(/[^a-z0-9]+/g).filter(Boolean);
  for (const token of tokens) {
    if (token.length < 3) continue;
    if (/^\d+$/.test(token)) continue;
    if (stopwords.has(token)) continue;
    keywords.set(token, (keywords.get(token) ?? 0) + 1);
  }
}

function buildMentionSourceMix(
  counter: Map<string, number>,
  totalMentions: number
): XMentionsInsight["sourceMix"] {
  if (totalMentions <= 0) return [];
  return Array.from(counter.entries())
    .map(([label, mentions]) => ({
      label,
      mentions,
      share: mentions / totalMentions
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 6);
}

function buildTopicLeaderboard(
  hashtags: Map<string, number>,
  keywords: Map<string, number>
): XMentionsInsight["topicLeaderboard"] {
  const rows: XMentionsInsight["topicLeaderboard"] = [];

  hashtags.forEach((mentions, term) => {
    rows.push({ term, mentions, kind: "hashtag" });
  });
  keywords.forEach((mentions, term) => {
    rows.push({ term, mentions, kind: "keyword" });
  });

  return rows
    .sort((a, b) => {
      if (b.mentions !== a.mentions) return b.mentions - a.mentions;
      if (a.kind !== b.kind) return a.kind === "hashtag" ? -1 : 1;
      return a.term.localeCompare(b.term);
    })
    .slice(0, 12);
}

function selectSourceTweets(tweets: XApiTweet[], limit: number): XApiTweet[] {
  return [...tweets]
    .sort((a, b) => {
      const impressionsA = a.public_metrics?.impression_count ?? 0;
      const impressionsB = b.public_metrics?.impression_count ?? 0;
      if (impressionsB !== impressionsA) {
        return impressionsB - impressionsA;
      }
      const timeA = parseIsoDate(a.created_at)?.getTime() ?? 0;
      const timeB = parseIsoDate(b.created_at)?.getTime() ?? 0;
      return timeB - timeA;
    })
    .slice(0, limit);
}

async function loadPersistedState(): Promise<PersistedXState> {
  if (persistedStateCache) return persistedStateCache;
  try {
    const raw = await fs.readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistedXState>;
    persistedStateCache = normalizePersistedState(parsed);
    return persistedStateCache;
  } catch {
    persistedStateCache = createDefaultPersistedState();
    return persistedStateCache;
  }
}

async function savePersistedState(state: PersistedXState): Promise<void> {
  persistedStateCache = state;
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

function normalizePersistedState(input: Partial<PersistedXState>): PersistedXState {
  const refreshUsage = input.refreshUsage ?? {
    dayKey: toUtcDayKey(new Date()),
    used: 0,
    nextAllowedAtMs: 0
  };
  const snapshots = Array.isArray(input.followerSnapshots)
    ? input.followerSnapshots.filter(
        (entry): entry is { capturedAt: string; followers: number } =>
          typeof entry?.capturedAt === "string" && Number.isFinite(entry?.followers)
      )
    : [];
  const postSnapshots = Array.isArray(input.postEngagementSnapshots)
    ? input.postEngagementSnapshots
        .map((entry) => {
          if (typeof entry?.capturedAt !== "string") return null;
          const posts = Array.isArray(entry.posts)
            ? entry.posts.filter(
                (post): post is { tweetId: string; createdAt: string; engagements: number } =>
                  typeof post?.tweetId === "string" &&
                  typeof post?.createdAt === "string" &&
                  Number.isFinite(post?.engagements)
              )
            : [];
          return {
            capturedAt: entry.capturedAt,
            signature: typeof entry.signature === "string" ? entry.signature : "",
            posts
          };
        })
        .filter(
          (
            entry
          ): entry is {
            capturedAt: string;
            signature: string;
            posts: Array<{ tweetId: string; createdAt: string; engagements: number }>;
          } => entry !== null
        )
    : [];

  return {
    followerSnapshots: snapshots.slice(-FOLLOWER_HISTORY_LIMIT),
    postEngagementSnapshots: postSnapshots.slice(-POST_SNAPSHOT_HISTORY_LIMIT),
    refreshUsage: {
      dayKey: refreshUsage.dayKey || toUtcDayKey(new Date()),
      used: normalizeNumber(refreshUsage.used),
      nextAllowedAtMs: normalizeNumber(refreshUsage.nextAllowedAtMs)
    }
  };
}

function createDefaultPersistedState(): PersistedXState {
  return {
    followerSnapshots: [],
    postEngagementSnapshots: [],
    refreshUsage: {
      dayKey: toUtcDayKey(new Date()),
      used: 0,
      nextAllowedAtMs: 0
    }
  };
}

function rotateRefreshUsageDay(state: PersistedXState): void {
  const today = toUtcDayKey(new Date());
  if (state.refreshUsage.dayKey === today) return;
  state.refreshUsage.dayKey = today;
  state.refreshUsage.used = 0;
  state.refreshUsage.nextAllowedAtMs = 0;
}

function getGuardrailBlockReason(
  state: PersistedXState,
  forceRefreshOverride = false
): string | null {
  if (refreshInFlight) {
    return "Refresh already in progress. Wait for current API run to finish.";
  }
  // Manual override bypasses cooldown + daily cap, but still respects in-flight lock.
  if (forceRefreshOverride) {
    return null;
  }
  if (state.refreshUsage.used >= REFRESH_DAILY_CAP) {
    return `Daily refresh cap reached (${REFRESH_DAILY_CAP}/${REFRESH_DAILY_CAP}).`;
  }
  const now = Date.now();
  if (state.refreshUsage.nextAllowedAtMs > now) {
    const wait = Math.max(
      1,
      Math.ceil((state.refreshUsage.nextAllowedAtMs - now) / 1000)
    );
    return `Cooldown active. Try again in ${wait}s.`;
  }
  return null;
}

function buildGuardrail(
  state: PersistedXState,
  blockedReason: string | null
): XRefreshGuardrail {
  const now = Date.now();
  const remaining = Math.max(0, REFRESH_DAILY_CAP - state.refreshUsage.used);
  const nextAllowedAt =
    state.refreshUsage.nextAllowedAtMs > now
      ? new Date(state.refreshUsage.nextAllowedAtMs)
      : null;
  return {
    dayKey: state.refreshUsage.dayKey,
    cooldownSeconds: REFRESH_COOLDOWN_SECONDS,
    dailyCap: REFRESH_DAILY_CAP,
    refreshesUsedToday: state.refreshUsage.used,
    refreshesRemainingToday: remaining,
    inFlight: refreshInFlight,
    blockedReason,
    nextAllowedAt
  };
}

async function maybeStoreFollowerSnapshot(
  state: PersistedXState,
  followerCount: number | null
): Promise<void> {
  if (followerCount === null) return;
  const now = new Date();
  const last = state.followerSnapshots[state.followerSnapshots.length - 1];
  if (last) {
    const ageMs = now.getTime() - new Date(last.capturedAt).getTime();
    const minAgeMs = FOLLOWER_SNAPSHOT_MIN_MINUTES * 60 * 1000;
    if (ageMs < minAgeMs && last.followers === followerCount) {
      return;
    }
  }
  state.followerSnapshots.push({
    capturedAt: now.toISOString(),
    followers: followerCount
  });
  if (state.followerSnapshots.length > FOLLOWER_HISTORY_LIMIT) {
    state.followerSnapshots = state.followerSnapshots.slice(-FOLLOWER_HISTORY_LIMIT);
  }
  await savePersistedState(state);
}

async function maybeStorePostEngagementSnapshot(
  state: PersistedXState,
  tweets: XApiTweet[]
): Promise<void> {
  if (tweets.length === 0) return;
  const now = new Date();
  const rows = tweets
    .map((tweet) => {
      const createdAt = parseIsoDate(tweet.created_at);
      if (!createdAt) return null;
      const engagements =
        (tweet.public_metrics?.like_count ?? 0) +
        (tweet.public_metrics?.reply_count ?? 0) +
        (tweet.public_metrics?.retweet_count ?? 0) +
        (tweet.public_metrics?.quote_count ?? 0);
      return {
        tweetId: tweet.id,
        createdAt: createdAt.toISOString(),
        engagements
      };
    })
    .filter(
      (
        row
      ): row is {
        tweetId: string;
        createdAt: string;
        engagements: number;
      } => row !== null
    )
    .sort((a, b) => {
      const aTime = parseIsoDate(a.createdAt)?.getTime() ?? 0;
      const bTime = parseIsoDate(b.createdAt)?.getTime() ?? 0;
      return bTime - aTime;
    })
    .slice(0, POST_SNAPSHOT_POST_LIMIT);
  if (rows.length === 0) return;

  const signature = rows.map((row) => `${row.tweetId}:${row.engagements}`).join("|");
  const last =
    state.postEngagementSnapshots[state.postEngagementSnapshots.length - 1] ?? null;
  if (last) {
    const ageMs = now.getTime() - new Date(last.capturedAt).getTime();
    const minAgeMs = POST_SNAPSHOT_MIN_MINUTES * 60 * 1000;
    if (ageMs < minAgeMs && last.signature === signature) {
      return;
    }
  }

  state.postEngagementSnapshots.push({
    capturedAt: now.toISOString(),
    signature,
    posts: rows
  });
  if (state.postEngagementSnapshots.length > POST_SNAPSHOT_HISTORY_LIMIT) {
    state.postEngagementSnapshots = state.postEngagementSnapshots.slice(
      -POST_SNAPSHOT_HISTORY_LIMIT
    );
  }
  await savePersistedState(state);
}

function buildPostHalfLifeInsight(
  state: PersistedXState,
  username: string
): XPostHalfLifeInsight {
  const snapshots = state.postEngagementSnapshots
    .map((snapshot) => {
      const capturedAt = parseIsoDate(snapshot.capturedAt);
      if (!capturedAt) return null;
      return {
        capturedAt,
        posts: snapshot.posts
      };
    })
    .filter(
      (
        snapshot
      ): snapshot is {
        capturedAt: Date;
        posts: Array<{ tweetId: string; createdAt: string; engagements: number }>;
      } => snapshot !== null
    )
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  if (snapshots.length < 2) {
    return {
      available: false,
      note: "Need at least two refresh snapshots to compute post half-life.",
      postsEvaluated: 0,
      medianHalfLifeHours: null,
      p75HalfLifeHours: null,
      samples: [],
      byWeekday: []
    };
  }

  const byTweet = new Map<
    string,
    {
      createdAt: Date;
      series: Array<{ capturedAt: Date; engagements: number }>;
    }
  >();

  for (const snapshot of snapshots) {
    for (const post of snapshot.posts) {
      const createdAt = parseIsoDate(post.createdAt);
      if (!createdAt) continue;
      const entry =
        byTweet.get(post.tweetId) ??
        { createdAt, series: [] as Array<{ capturedAt: Date; engagements: number }> };
      entry.series.push({
        capturedAt: snapshot.capturedAt,
        engagements: Math.max(0, post.engagements)
      });
      byTweet.set(post.tweetId, entry);
    }
  }

  const samples: Array<{
    tweetId: string;
    link: string;
    createdAt: Date;
    halfLifeHours: number;
    finalEngagements: number;
  }> = [];

  byTweet.forEach((entry, tweetId) => {
    const series = [...entry.series].sort(
      (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime()
    );
    if (series.length < 2) return;
    const finalEngagements = Math.max(...series.map((point) => point.engagements));
    if (finalEngagements < HALF_LIFE_MIN_FINAL_ENGAGEMENTS) return;
    const target = finalEngagements * 0.5;
    let crossingTime: Date | null = null;

    for (let index = 0; index < series.length; index += 1) {
      const point = series[index];
      if (point.engagements < target) continue;
      if (index === 0) {
        crossingTime = point.capturedAt;
      } else {
        const previous = series[index - 1];
        if (previous.engagements >= target) {
          crossingTime = point.capturedAt;
        } else {
          const engagementDelta = point.engagements - previous.engagements;
          if (engagementDelta <= 0) {
            crossingTime = point.capturedAt;
          } else {
            const ratio = (target - previous.engagements) / engagementDelta;
            const msDelta = point.capturedAt.getTime() - previous.capturedAt.getTime();
            crossingTime = new Date(previous.capturedAt.getTime() + msDelta * ratio);
          }
        }
      }
      break;
    }

    if (!crossingTime) return;
    const halfLifeHours =
      (crossingTime.getTime() - entry.createdAt.getTime()) / (1000 * 60 * 60);
    if (!Number.isFinite(halfLifeHours) || halfLifeHours < 0) return;

    samples.push({
      tweetId,
      link: `https://x.com/${username}/status/${tweetId}`,
      createdAt: entry.createdAt,
      halfLifeHours,
      finalEngagements
    });
  });

  if (samples.length === 0) {
    return {
      available: false,
      note:
        "No posts met half-life thresholds yet. Keep refreshing over time to build post trajectories.",
      postsEvaluated: 0,
      medianHalfLifeHours: null,
      p75HalfLifeHours: null,
      samples: [],
      byWeekday: []
    };
  }

  const halfLifeValues = samples.map((sample) => sample.halfLifeHours);
  const medianHalfLifeHours = percentile(halfLifeValues, 0.5);
  const p75HalfLifeHours = percentile(halfLifeValues, 0.75);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byWeekday = dayNames.map((day, index) => {
    const values = samples
      .filter((sample) => sample.createdAt.getUTCDay() === index)
      .map((sample) => sample.halfLifeHours);
    return {
      day,
      posts: values.length,
      medianHalfLifeHours: percentile(values, 0.5)
    };
  });

  const sampleRows = [...samples]
    .sort((a, b) => b.finalEngagements - a.finalEngagements)
    .slice(0, 25);

  return {
    available: true,
    note: null,
    postsEvaluated: samples.length,
    medianHalfLifeHours,
    p75HalfLifeHours,
    samples: sampleRows,
    byWeekday
  };
}

function buildFollowerInsight(
  state: PersistedXState,
  currentFollowers: number | null
): XFollowerInsight {
  const snapshots = state.followerSnapshots
    .map((entry): XFollowerSnapshot | null => {
      const parsed = parseIsoDate(entry.capturedAt);
      if (!parsed) return null;
      return {
        capturedAt: parsed,
        followers: entry.followers
      };
    })
    .filter((entry): entry is XFollowerSnapshot => entry !== null)
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());

  const current =
    currentFollowers !== null
      ? currentFollowers
      : snapshots.length > 0
      ? snapshots[snapshots.length - 1].followers
      : null;

  let previous: number | null = null;
  if (snapshots.length >= 2) {
    previous = snapshots[snapshots.length - 2].followers;
  } else if (snapshots.length === 1 && currentFollowers !== null) {
    previous = snapshots[0].followers;
  }

  const changeSincePrevious =
    current !== null && previous !== null ? current - previous : null;

  return {
    currentFollowers: current,
    changeSincePrevious,
    snapshots: snapshots.slice(-30)
  };
}

function withGuardrail(value: XApiSnapshot, guardrail: XRefreshGuardrail): XApiSnapshot {
  return {
    ...value,
    guardrail
  };
}

function emptySnapshot(source: "disabled" | "error" | "paused"): XApiSnapshot {
  return {
    daily: [],
    topPosts: [],
    bestTimes: [],
    bestByContentType: [],
    timeMatrix: [],
    timeOfDayAvailable: false,
    mentions: emptyMentionsInsight(),
    quotes: emptyQuotesInsight(),
    amplifiers: emptyAmplifiersInsight(),
    engagementCohort: emptyEngagementCohortInsight(),
    postHalfLife: emptyPostHalfLifeInsight(),
    followers: emptyFollowerInsight(),
    brandListening: emptyBrandListeningInsight(),
    guardrail: {
      dayKey: toUtcDayKey(new Date()),
      cooldownSeconds: REFRESH_COOLDOWN_SECONDS,
      dailyCap: REFRESH_DAILY_CAP,
      refreshesUsedToday: 0,
      refreshesRemainingToday: REFRESH_DAILY_CAP,
      inFlight: false,
      blockedReason: null,
      nextAllowedAt: null
    },
    source,
    fetchedAt: null
  };
}

function emptyMentionsInsight(): XMentionsInsight {
  return {
    available: false,
    note: null,
    totalMentions: 0,
    uniqueMentioners: 0,
    verifiedMentioners: 0,
    daily: [],
    velocity: [],
    spikes: [],
    sourceMix: [],
    topicLeaderboard: [],
    topMentioners: []
  };
}

function emptyQuotesInsight(): XQuotesInsight {
  return {
    available: false,
    note: null,
    totalQuotes: 0,
    totalQuoteEngagements: 0,
    highIntentQuotes: 0,
    uniqueQuoteAuthors: 0,
    verifiedQuoteAuthors: 0,
    funnel: {
      quotes: 0,
      quoteEngagements: 0,
      highIntentQuotes: 0,
      engagementPerQuote: null,
      highIntentRate: null,
      highIntentThreshold: QUOTE_HIGH_INTENT_ENGAGEMENT_THRESHOLD,
      profileClicks: null,
      profileClickRate: null,
      note: "Direct profile-click attribution from quote tweets is unavailable in X API v2."
    },
    daily: [],
    topQuotedPosts: [],
    topQuoteAuthors: []
  };
}

function emptyAmplifiersInsight(): XAmplifiersInsight {
  return {
    available: false,
    note: null,
    repeatThreshold: REPEAT_SUPPORTER_THRESHOLD,
    scannedPosts: 0,
    totalSupporters: 0,
    verifiedSupporters: 0,
    repeatSupporters: 0,
    repeatSupportersVerified: 0,
    totalInteractions: 0,
    top10Share: null,
    top20Share: null,
    gini: null,
    hhi: null,
    concentrationRisk: "n/a",
    concentrationCurve: [],
    retention: [],
    cohortRetention: {
      available: false,
      note: null,
      maxWeekOffset: 0,
      rows: []
    },
    leaderboard: []
  };
}

function emptyEngagementCohortInsight(): XEngagementCohortInsight {
  return {
    available: false,
    note: null,
    ageBuckets: COHORT_AGE_BUCKETS.map((bucket) => bucket.key),
    rows: []
  };
}

function emptyPostHalfLifeInsight(): XPostHalfLifeInsight {
  return {
    available: false,
    note: null,
    postsEvaluated: 0,
    medianHalfLifeHours: null,
    p75HalfLifeHours: null,
    samples: [],
    byWeekday: []
  };
}

function emptyFollowerInsight(): XFollowerInsight {
  return {
    currentFollowers: null,
    changeSincePrevious: null,
    snapshots: []
  };
}

function emptyBrandListeningInsight(): XBrandListeningInsight {
  return {
    enabled: false,
    note: null,
    query: null,
    compareQuery: null,
    totalBrandMentions: 0,
    totalCompareMentions: 0,
    averageShareOfVoice: null,
    daily: [],
    topAuthors: []
  };
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

function parseDayKey(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map((value) => Number(value));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(Date.UTC(1970, 0, 1));
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function getWeekStartUtc(date: Date): Date {
  const utcMidnight = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = utcMidnight.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday week start
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() + diff);
  return utcMidnight;
}

function toDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toUtcDayKey(date: Date): string {
  return toDayKey(date);
}

function buildSupporterRetentionSeries(
  byWeekSupporters: Map<string, Set<string>>,
  weekStartByKey: Map<string, Date>
): XSupporterRetentionPoint[] {
  // Retention is computed between consecutive publish weeks (UTC week start = Monday).
  const weekKeys = Array.from(byWeekSupporters.keys()).sort();
  let previous: Set<string> | null = null;

  return weekKeys.map((weekKey) => {
    const supportersSet = byWeekSupporters.get(weekKey) ?? new Set<string>();
    const supporters = supportersSet.size;
    const returningSupporters =
      previous && previous.size > 0 ? countIntersection(previous, supportersSet) : 0;
    const newSupporters =
      previous && previous.size > 0 ? Math.max(0, supporters - returningSupporters) : supporters;
    const retentionRate =
      previous && previous.size > 0 ? returningSupporters / previous.size : null;
    const weekStart = weekStartByKey.get(weekKey) ?? parseDayKey(weekKey);
    const label = formatWeekLabel(weekStart);
    previous = supportersSet;
    return {
      weekKey,
      label,
      weekStart,
      supporters,
      returningSupporters,
      newSupporters,
      retentionRate
    };
  });
}

function buildSupporterCohortRetention(
  byWeekSupporters: Map<string, Set<string>>,
  weekStartByKey: Map<string, Date>
): XSupporterCohortInsight {
  const weekKeys = Array.from(byWeekSupporters.keys()).sort();
  if (weekKeys.length < 2) {
    return {
      available: false,
      note: "Need at least two weekly buckets to compute cohort retention.",
      maxWeekOffset: 0,
      rows: []
    };
  }

  const firstSeenWeekIndex = new Map<string, number>();
  weekKeys.forEach((weekKey, index) => {
    const supporters = byWeekSupporters.get(weekKey) ?? new Set<string>();
    supporters.forEach((supporterId) => {
      if (!firstSeenWeekIndex.has(supporterId)) {
        firstSeenWeekIndex.set(supporterId, index);
      }
    });
  });

  const cohorts = new Map<number, Set<string>>();
  firstSeenWeekIndex.forEach((cohortIndex, supporterId) => {
    const set = cohorts.get(cohortIndex) ?? new Set<string>();
    set.add(supporterId);
    cohorts.set(cohortIndex, set);
  });

  const maxWeekOffset = Math.min(weekKeys.length - 1, 6);
  const rows = Array.from(cohorts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([cohortIndex, supporters]) => {
      const cohortWeekKey = weekKeys[cohortIndex];
      const weekStart = weekStartByKey.get(cohortWeekKey) ?? parseDayKey(cohortWeekKey);
      const cohortSize = supporters.size;
      const maxOffsetForCohort = Math.min(maxWeekOffset, weekKeys.length - cohortIndex - 1);
      const cells = Array.from({ length: maxOffsetForCohort + 1 }, (_, weekOffset) => {
        const targetWeekKey = weekKeys[cohortIndex + weekOffset];
        const targetWeekSupporters = byWeekSupporters.get(targetWeekKey) ?? new Set<string>();
        const activeSupporters = countIntersection(supporters, targetWeekSupporters);
        const retentionRate = cohortSize > 0 ? activeSupporters / cohortSize : 0;
        return {
          weekOffset,
          supporters: activeSupporters,
          retentionRate
        };
      });
      return {
        cohortWeekKey,
        cohortLabel: formatWeekLabel(weekStart),
        cohortSize,
        cells
      };
    })
    .filter((row) => row.cohortSize > 0)
    .slice(-10);

  return {
    available: rows.length > 0,
    note: rows.length > 0 ? null : "No cohort rows available.",
    maxWeekOffset,
    rows
  };
}

function buildConcentrationCurve(
  sortedInteractionCounts: number[],
  totalInteractions: number,
  ranks: number[]
): XAmplifierConcentrationPoint[] {
  // The curve lets UI show concentration at practical checkpoints (top 1, 3, 5, 10, ...).
  return ranks.map((rank) => ({
    rank,
    cumulativeShare: shareForTopN(sortedInteractionCounts, totalInteractions, rank) ?? 0
  }));
}

function calculateGini(
  sortedInteractionCounts: number[],
  totalInteractions: number
): number | null {
  if (sortedInteractionCounts.length === 0 || totalInteractions <= 0) return null;
  const ascending = [...sortedInteractionCounts].sort((a, b) => a - b);
  const n = ascending.length;
  let weightedSum = 0;
  for (let index = 0; index < n; index += 1) {
    weightedSum += (index + 1) * ascending[index];
  }
  const gini = (2 * weightedSum) / (n * totalInteractions) - (n + 1) / n;
  return Math.max(0, Math.min(1, gini));
}

function calculateHhi(
  sortedInteractionCounts: number[],
  totalInteractions: number
): number | null {
  if (sortedInteractionCounts.length === 0 || totalInteractions <= 0) return null;
  return sortedInteractionCounts.reduce((sum, count) => {
    const share = count / totalInteractions;
    return sum + share * share;
  }, 0);
}

function classifyConcentrationRisk(
  top10Share: number | null,
  gini: number | null
): "low" | "moderate" | "high" | "extreme" | "n/a" {
  if (top10Share === null && gini === null) return "n/a";
  if ((top10Share ?? 0) >= 0.75 || (gini ?? 0) >= 0.85) return "extreme";
  if ((top10Share ?? 0) >= 0.55 || (gini ?? 0) >= 0.7) return "high";
  if ((top10Share ?? 0) >= 0.35 || (gini ?? 0) >= 0.5) return "moderate";
  return "low";
}

function shareForTopN(
  sortedInteractionCounts: number[],
  totalInteractions: number,
  n: number
): number | null {
  if (totalInteractions <= 0) return null;
  const topSum = sortedInteractionCounts
    .slice(0, Math.max(0, n))
    .reduce((sum, value) => sum + value, 0);
  return topSum / totalInteractions;
}

function buildEngagementCohort(
  tweets: XApiTweet[],
  now: Date
): XEngagementCohortInsight {
  // Cohort layout: row = publish week, column = post age bucket at refresh time.
  if (tweets.length === 0) {
    return {
      ...emptyEngagementCohortInsight(),
      note: "No posts in current lookback window."
    };
  }

  const rowMap = new Map<
    string,
    {
      weekStart: Date;
      totalPosts: number;
      cells: Map<string, { engagements: number[]; rates: number[] }>;
    }
  >();

  for (const tweet of tweets) {
    const createdAt = parseIsoDate(tweet.created_at);
    if (!createdAt) continue;
    const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    if (ageHours < 0) continue;
    const ageBucket = getAgeBucket(ageHours);
    if (!ageBucket) continue;

    const weekStart = getWeekStartUtc(createdAt);
    const weekKey = toDayKey(weekStart);
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
    const rate = impressions > 0 ? engagements / impressions : null;

    const row =
      rowMap.get(weekKey) ??
      {
        weekStart,
        totalPosts: 0,
        cells: new Map<string, { engagements: number[]; rates: number[] }>()
      };
    row.totalPosts += 1;
    const cell = row.cells.get(ageBucket) ?? { engagements: [], rates: [] };
    cell.engagements.push(engagements);
    if (rate !== null) {
      cell.rates.push(rate);
    }
    row.cells.set(ageBucket, cell);
    rowMap.set(weekKey, row);
  }

  const rows = Array.from(rowMap.entries())
    .sort((a, b) => a[1].weekStart.getTime() - b[1].weekStart.getTime())
    .map(([weekKey, row]) => ({
      weekKey,
      label: formatWeekLabel(row.weekStart),
      weekStart: row.weekStart,
      totalPosts: row.totalPosts,
      cells: COHORT_AGE_BUCKETS.map((bucket) => {
        const value = row.cells.get(bucket.key);
        const engagements = value?.engagements ?? [];
        const rates = value?.rates ?? [];
        return {
          ageBucket: bucket.key,
          posts: engagements.length,
          medianEngagements: median(engagements),
          medianEngagementRate: median(rates),
          averageEngagementRate:
            rates.length > 0
              ? rates.reduce((sum, item) => sum + item, 0) / rates.length
              : null
        };
      })
    }));

  return {
    available: rows.length > 0,
    note: rows.length > 0 ? null : "No posts in current lookback window.",
    ageBuckets: COHORT_AGE_BUCKETS.map((bucket) => bucket.key),
    rows
  };
}

function buildMentionsVelocity(
  daily: XMentionDaily[]
): Array<{
  date: Date;
  mentions: number;
  rolling7d: number | null;
  deltaFromRolling: number | null;
}> {
  return daily.map((entry, index) => {
    const window = daily.slice(Math.max(0, index - 6), index + 1);
    const rolling7d =
      window.length > 0
        ? window.reduce((sum, item) => sum + item.mentions, 0) / window.length
        : null;
    return {
      date: entry.date,
      mentions: entry.mentions,
      rolling7d,
      deltaFromRolling: rolling7d !== null ? entry.mentions - rolling7d : null
    };
  });
}

function detectMentionSpikes(
  velocity: Array<{
    date: Date;
    mentions: number;
    rolling7d: number | null;
    deltaFromRolling: number | null;
  }>
): Array<{
  date: Date;
  mentions: number;
  rolling7d: number;
  spikeRatio: number;
  spikeDelta: number;
}> {
  return velocity
    .map((point) => {
      if (point.rolling7d === null || point.rolling7d <= 0) return null;
      const spikeRatio = point.mentions / point.rolling7d;
      const spikeDelta = point.mentions - point.rolling7d;
      if (
        spikeRatio < MENTIONS_SPIKE_RATIO_THRESHOLD ||
        spikeDelta < MENTIONS_SPIKE_DELTA_THRESHOLD
      ) {
        return null;
      }
      return {
        date: point.date,
        mentions: point.mentions,
        rolling7d: point.rolling7d,
        spikeRatio,
        spikeDelta
      };
    })
    .filter(
      (
        item
      ): item is {
        date: Date;
        mentions: number;
        rolling7d: number;
        spikeRatio: number;
        spikeDelta: number;
      } => item !== null
    )
    .sort((a, b) => b.spikeRatio - a.spikeRatio)
    .slice(0, 10);
}

function getAgeBucket(ageHours: number): string | null {
  const matched = COHORT_AGE_BUCKETS.find(
    (bucket) => ageHours >= bucket.minHours && ageHours < bucket.maxHours
  );
  return matched?.key ?? null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * Math.max(0, Math.min(1, p));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function countIntersection(a: Set<string>, b: Set<string>): number {
  let count = 0;
  a.forEach((value) => {
    if (b.has(value)) count += 1;
  });
  return count;
}

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric"
  });
  return `${formatter.format(weekStart)}-${formatter.format(weekEnd)}`;
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

function clampDecimal(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toOptionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cacheAndReturn(value: XApiSnapshot): XApiSnapshot {
  snapshotCache = {
    expiresAt: Date.now() + CACHE_SECONDS * 1000,
    value
  };
  return value;
}
