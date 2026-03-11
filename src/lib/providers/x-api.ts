import fs from "node:fs/promises";
import path from "node:path";
import type {
  BestTimeSlot,
  DailyMetric,
  XAmplifierAccount,
  XAmplifiersInsight,
  XBrandAuthor,
  XBrandDaily,
  XBrandListeningInsight,
  XFollowerInsight,
  XFollowerSnapshot,
  XMentionAccount,
  XMentionDaily,
  XMentionsInsight,
  XPostSummary,
  XQuoteAuthor,
  XQuoteDaily,
  XQuotedPost,
  XQuotesInsight,
  XRefreshGuardrail
} from "@/lib/metrics";

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
  timeMatrix: BestTimeSlot[];
  timeOfDayAvailable: boolean;
  mentions: XMentionsInsight;
  quotes: XQuotesInsight;
  amplifiers: XAmplifiersInsight;
  followers: XFollowerInsight;
  brandListening: XBrandListeningInsight;
  guardrail: XRefreshGuardrail;
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
const MAX_QUOTE_PAGES_PER_POST = 2;
const MAX_INTERACTION_PAGES_PER_POST = 2;
const MAX_SEARCH_PAGES = 4;
const CACHE_SECONDS = clampNumber(process.env.X_API_CACHE_SECONDS, 900, 30, 86400);
const REFRESH_COOLDOWN_SECONDS = clampNumber(
  process.env.X_API_REFRESH_COOLDOWN_SECONDS,
  120,
  0,
  86_400
);
const REFRESH_DAILY_CAP = clampNumber(process.env.X_API_DAILY_REFRESH_CAP, 15, 1, 500);
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
const STATE_FILE = path.join(process.cwd(), "Data", "cache", "x_api_state.json");

let snapshotCache: { expiresAt: number; value: XApiSnapshot } | null = null;
let refreshInFlight = false;
let persistedStateCache: PersistedXState | null = null;

export async function loadXApiSnapshot(options: LoadOptions = {}): Promise<XApiSnapshot> {
  const state = await loadPersistedState();
  rotateRefreshUsageDay(state);
  const baseGuardrail = buildGuardrail(state, null);

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
    return cacheAndReturn({
      ...emptySnapshot("disabled"),
      followers: buildFollowerInsight(state, null),
      guardrail: baseGuardrail
    });
  }

  if (options.forceRefresh) {
    const blockedReason = getGuardrailBlockReason(state);
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
    const followerInsight = buildFollowerInsight(state, followerCount);

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
      mentions: mentionsOutcome,
      quotes: quotesInsight,
      amplifiers: amplifiersInsight,
      followers: followerInsight,
      brandListening: brandOutcome,
      guardrail: buildGuardrail(state, null),
      source: "api",
      fetchedAt: new Date()
    });
  } catch (error) {
    return cacheAndReturn({
      ...emptySnapshot("error"),
      followers: buildFollowerInsight(state, null),
      guardrail: buildGuardrail(
        state,
        error instanceof Error ? error.message : "Unknown X API error"
      ),
      error: error instanceof Error ? error.message : "Unknown X API error"
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
    "tweet.fields": "created_at,author_id,public_metrics",
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

    return {
      available: true,
      note: null,
      totalMentions: tweets.length,
      uniqueMentioners: byAccount.size,
      verifiedMentioners,
      daily,
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

    return {
      available: true,
      note: null,
      totalQuotes: daily.reduce((acc, entry) => acc + entry.quotes, 0),
      uniqueQuoteAuthors: byAuthor.size,
      verifiedQuoteAuthors: Array.from(byAuthor.values()).filter((entry) =>
        Boolean(entry.profile.verified)
      ).length,
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

  try {
    for (const sourceTweet of sourceTweets) {
      const tweetId = sourceTweet.id;
      const [likingUsers, retweetedUsers] = await Promise.all([
        fetchTweetInteractionUsers(tweetId, "liking_users", bearer),
        fetchTweetInteractionUsers(tweetId, "retweeted_by", bearer)
      ]);

      const likedIds = new Set(likingUsers.map((user) => user.id));
      const repostedIds = new Set(retweetedUsers.map((user) => user.id));

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

    const leaderboard: XAmplifierAccount[] = Array.from(byAccount.entries())
      .map(([userId, entry]) => {
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
      })
      .sort((a, b) => {
        if (b.interactions !== a.interactions) return b.interactions - a.interactions;
        return b.supportingPosts - a.supportingPosts;
      })
      .slice(0, 50);

    const repeatSupporters = leaderboard.filter(
      (entry) => entry.interactions >= REPEAT_SUPPORTER_THRESHOLD
    );
    const allAccounts = Array.from(byAccount.values());
    const verifiedSupporters = allAccounts.filter((entry) =>
      Boolean(entry.profile.verified)
    ).length;

    return {
      available: true,
      note: null,
      repeatThreshold: REPEAT_SUPPORTER_THRESHOLD,
      scannedPosts: sourceTweets.length,
      totalSupporters: byAccount.size,
      verifiedSupporters,
      repeatSupporters: repeatSupporters.length,
      repeatSupportersVerified: repeatSupporters.filter((entry) => entry.verified).length,
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

  return {
    followerSnapshots: snapshots.slice(-FOLLOWER_HISTORY_LIMIT),
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

function getGuardrailBlockReason(state: PersistedXState): string | null {
  if (refreshInFlight) {
    return "Refresh already in progress. Wait for current API run to finish.";
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
    timeMatrix: [],
    timeOfDayAvailable: false,
    mentions: emptyMentionsInsight(),
    quotes: emptyQuotesInsight(),
    amplifiers: emptyAmplifiersInsight(),
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
    topMentioners: []
  };
}

function emptyQuotesInsight(): XQuotesInsight {
  return {
    available: false,
    note: null,
    totalQuotes: 0,
    uniqueQuoteAuthors: 0,
    verifiedQuoteAuthors: 0,
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
    leaderboard: []
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

function toDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toUtcDayKey(date: Date): string {
  return toDayKey(date);
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
