import Link from "next/link";
import { DashboardCharts } from "@/components/DashboardCharts";
import { ManualRefreshButton } from "@/components/ManualRefreshButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatCompact, formatNumber, formatPercent } from "@/lib/format";
import { getDashboardData } from "@/lib/metrics";

type MetricPanelKey =
  | "snapshot"
  | "totals"
  | "data_quality"
  | "x_guardrails"
  | "x_mentions"
  | "x_supporters"
  | "x_cohort"
  | "x_concentration"
  | "x_quotes"
  | "x_half_life"
  | "x_followers"
  | "x_brand"
  | "per_post"
  | "quality_signals"
  | "efficiency_signals"
  | "video_watch"
  | "overview_visuals"
  | "top_posts"
  | "best_times"
  | "time_matrix";

const METRIC_PANELS: { key: MetricPanelKey; label: string }[] = [
  { key: "snapshot", label: "Latest Snapshot" },
  { key: "totals", label: "Totals" },
  { key: "data_quality", label: "Data Quality" },
  { key: "per_post", label: "Per-Post Stats" },
  { key: "quality_signals", label: "Quality Signals" },
  { key: "efficiency_signals", label: "Efficiency Signals" },
  { key: "video_watch", label: "Video Watch Time" },
  { key: "overview_visuals", label: "Overview Visuals" },
  { key: "top_posts", label: "Top Posts" },
  { key: "best_times", label: "Best Times" },
  { key: "time_matrix", label: "Day/Hour Matrix" },
  { key: "x_guardrails", label: "Refresh Guardrails" },
  { key: "x_mentions", label: "Mentions Intelligence" },
  { key: "x_supporters", label: "Repeat Supporters" },
  { key: "x_cohort", label: "Engagement Cohort" },
  { key: "x_concentration", label: "Engagement Concentration" },
  { key: "x_quotes", label: "Quote Analytics" },
  { key: "x_half_life", label: "Post Half-Life" },
  { key: "x_followers", label: "Follower Snapshot" },
  { key: "x_brand", label: "Brand Listening" }
];

// Server component: data is loaded here so charts can stay focused on rendering.
export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const panelParam = Array.isArray(params.panels) ? params.panels[0] : params.panels;
  const visiblePanels = parseVisiblePanels(panelParam);
  const baseQuery = buildBaseQuery(params);
  const refreshToken = Array.isArray(params.refresh)
    ? params.refresh[0]
    : params.refresh;
  const refreshOverrideToken = Array.isArray(params.refresh_override)
    ? params.refresh_override[0]
    : params.refresh_override;
  const forceRefresh = shouldForceRefresh(refreshToken);
  const forceRefreshOverride = forceRefresh && isRefreshOverride(refreshOverrideToken);
  const data = await getDashboardData({ forceRefresh, forceRefreshOverride });
  const xSource = data.sourceStates.find((state) => state.platform === "x");
  const linkedInSource = data.sourceStates.find(
    (state) => state.platform === "linkedin"
  );
  const xApiEnabled = xSource?.mode === "api" || xSource?.mode === "hybrid";
  const linkedInApiEnabled =
    linkedInSource?.mode === "api" || linkedInSource?.mode === "hybrid";
  const supporterFilterParam = Array.isArray(params.supporters)
    ? params.supporters[0]
    : params.supporters;
  const supporterFilter = supporterFilterParam === "verified" ? "verified" : "all";
  const supporterRows =
    supporterFilter === "verified"
      ? data.xAmplifiers.leaderboard.filter((row) => row.verified)
      : data.xAmplifiers.leaderboard;
  const cohortRows = data.xEngagementCohort.rows;
  const cohortPosts = cohortRows.reduce((sum, row) => sum + row.totalPosts, 0);
  const cohortCellRates = cohortRows
    .flatMap((row) => row.cells)
    .map((cell) => cell.medianEngagementRate)
    .filter((value): value is number => value !== null);
  const cohortMedianRate = medianNumber(cohortCellRates);
  const latestMentionsDay = data.xMentions.daily[data.xMentions.daily.length - 1] ?? null;
  const latestMentionVelocity =
    data.xMentions.velocity[data.xMentions.velocity.length - 1] ?? null;
  const mentionVelocityTail = data.xMentions.velocity.slice(-14);
  const topMentionSpike = data.xMentions.spikes[0] ?? null;
  const latestQuotesDay = data.xQuotes.daily[data.xQuotes.daily.length - 1] ?? null;
  const latestFollowerSnapshot =
    data.xFollowers.snapshots[data.xFollowers.snapshots.length - 1] ?? null;
  const followerSnapshotCsvHref = buildCsvDownloadHref(
    [
      ["captured_at_utc", "followers"],
      ...data.xFollowers.snapshots.map((snapshot) => [
        snapshot.capturedAt.toISOString(),
        String(snapshot.followers)
      ])
    ]
  );
  const supporterCsvHref = buildCsvDownloadHref([
    ["handle", "name", "verified", "interactions", "likes", "reposts", "supporting_posts"],
    ...supporterRows.map((row) => [
      row.handle,
      row.name,
      row.verified ? "yes" : "no",
      String(row.interactions),
      String(row.likes),
      String(row.reposts),
      String(row.supportingPosts)
    ])
  ]);

  const latestMonth = data.combined.monthly[data.combined.monthly.length - 1] ?? null;
  const latestMonthKey = latestMonth?.monthKey ?? "";
  const latestMonthLabel = latestMonth?.label ?? "n/a";
  const latestMonthCoverage = latestMonthKey
    ? `Coverage: ${countDaysForMonth(data.x.daily, latestMonthKey)} days (X), ${countDaysForMonth(
        data.linkedin.daily,
        latestMonthKey
      )} days (LinkedIn)`
    : "Coverage: n/a";
  const dataFreshness = data.combined.coverage.end
    ? formatDateShort(data.combined.coverage.end)
    : "n/a";
  const sourceNotes = Array.from(
    new Set(data.sourceStates.map((state) => state.note).filter(Boolean) as string[])
  );
  const xApiFreshness = formatApiFreshness(
    xSource?.lastApiRefreshIso
  );
  const linkedInApiFreshness = formatApiFreshness(
    linkedInSource?.lastApiRefreshIso
  );

  // Latest month KPIs show true month-over-month comparison.
  const latestMonthCards = [
    {
      label: "Views",
      value: latestMonth?.views ?? 0,
      mom: data.mom.views
    },
    {
      label: "Likes",
      value: latestMonth?.likes ?? 0,
      mom: data.mom.likes
    },
    {
      label: "Comments",
      value: latestMonth?.comments ?? 0,
      mom: data.mom.comments
    },
    {
      label: "Reposts",
      value: latestMonth?.reposts ?? 0,
      mom: data.mom.reposts
    },
    {
      label: "Posts",
      value: latestMonth?.posts ?? 0,
      mom: data.mom.posts
    },
    {
      label: "Video Views (X)",
      value: latestMonth?.videoViews ?? 0,
      mom: null
    }
  ];

  // Totals row shows cumulative performance without MoM.
  const totalCards = [
    { label: "Total Views", value: data.combined.totals.views },
    { label: "Total Likes", value: data.combined.totals.likes },
    { label: "Total Comments", value: data.combined.totals.comments },
    { label: "Total Reposts", value: data.combined.totals.reposts },
    { label: "Total Posts", value: data.combined.totals.posts },
    { label: "Total Video Views (X)", value: data.x.totals.videoViews }
  ];

  const latestX = data.x.monthly[data.x.monthly.length - 1] ?? null;
  const prevX = data.x.monthly[data.x.monthly.length - 2] ?? null;
  const latestLinkedIn =
    data.linkedin.monthly[data.linkedin.monthly.length - 1] ?? null;
  const prevLinkedIn = data.linkedin.monthly[data.linkedin.monthly.length - 2] ?? null;
  const latestLinkedInVisitors = data.linkedinVisitors.latest;
  const averageUniqueVisitors =
    data.linkedinVisitors.coverage.days > 0
      ? data.linkedinVisitors.totals.uniqueVisitors / data.linkedinVisitors.coverage.days
      : null;

  const qualityCards = [
    {
      label: "Engagement Rate (X)",
      value: calculateEngagementRate(latestX),
      mom: calculateRateMom(
        calculateEngagementRate(latestX),
        calculateEngagementRate(prevX)
      )
    },
    {
      label: "Engagement Rate (LinkedIn)",
      value: calculateEngagementRate(latestLinkedIn),
      mom: calculateRateMom(
        calculateEngagementRate(latestLinkedIn),
        calculateEngagementRate(prevLinkedIn)
      )
    },
    {
      label: "CTR (LinkedIn)",
      value: calculateCtr(latestLinkedIn),
      mom: calculateRateMom(calculateCtr(latestLinkedIn), calculateCtr(prevLinkedIn))
    }
  ];

  const totalWatchTimeMs = data.x.totals.videoWatchTimeMs;
  const totalWatchViews = data.x.totals.videoWatchViews;
  const averageWatchTimeSeconds =
    totalWatchViews > 0 ? totalWatchTimeMs / totalWatchViews / 1000 : null;
  const averageCompletionRate =
    totalWatchViews > 0
      ? data.x.totals.videoCompletionRateSum / totalWatchViews
      : null;

  const efficiencyCards = [
    {
      label: "Follow Conversion (X)",
      value: perThousand(latestX?.newFollows ?? 0, latestX?.views ?? 0),
      hint: "Follows per 1,000 impressions"
    },
    {
      label: "Profile Visit Rate (X)",
      value: perThousand(latestX?.profileVisits ?? 0, latestX?.views ?? 0),
      hint: "Profile visits per 1,000 impressions"
    },
    {
      label: "Save + Share Rate (X)",
      value: perThousand(
        (latestX?.bookmarks ?? 0) + (latestX?.shares ?? 0),
        latestX?.views ?? 0
      ),
      hint: "Bookmarks + shares per 1,000 impressions"
    }
  ];

  const perPostCards = [
    {
      label: "X Avg Engagement / Post",
      value: data.xPerPostStats.averagePerPostLatestMonth,
      period: data.xPerPostStats.latestMonthLabel
    },
    {
      label: "X Median Engagement / Post",
      value: data.xPerPostStats.medianPerPostLatestMonth,
      period: data.xPerPostStats.latestMonthLabel
    },
    {
      label: "LinkedIn Avg Engagement / Post",
      value: data.linkedinPerPostStats.averagePerPostLatestMonth,
      period: data.linkedinPerPostStats.latestMonthLabel
    },
    {
      label: "LinkedIn Median Engagement / Post",
      value: data.linkedinPerPostStats.medianPerPostLatestMonth,
      period: data.linkedinPerPostStats.latestMonthLabel
    },
    {
      label: "X Avg Engagement / Post (All Time)",
      value: data.xPerPostStats.averagePerPost,
      period: "All time"
    },
    {
      label: "LinkedIn Avg Engagement / Post (All Time)",
      value: data.linkedinPerPostStats.averagePerPost,
      period: "All time"
    }
  ];
  const halfLifeBestDay =
    [...data.xPostHalfLife.byWeekday]
      .filter((row) => row.medianHalfLifeHours !== null)
      .sort((a, b) => (a.medianHalfLifeHours ?? 0) - (b.medianHalfLifeHours ?? 0))[0] ??
    null;

  return (
    <main className="px-6 pb-20 pt-10 lg:px-14">
      {/* Hero section explains what the dashboard covers and the current time window. */}
      <section className="hero-shell relative overflow-hidden rounded-[30px] p-10">
        <div
          className="absolute -right-20 -top-20 h-56 w-56 rounded-full blur-3xl"
          style={{ background: "var(--hero-spot-1)" }}
        />
        <div
          className="absolute -bottom-32 left-10 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "var(--hero-spot-2)" }}
        />
        <div className="relative z-20 mb-4 flex flex-col items-end gap-3 md:absolute md:mb-0 md:right-6 md:top-6">
          <ThemeToggle />
          <ManualRefreshButton />
        </div>
        <div className="relative z-10 pr-0 md:pr-56">
          <div>
            <p className="muted text-sm uppercase tracking-[0.3em]">
              Open social analytics
            </p>
            <h1 className="hero-title section-title mt-4 text-3xl font-semibold md:text-5xl">
              Social Metric Dashboard (API + CSV)
            </h1>
            <p className="mt-4 max-w-2xl text-base text-slate">
              Hybrid ingestion from X API and CSV files. Each platform can run
              independently in API or CSV mode, so partial setups still work.
            </p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate">
              <div className="hero-chip rounded-full px-4 py-2">
                Latest MoM: {data.lastMonthLabel} vs {data.previousMonthLabel}
              </div>
              <div className="hero-chip rounded-full px-4 py-2">
                Data freshness: {dataFreshness}
              </div>
              <div className="hero-chip rounded-full px-4 py-2">
                Data pipeline: CSV-first with optional API enrichment
              </div>
              <div className="hero-chip rounded-full px-4 py-2">
                API freshness: X {xApiFreshness}, LinkedIn {linkedInApiFreshness}
              </div>
              <div className="hero-chip rounded-full px-4 py-2">
                X refresh budget: {data.xRefreshGuardrail.refreshesUsedToday}/
                {data.xRefreshGuardrail.dailyCap}
              </div>
              {data.sourceStates.map((state) => (
                <div
                  key={`${state.platform}-${state.mode}`}
                  className="hero-chip rounded-full px-4 py-2"
                >
                  {state.platform.toUpperCase()}: {state.detail}
                </div>
              ))}
            </div>
            {sourceNotes.length > 0 && (
              <p className="muted mt-3 text-xs">
                {sourceNotes.join(" ")}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Setup checklist: clear next steps for API and CSV setup without reading env docs. */}
      <section className="mt-6 card p-6">
        <h2 className="section-title text-xl">Setup Checklist</h2>
        <p className="muted mt-2 text-sm">
          This panel shows what is configured right now and what to fix next.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {data.setupChecks.map((check) => {
            const tone = getSetupTone(check.status);
            return (
              <div key={check.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{check.label}</p>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${tone}`}>
                    {check.status.toUpperCase()}
                  </span>
                </div>
                <p className="muted mt-2 text-xs">{check.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Metric controls: clear ON/OFF status and section visibility toggles. */}
      <section className="mt-6 card p-6">
        <h2 className="section-title text-xl">Metric Controls</h2>
        <p className="muted mt-2 text-sm">
          Toggle dashboard sections without changing stored data. API indicators show which
          advanced datasets are currently active.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatusPill label="X API Enrichment" active={Boolean(xApiEnabled)} />
          <StatusPill
            label="LinkedIn API Enrichment"
            active={Boolean(linkedInApiEnabled)}
          />
          <StatusPill label="X Best Hour Data" active={data.xTimeOfDayAvailable} />
          <StatusPill label="LinkedIn Best Hour Data" active={data.timeOfDayAvailable} />
          <StatusPill
            label="X Video Watch Data"
            active={data.x.totals.videoWatchViews > 0}
          />
          <StatusPill label="X Mentions Data" active={data.xMentions.available} />
          <StatusPill label="X Quote Data" active={data.xQuotes.available} />
          <StatusPill label="X Supporter Data" active={data.xAmplifiers.available} />
          <StatusPill
            label="X Follower Snapshots"
            active={data.xFollowers.snapshots.length > 0}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {METRIC_PANELS.map((panel) => {
            const isVisible = visiblePanels.has(panel.key);
            const href = buildPanelToggleHref(baseQuery, panel.key, visiblePanels);

            return (
              <Link
                key={panel.key}
                href={href}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isVisible
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isVisible ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                />
                {panel.label}
              </Link>
            );
          })}
        </div>
      </section>


      {/* Top-line KPIs: latest month snapshot with MoM context. */}
      {visiblePanels.has("snapshot") && (
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="section-title text-2xl">
              Latest Month Snapshot ({latestMonthLabel})
            </h2>
            <p className="muted text-sm">{latestMonthCoverage}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {latestMonthCards.map((card) => (
            <div key={card.label} className="card p-6">
              <p className="muted text-sm">{card.label}</p>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="section-title text-3xl">
                  {formatCompact(card.value)}
                </span>
                <span className="muted text-sm">
                  {card.mom !== null
                    ? `${formatPercent(card.mom)} MoM`
                    : "MoM n/a"}
                </span>
              </div>
              <p className="muted mt-2 text-xs">
                {card.mom !== null
                  ? `vs ${data.previousMonthLabel}`
                  : "Month-over-month comparison not available"}
              </p>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* Totals row: full-range cumulative numbers without MoM. */}
      {visiblePanels.has("totals") && (
      <section className="mt-10">
        <h2 className="section-title text-2xl">Totals (All Time)</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {totalCards.map((card) => (
            <div key={card.label} className="card p-6">
              <p className="muted text-sm">{card.label}</p>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="section-title text-3xl">
                  {formatCompact(card.value)}
                </span>
              </div>
              <p className="muted mt-2 text-xs">Full range of available data</p>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* Data health: coverage plus CSV validation so imports never crash silently. */}
      {visiblePanels.has("data_quality") && (
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="section-title text-2xl">Data Quality</h2>
            <p className="muted text-sm">
              Coverage checks and CSV validation for every dataset.
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {data.dataQuality.map((quality) => (
            <div key={quality.label} className="card p-6">
              <p className="muted text-sm">{quality.label}</p>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="section-title text-3xl">
                  {quality.coverage.days}
                </span>
                <span className="muted text-sm">days</span>
              </div>
              <div className="mt-4 grid gap-2 text-xs text-slate">
                <span>
                  Range: {formatDateRange(quality.coverage.start, quality.coverage.end)}
                </span>
                <span>
                  Expected days:{" "}
                  {quality.expectedDays !== null ? quality.expectedDays : "n/a"}
                </span>
                <span>
                  Missing days:{" "}
                  {quality.missingDays !== null ? quality.missingDays : "n/a"}
                </span>
                <span>Zero-view days: {quality.zeroViewDays}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 card p-6">
          <h3 className="section-title text-lg">CSV Validation</h3>
          <p className="muted text-sm">
            Required columns must be present; optional columns unlock more panels.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-slate">
                <tr>
                  <th className="pb-3 pr-4">Dataset</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Rows</th>
                  <th className="pb-3 pr-4">Missing Required</th>
                  <th className="pb-3 pr-4">Missing Optional</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.csvValidation.map((item) => {
                  const status = getValidationStatus(item);
                  return (
                    <tr key={item.id} className="text-slate">
                      <td className="py-4 pr-4">
                        <span className="font-semibold text-ink">{item.label}</span>
                        <p className="mt-1 text-xs text-slate">
                          {item.filePath} ({item.source})
                        </p>
                      </td>
                      <td className="py-4 pr-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="py-4 pr-4">{item.rowCount}</td>
                      <td className="py-4 pr-4">
                        {formatMissingList(item.missingRequired)}
                      </td>
                      <td className="py-4 pr-4">
                        {formatMissingList(item.missingOptional)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      )}

      {/* Quality signals: CTR and engagement rate trends by platform. */}
      {visiblePanels.has("quality_signals") && (
      <section className="mt-10">
        <h2 className="section-title text-2xl">Quality Signals</h2>
        <p className="muted mt-2 text-sm">
          These ratios focus on quality, not just volume.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {qualityCards.map((card) => (
            <div key={card.label} className="card p-6">
              <p className="muted text-sm">{card.label}</p>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="section-title text-3xl">
                  {formatPercent(card.value)}
                </span>
                <span className="muted text-sm">
                  {card.mom !== null
                    ? `${formatPercent(card.mom)} MoM`
                    : "MoM n/a"}
                </span>
              </div>
              <p className="muted mt-2 text-xs">
                {card.mom !== null
                  ? `vs ${data.previousMonthLabel}`
                  : "Month-over-month comparison not available"}
              </p>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* Per-post engagement signals: adds average + median perspective. */}
      {visiblePanels.has("per_post") && (
      <section className="mt-10">
        <h2 className="section-title text-2xl">Per-Post Engagement</h2>
        <p className="muted mt-2 text-sm">
          Uses average and median engagement-per-post to reduce outlier bias.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {perPostCards.map((card) => (
            <div key={card.label} className="card p-6">
              <p className="muted text-sm">{card.label}</p>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="section-title text-3xl">
                  {formatPerPost(card.value)}
                </span>
              </div>
              <p className="muted mt-2 text-xs">{card.period}</p>
            </div>
          ))}
        </div>
        <p className="muted mt-3 text-xs">
          Median is calculated from daily engagement-per-post values where post counts exist.
        </p>
      </section>
      )}

      {/* Efficiency signals: rate-per-1k metrics for X. */}
      {visiblePanels.has("efficiency_signals") && (
      <section className="mt-10">
        <h2 className="section-title text-2xl">Efficiency Signals (X)</h2>
        <p className="muted mt-2 text-sm">
          Normalized to 1,000 impressions for easy comparisons.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {efficiencyCards.map((card) => (
            <div key={card.label} className="card p-6">
              <p className="muted text-sm">{card.label}</p>
              <div className="mt-3 flex items-baseline gap-3">
                <span className="section-title text-3xl">
                  {card.value !== null ? card.value.toFixed(1) : "n/a"}
                </span>
                <span className="muted text-sm">per 1k</span>
              </div>
              <p className="muted mt-2 text-xs">{card.hint}</p>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* Video watch time summary (X). */}
      {visiblePanels.has("video_watch") && (
      <section className="mt-10">
        <h2 className="section-title text-2xl">Video Watch Time (X)</h2>
        <p className="muted mt-2 text-sm">
          Requires <span className="font-semibold text-ink">Data/raw/x_video_overview.csv</span>.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="card p-6">
            <p className="muted text-sm">Total Watch Time</p>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="section-title text-3xl">
                {totalWatchTimeMs ? formatDurationMs(totalWatchTimeMs) : "n/a"}
              </span>
            </div>
            <p className="muted mt-2 text-xs">From video overview export</p>
          </div>
          <div className="card p-6">
            <p className="muted text-sm">Average Watch Time</p>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="section-title text-3xl">
                {averageWatchTimeSeconds !== null
                  ? formatSecondsAsClock(averageWatchTimeSeconds)
                  : "n/a"}
              </span>
            </div>
            <p className="muted mt-2 text-xs">Weighted by video views</p>
          </div>
          <div className="card p-6">
            <p className="muted text-sm">Avg Completion Rate</p>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="section-title text-3xl">
                {averageCompletionRate !== null
                  ? formatPercent(averageCompletionRate)
                  : "n/a"}
              </span>
            </div>
            <p className="muted mt-2 text-xs">Weighted by video views</p>
          </div>
        </div>
      </section>
      )}

      {/* Chart suite: combined + platform-specific trends. */}
      {visiblePanels.has("overview_visuals") && (
      <section className="mt-12">
        <h2 className="section-title text-2xl">Overview Visuals</h2>
        <p className="muted mt-2 max-w-2xl text-sm">
          Charts are split by platform and combined. If one platform has fewer
          reporting days, you&apos;ll see the gaps reflected in the trend lines.
        </p>
        <div className="mt-6">
          <DashboardCharts
            combinedMonthly={data.combined.monthly}
            xMonthly={data.x.monthly}
            linkedinMonthly={data.linkedin.monthly}
            engagementMix={data.engagementMix}
            linkedinContentTypes={data.linkedinContentTypes}
          />
        </div>
      </section>
      )}

      {/* Coverage cards communicate how complete each platform export is. */}
      <section className="mt-12 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="section-title text-lg">X Coverage</h3>
          <p className="muted text-sm">
            {formatDateRange(data.x.coverage.start, data.x.coverage.end)} -{" "}
            {data.x.coverage.days} reporting days
          </p>
          <div className="mt-6 grid gap-4 text-sm text-slate">
            <div className="flex items-center justify-between">
              <span>Views</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.x.totals.views)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Likes</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.x.totals.likes)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Comments</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.x.totals.comments)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Reposts + Shares</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.x.totals.reposts)}
              </span>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="section-title text-lg">LinkedIn Coverage</h3>
          <p className="muted text-sm">
            {formatDateRange(
              data.linkedin.coverage.start,
              data.linkedin.coverage.end
            )} - {data.linkedin.coverage.days} reporting days
          </p>
          <div className="mt-6 grid gap-4 text-sm text-slate">
            <div className="flex items-center justify-between">
              <span>Impressions</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.linkedin.totals.views)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Reactions</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.linkedin.totals.likes)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Comments</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.linkedin.totals.comments)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Reposts</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.linkedin.totals.reposts)}
              </span>
            </div>
          </div>
          <p className="muted mt-4 text-xs">
            LinkedIn post counts are pulled from Data/raw/linkedin_posts.csv when
            it is available.
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="section-title text-lg">LinkedIn Visitors (Optional CSV)</h3>
          <p className="muted text-sm">
            {formatDateRange(
              data.linkedinVisitors.coverage.start,
              data.linkedinVisitors.coverage.end
            )} - {data.linkedinVisitors.coverage.days} reporting days
          </p>
          <div className="mt-6 grid gap-4 text-sm text-slate">
            <div className="flex items-center justify-between">
              <span>Total Page Views</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.linkedinVisitors.totals.pageViews)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Total Unique Visitors</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.linkedinVisitors.totals.uniqueVisitors)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Latest Page Views</span>
              <span className="font-semibold text-ink">
                {latestLinkedInVisitors
                  ? formatNumber(latestLinkedInVisitors.pageViews)
                  : "n/a"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Avg Unique Visitors / Day</span>
              <span className="font-semibold text-ink">
                {averageUniqueVisitors !== null
                  ? formatCompact(averageUniqueVisitors)
                  : "n/a"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Custom Button Clicks</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.linkedinVisitors.totals.customButtonClicks)}
              </span>
            </div>
          </div>
          <p className="muted mt-4 text-xs">
            Auto-detects files named like{" "}
            <span className="font-semibold text-ink">linkedin_visitors_YYYY-MM.csv</span>.
          </p>
        </div>

        <div className="card p-6">
          <h3 className="section-title text-lg">LinkedIn Followers (Optional CSV)</h3>
          <p className="muted text-sm">
            {formatDateRange(
              data.linkedinFollowers.coverage.start,
              data.linkedinFollowers.coverage.end
            )} - {data.linkedinFollowers.coverage.days} reporting days
          </p>
          <div className="mt-6 grid gap-4 text-sm text-slate">
            <div className="flex items-center justify-between">
              <span>Latest Total Followers</span>
              <span className="font-semibold text-ink">
                {data.linkedinFollowers.latestTotalFollowers !== null
                  ? formatNumber(data.linkedinFollowers.latestTotalFollowers)
                  : "n/a"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Total New Followers</span>
              <span className="font-semibold text-ink">
                {formatNumber(data.linkedinFollowers.totalNewFollowers)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Avg New Followers / Day</span>
              <span className="font-semibold text-ink">
                {data.linkedinFollowers.averageNewFollowersPerDay !== null
                  ? formatCompact(data.linkedinFollowers.averageNewFollowersPerDay)
                  : "n/a"}
              </span>
            </div>
          </div>
          <p className="muted mt-4 text-xs">
            Auto-detects files named like{" "}
            <span className="font-semibold text-ink">linkedin_followers_YYYY-MM.csv</span>.
          </p>
        </div>
      </section>

      {/* Top X posts: requires the post-level X export. */}
      {visiblePanels.has("top_posts") && (
      <section className="mt-12 card p-6">
        <h3 className="section-title text-lg">Top X Posts</h3>
        <p className="muted text-sm">
          Ranked by impressions from the X post analytics export.
        </p>
        {data.xTopPosts.length === 0 ? (
          <p className="muted mt-4 text-sm">
            Add <span className="font-semibold text-ink">Data/raw/x_post_analytics.csv</span>{" "}
            (or any account_analytics_content_*.csv export) to see this table.
            You can also set X_POSTS_CSV_PATH for a custom filename.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-slate">
                <tr>
                  <th className="pb-3 pr-4">Post</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Impressions</th>
                  <th className="pb-3 pr-4">Engagements</th>
                  <th className="pb-3 pr-4">Likes</th>
                  <th className="pb-3 pr-4">Reposts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.xTopPosts.map((post) => {
                  const engagements =
                    post.engagements || post.likes + post.replies + post.reposts;
                  return (
                    <tr key={post.link || post.text} className="text-slate">
                      <td className="py-4 pr-4">
                        {post.link ? (
                          <a
                            className="font-semibold text-ink hover:underline"
                            href={post.link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {post.text || "Untitled X post"}
                          </a>
                        ) : (
                          <span className="font-semibold text-ink">
                            {post.text || "Untitled X post"}
                          </span>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        {post.createdAt ? formatDateShort(post.createdAt) : "n/a"}
                      </td>
                      <td className="py-4 pr-4">{formatNumber(post.impressions)}</td>
                      <td className="py-4 pr-4">{formatNumber(engagements)}</td>
                      <td className="py-4 pr-4">{formatNumber(post.likes)}</td>
                      <td className="py-4 pr-4">{formatNumber(post.reposts)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* Top LinkedIn content table: helps spot which posts drive the most reach. */}
      {visiblePanels.has("top_posts") && (
      <section className="mt-12 card p-6">
        <h3 className="section-title text-lg">Top LinkedIn Posts</h3>
        <p className="muted text-sm">
          Ranked by impressions from the LinkedIn \"All posts\" export.
        </p>
        {data.linkedinTopPosts.length === 0 ? (
          <p className="muted mt-4 text-sm">
            No post-level CSV detected yet. Add{" "}
            <span className="font-semibold text-ink">Data/raw/linkedin_posts.csv</span>{" "}
            to see the top-performing posts.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-slate">
                <tr>
                  <th className="pb-3 pr-4">Post</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Impressions</th>
                  <th className="pb-3 pr-4">Engagements</th>
                  <th className="pb-3 pr-4">Views</th>
                  <th className="pb-3 pr-4">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.linkedinTopPosts.map((post) => {
                  const engagements = post.likes + post.comments + post.reposts;
                  return (
                    <tr key={post.link || post.title} className="text-slate">
                      <td className="py-4 pr-4">
                        <a
                          className="font-semibold text-ink hover:underline"
                          href={post.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {post.title || "Untitled LinkedIn post"}
                        </a>
                      </td>
                      <td className="py-4 pr-4">{formatDateShort(post.createdAt)}</td>
                      <td className="py-4 pr-4">{formatNumber(post.impressions)}</td>
                      <td className="py-4 pr-4">{formatNumber(engagements)}</td>
                      <td className="py-4 pr-4">{formatNumber(post.views)}</td>
                      <td className="py-4 pr-4">{post.contentType || "n/a"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* Top LinkedIn posts by engagement rate. */}
      {visiblePanels.has("top_posts") && (
      <section className="mt-12 card p-6">
        <h3 className="section-title text-lg">Top LinkedIn Posts (Engagement Rate)</h3>
        <p className="muted text-sm">
          Ranked by engagements divided by impressions.
        </p>
        {data.linkedinTopPostsByRate.length === 0 ? (
          <p className="muted mt-4 text-sm">
            No post-level CSV detected yet. Add{" "}
            <span className="font-semibold text-ink">Data/raw/linkedin_posts.csv</span>{" "}
            to see this breakdown.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-slate">
                <tr>
                  <th className="pb-3 pr-4">Post</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 pr-4">Engagement Rate</th>
                  <th className="pb-3 pr-4">Impressions</th>
                  <th className="pb-3 pr-4">Engagements</th>
                  <th className="pb-3 pr-4">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.linkedinTopPostsByRate.map((post) => {
                  const engagements = post.likes + post.comments + post.reposts;
                  return (
                    <tr key={post.link || post.title} className="text-slate">
                      <td className="py-4 pr-4">
                        <a
                          className="font-semibold text-ink hover:underline"
                          href={post.link}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {post.title || "Untitled LinkedIn post"}
                        </a>
                      </td>
                      <td className="py-4 pr-4">{formatDateShort(post.createdAt)}</td>
                      <td className="py-4 pr-4">
                        {post.engagementRate !== null
                          ? formatPercent(post.engagementRate)
                          : "n/a"}
                      </td>
                      <td className="py-4 pr-4">{formatNumber(post.impressions)}</td>
                      <td className="py-4 pr-4">{formatNumber(engagements)}</td>
                      <td className="py-4 pr-4">{post.contentType || "n/a"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* Best times to post for X: uses post-level timestamps from CSV/API when available. */}
      {visiblePanels.has("best_times") && (
      <section className="mt-12 card p-6">
        <h3 className="section-title text-lg">Best Times to Post (X)</h3>
        <p className="muted text-sm">
          Ranked by engagement rate from X post-level data.
        </p>
        {!data.xTimeOfDayAvailable && (
          <p className="muted mt-2 text-xs">
            Time-of-day is not available in current X sources. Showing best days only.
          </p>
        )}
        {data.xBestTimes.length === 0 ? (
          <p className="muted mt-4 text-sm">
            Add <span className="font-semibold text-ink">Data/raw/x_post_analytics.csv</span>{" "}
            or use X API mode to see this breakdown.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.xBestTimes.map((slot) => (
              <div
                key={`x-${slot.label}`}
                className="rounded-xl border border-slate-200 bg-white px-4 py-4"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-slate">
                  {slot.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {slot.engagementRate !== null
                    ? formatPercent(slot.engagementRate)
                    : "n/a"}
                </p>
                <p className="muted mt-1 text-xs">
                  {slot.posts} posts - {formatNumber(slot.impressions)} impressions
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {/* Best times to post: uses time-of-day if available, otherwise day-of-week. */}
      {visiblePanels.has("best_times") && (
      <section className="mt-12 card p-6">
        <h3 className="section-title text-lg">Best Times to Post (LinkedIn)</h3>
        <p className="muted text-sm">
          Ranked by engagement rate from the \"All posts\" export.
        </p>
        {!data.timeOfDayAvailable && (
          <p className="muted mt-2 text-xs">
            Time-of-day is not available in this export. Showing best days only.
          </p>
        )}
        {data.bestTimes.length === 0 ? (
          <p className="muted mt-4 text-sm">
            No post-level CSV detected yet. Add{" "}
            <span className="font-semibold text-ink">Data/raw/linkedin_posts.csv</span>{" "}
            to see this breakdown.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.bestTimes.map((slot) => (
              <div
                key={slot.label}
                className="rounded-xl border border-slate-200 bg-white px-4 py-4"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-slate">
                  {slot.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {slot.engagementRate !== null
                    ? formatPercent(slot.engagementRate)
                    : "n/a"}
                </p>
                <p className="muted mt-1 text-xs">
                  {slot.posts} posts - {formatNumber(slot.impressions)} impressions
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
      )}

      {visiblePanels.has("time_matrix") && (
      <section className="mt-12 card p-6">
        <h3 className="section-title text-lg">Best Day + Hour Matrix</h3>
        <p className="muted text-sm">
          Heatmap of engagement rate by day and posting hour (UTC), split by platform.
        </p>
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <TimeMatrixCard
            title="X Matrix"
            slots={data.xTimeMatrix}
            showHourly={data.xTimeOfDayAvailable}
            emptyState="Add X post analytics CSV or enable X API to populate this matrix."
          />
          <TimeMatrixCard
            title="LinkedIn Matrix"
            slots={data.linkedinTimeMatrix}
            showHourly={data.timeOfDayAvailable}
            emptyState="Add LinkedIn posts CSV with Created date timestamps to populate this matrix."
          />
        </div>
      </section>
      )}

      {/* Day-of-week heatmap: visually shows the strongest days for views. */}
      <section className="mt-12 card p-6">
        <h3 className="section-title text-lg">Day-of-Week Performance</h3>
        <p className="muted text-sm">
          Average combined views per calendar day (X + LinkedIn).
        </p>
        <div className="mt-6 grid grid-cols-7 gap-3">
          {renderDayOfWeekHeatmap(data.dayOfWeek)}
        </div>
      </section>

      {/* X API intelligence panels */}
      {visiblePanels.has("x_guardrails") && (
      <section className="mt-10 card p-6">
        <h2 className="section-title text-2xl">X Refresh Guardrails</h2>
        <p className="muted mt-2 text-sm">
          Manual API refreshes are protected by cooldown, daily cap, and in-flight lock.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <p className="muted text-xs">Cooldown</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {formatDurationShort(data.xRefreshGuardrail.cooldownSeconds)}
            </p>
            <p className="muted mt-1 text-xs">Minimum wait after each manual refresh.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <p className="muted text-xs">Daily Cap</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {data.xRefreshGuardrail.dailyCap}
            </p>
            <p className="muted mt-1 text-xs">Max manual refreshes per UTC day.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <p className="muted text-xs">Used Today</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {data.xRefreshGuardrail.refreshesUsedToday}
            </p>
            <p className="muted mt-1 text-xs">Day key: {data.xRefreshGuardrail.dayKey}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <p className="muted text-xs">Remaining Today</p>
            <p className="mt-2 text-2xl font-semibold text-ink">
              {data.xRefreshGuardrail.refreshesRemainingToday}
            </p>
            <p className="muted mt-1 text-xs">
              {data.xRefreshGuardrail.nextAllowedAt
                ? `Next allowed: ${formatDateTimeShort(data.xRefreshGuardrail.nextAllowedAt)}`
                : "No cooldown active"}
            </p>
          </div>
        </div>
        {data.xRefreshGuardrail.inFlight && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            A manual refresh is currently running. Wait before triggering another call.
          </p>
        )}
        {data.xRefreshGuardrail.blockedReason && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {data.xRefreshGuardrail.blockedReason}
          </p>
        )}
      </section>
      )}

      {visiblePanels.has("x_mentions") && (
      <section className="mt-10 card p-6">
        <h2 className="section-title text-2xl">Mentions Intelligence (X API)</h2>
        <p className="muted mt-2 text-sm">
          Daily mention volume, unique mentioners, verified mentioners, and top mentioning accounts.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          <MetricStatCard label="Total Mentions" value={formatCompact(data.xMentions.totalMentions)} />
          <MetricStatCard
            label="Unique Mentioners"
            value={formatCompact(data.xMentions.uniqueMentioners)}
          />
          <MetricStatCard
            label="Verified Mentioners"
            value={formatCompact(data.xMentions.verifiedMentioners)}
          />
          <MetricStatCard
            label="Latest Day Mentions"
            value={latestMentionsDay ? formatCompact(latestMentionsDay.mentions) : "n/a"}
            hint={latestMentionsDay ? formatDateShort(latestMentionsDay.date) : "No mention rows"}
          />
        </div>
        {data.xMentions.note && (
          <p className="muted mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            {data.xMentions.note}
          </p>
        )}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white/80 p-4">
          <h3 className="text-sm font-semibold text-ink">Mentions Velocity (7-day baseline)</h3>
          <p className="muted mt-1 text-xs">
            Detects abnormal mention bursts using rolling 7-day baseline and spike thresholds.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="muted text-[11px] uppercase tracking-[0.12em]">Latest Baseline</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {latestMentionVelocity?.rolling7d !== null &&
                latestMentionVelocity?.rolling7d !== undefined
                  ? latestMentionVelocity.rolling7d.toFixed(1)
                  : "n/a"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="muted text-[11px] uppercase tracking-[0.12em]">Spike Days</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {formatNumber(data.xMentions.spikes.length)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="muted text-[11px] uppercase tracking-[0.12em]">Largest Spike</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {topMentionSpike ? `${topMentionSpike.spikeRatio.toFixed(1)}x` : "n/a"}
              </p>
            </div>
          </div>
          {mentionVelocityTail.length > 0 && (
            <div className="mt-4 space-y-2">
              {mentionVelocityTail.map((point) => {
                const maxMentions = Math.max(
                  ...mentionVelocityTail.map((item) => item.mentions),
                  1
                );
                const width = Math.max(4, Math.round((point.mentions / maxMentions) * 100));
                return (
                  <div key={`mentions-velocity-${point.date.toISOString()}`}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-ink">{formatDateShort(point.date)}</span>
                      <span className="text-slate">
                        {formatNumber(point.mentions)} mentions · baseline{" "}
                        {point.rolling7d !== null ? point.rolling7d.toFixed(1) : "n/a"}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-indigo-500"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {data.xMentions.spikes.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="uppercase tracking-[0.12em] text-slate">
                  <tr>
                    <th className="pb-2 pr-3">Spike Day</th>
                    <th className="pb-2 pr-3">Mentions</th>
                    <th className="pb-2 pr-3">7d Baseline</th>
                    <th className="pb-2 pr-3">Spike Ratio</th>
                    <th className="pb-2 pr-3">Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.xMentions.spikes.slice(0, 6).map((spike) => (
                    <tr key={`mention-spike-${spike.date.toISOString()}`} className="text-slate">
                      <td className="py-2 pr-3">{formatDateShort(spike.date)}</td>
                      <td className="py-2 pr-3">{formatNumber(spike.mentions)}</td>
                      <td className="py-2 pr-3">{spike.rolling7d.toFixed(1)}</td>
                      <td className="py-2 pr-3">{spike.spikeRatio.toFixed(2)}x</td>
                      <td className="py-2 pr-3">+{spike.spikeDelta.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {data.xMentions.topMentioners.length === 0 ? (
          <p className="muted mt-6 text-sm">
            No mention accounts in current API window.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-slate">
                <tr>
                  <th className="pb-3 pr-4">Account</th>
                  <th className="pb-3 pr-4">Verified</th>
                  <th className="pb-3 pr-4">Mentions</th>
                  <th className="pb-3 pr-4">Mention Engagements</th>
                  <th className="pb-3 pr-4">Last Mention</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.xMentions.topMentioners.map((account) => (
                  <tr key={`mentioner-${account.userId}`} className="text-slate">
                    <td className="py-4 pr-4">
                      {account.handle !== "@unknown" ? (
                        <a
                          href={`https://x.com/${account.handle.replace("@", "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-ink hover:underline"
                        >
                          {account.handle}
                        </a>
                      ) : (
                        <span className="font-semibold text-ink">{account.handle}</span>
                      )}
                      <p className="muted mt-1 text-xs">{account.name}</p>
                    </td>
                    <td className="py-4 pr-4">
                      {account.verified ? "Yes" : "No"}
                    </td>
                    <td className="py-4 pr-4">{formatNumber(account.mentions)}</td>
                    <td className="py-4 pr-4">{formatNumber(account.engagements)}</td>
                    <td className="py-4 pr-4">
                      {account.lastMentionAt ? formatDateShort(account.lastMentionAt) : "n/a"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {visiblePanels.has("x_supporters") && (
      <section className="mt-10 card p-6">
        <h2 className="section-title text-2xl">Repeat Supporters & Amplifiers (X API)</h2>
        <p className="muted mt-2 text-sm">
          Combines <span className="font-semibold text-ink">retweeted_by</span> and{" "}
          <span className="font-semibold text-ink">liking_users</span> to rank supporters.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          <MetricStatCard
            label="Total Supporters"
            value={formatCompact(data.xAmplifiers.totalSupporters)}
          />
          <MetricStatCard
            label={`Repeat Supporters (>=${data.xAmplifiers.repeatThreshold})`}
            value={formatCompact(data.xAmplifiers.repeatSupporters)}
          />
          <MetricStatCard
            label="Verified Supporters"
            value={formatCompact(data.xAmplifiers.verifiedSupporters)}
          />
          <MetricStatCard
            label="Verified Repeat Supporters"
            value={formatCompact(data.xAmplifiers.repeatSupportersVerified)}
            hint={`${data.xAmplifiers.scannedPosts} source posts scanned`}
          />
        </div>
        {data.xAmplifiers.note && (
          <p className="muted mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            {data.xAmplifiers.note}
          </p>
        )}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white/80 p-4">
          <h3 className="text-sm font-semibold text-ink">Supporter Retention (Week-over-Week)</h3>
          <p className="muted mt-1 text-xs">
            Uses supporter interactions on posts created in each week (UTC) to estimate returning supporters.
          </p>
          {data.xAmplifiers.retention.length < 2 ? (
            <p className="muted mt-3 text-xs">
              Need at least two weeks of source posts to compute retention.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {data.xAmplifiers.retention.map((point) => {
                const width =
                  point.retentionRate !== null
                    ? Math.max(2, Math.round(point.retentionRate * 100))
                    : 0;
                return (
                  <div key={`retention-${point.weekKey}`}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-ink">{point.label}</span>
                      <span className="text-slate">
                        supporters {formatNumber(point.supporters)} · returning{" "}
                        {formatNumber(point.returningSupporters)} · new{" "}
                        {formatNumber(point.newSupporters)} · rate{" "}
                        {point.retentionRate !== null
                          ? formatPercent(point.retentionRate)
                          : "n/a"}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      {point.retentionRate !== null && (
                        <div
                          className="h-2 rounded-full bg-emerald-500"
                          style={{ width: `${width}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4">
          <h3 className="text-sm font-semibold text-ink">Supporter Cohort Retention</h3>
          <p className="muted mt-1 text-xs">
            Tracks supporters by first-seen week and shows return rates by cohort age.
          </p>
          {!data.xAmplifiers.cohortRetention.available ? (
            <p className="muted mt-3 text-xs">
              {data.xAmplifiers.cohortRetention.note ??
                "Need at least two weeks of data to build cohorts."}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead className="uppercase tracking-[0.12em] text-slate">
                  <tr>
                    <th className="pb-2 pr-3">Cohort Week</th>
                    <th className="pb-2 pr-3">Cohort Size</th>
                    {Array.from(
                      { length: data.xAmplifiers.cohortRetention.maxWeekOffset + 1 },
                      (_, offset) => (
                        <th key={`cohort-offset-head-${offset}`} className="pb-2 pr-3">
                          W+{offset}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.xAmplifiers.cohortRetention.rows.map((row) => (
                    <tr key={`supporter-cohort-${row.cohortWeekKey}`} className="text-slate">
                      <td className="py-2 pr-3 font-semibold text-ink">{row.cohortLabel}</td>
                      <td className="py-2 pr-3">{formatNumber(row.cohortSize)}</td>
                      {Array.from(
                        { length: data.xAmplifiers.cohortRetention.maxWeekOffset + 1 },
                        (_, offset) => {
                          const cell = row.cells.find((item) => item.weekOffset === offset);
                          if (!cell) {
                            return (
                              <td key={`cohort-cell-${row.cohortWeekKey}-${offset}`} className="py-2 pr-3">
                                —
                              </td>
                            );
                          }
                          const alpha = 0.1 + cell.retentionRate * 0.7;
                          return (
                            <td key={`cohort-cell-${row.cohortWeekKey}-${offset}`} className="py-2 pr-3">
                              <span
                                className="rounded px-2 py-1 font-semibold"
                                style={{
                                  backgroundColor: `rgba(16,185,129,${alpha})`,
                                  color: cell.retentionRate > 0.55 ? "#052e16" : "#14532d"
                                }}
                              >
                                {formatPercent(cell.retentionRate)}
                              </span>
                            </td>
                          );
                        }
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="muted text-xs">Filter:</span>
          <Link
            href={buildSupporterFilterHref(baseQuery, "all")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              supporterFilter === "all"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-300 bg-white text-slate-600"
            }`}
          >
            All
          </Link>
          <Link
            href={buildSupporterFilterHref(baseQuery, "verified")}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              supporterFilter === "verified"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-300 bg-white text-slate-600"
            }`}
          >
            Verified Only
          </Link>
          <a
            href={supporterCsvHref}
            download={`x_supporters_${supporterFilter}.csv`}
            className="ml-auto rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Download CSV
          </a>
        </div>
        {supporterRows.length === 0 ? (
          <p className="muted mt-6 text-sm">
            No supporter rows available for the current filter.
          </p>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-slate">
                <tr>
                  <th className="pb-3 pr-4">Account</th>
                  <th className="pb-3 pr-4">Verified</th>
                  <th className="pb-3 pr-4">Interactions</th>
                  <th className="pb-3 pr-4">Likes</th>
                  <th className="pb-3 pr-4">Reposts</th>
                  <th className="pb-3 pr-4">Supporting Posts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {supporterRows.map((account) => (
                  <tr key={`supporter-${account.userId}`} className="text-slate">
                    <td className="py-4 pr-4">
                      {account.handle !== "@unknown" ? (
                        <a
                          href={`https://x.com/${account.handle.replace("@", "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-ink hover:underline"
                        >
                          {account.handle}
                        </a>
                      ) : (
                        <span className="font-semibold text-ink">{account.handle}</span>
                      )}
                      <p className="muted mt-1 text-xs">{account.name}</p>
                    </td>
                    <td className="py-4 pr-4">{account.verified ? "Yes" : "No"}</td>
                    <td className="py-4 pr-4">{formatNumber(account.interactions)}</td>
                    <td className="py-4 pr-4">{formatNumber(account.likes)}</td>
                    <td className="py-4 pr-4">{formatNumber(account.reposts)}</td>
                    <td className="py-4 pr-4">{formatNumber(account.supportingPosts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {visiblePanels.has("x_cohort") && (
      <section className="mt-10 card p-6">
        <h2 className="section-title text-2xl">Engagement Cohort (X API)</h2>
        <p className="muted mt-2 text-sm">
          Groups posts by publish week, then compares median engagement as each post ages.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          <MetricStatCard label="Cohort Weeks" value={formatCompact(cohortRows.length)} />
          <MetricStatCard label="Posts in Cohorts" value={formatCompact(cohortPosts)} />
          <MetricStatCard
            label="Median Cohort ER"
            value={cohortMedianRate !== null ? formatPercent(cohortMedianRate) : "n/a"}
          />
          <MetricStatCard
            label="Age Buckets"
            value={formatCompact(data.xEngagementCohort.ageBuckets.length)}
            hint={data.xEngagementCohort.ageBuckets.join(", ")}
          />
        </div>
        {data.xEngagementCohort.note && (
          <p className="muted mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            {data.xEngagementCohort.note}
          </p>
        )}
        {cohortRows.length === 0 ? (
          <p className="muted mt-6 text-sm">
            No cohort rows available in the current API lookback window.
          </p>
        ) : (
          <EngagementCohortMatrix
            rows={cohortRows}
            ageBuckets={data.xEngagementCohort.ageBuckets}
          />
        )}
      </section>
      )}

      {visiblePanels.has("x_concentration") && (
      <section className="mt-10 card p-6">
        <h2 className="section-title text-2xl">Engagement Concentration (X API)</h2>
        <p className="muted mt-2 text-sm">
          Shows how much engagement comes from top supporters vs. the wider community.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          <MetricStatCard
            label="Top 10 Supporters Share"
            value={
              data.xAmplifiers.top10Share !== null
                ? formatPercent(data.xAmplifiers.top10Share)
                : "n/a"
            }
          />
          <MetricStatCard
            label="Top 20 Supporters Share"
            value={
              data.xAmplifiers.top20Share !== null
                ? formatPercent(data.xAmplifiers.top20Share)
                : "n/a"
            }
          />
          <MetricStatCard
            label="Tracked Interactions"
            value={formatCompact(data.xAmplifiers.totalInteractions)}
            hint="Likes + reposts on scanned source posts"
          />
          <MetricStatCard
            label="Concentration Risk"
            value={formatRiskLabel(data.xAmplifiers.concentrationRisk)}
            hint="Based on top-10 share and Gini concentration"
          />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="muted text-[11px] uppercase tracking-[0.12em]">Gini Index</p>
            <p className="mt-1 text-lg font-semibold text-ink">
              {data.xAmplifiers.gini !== null ? data.xAmplifiers.gini.toFixed(3) : "n/a"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="muted text-[11px] uppercase tracking-[0.12em]">HHI</p>
            <p className="mt-1 text-lg font-semibold text-ink">
              {data.xAmplifiers.hhi !== null ? data.xAmplifiers.hhi.toFixed(3) : "n/a"}
            </p>
          </div>
        </div>
        {data.xAmplifiers.concentrationCurve.length === 0 ? (
          <p className="muted mt-6 text-sm">
            Need supporter interactions to build the concentration curve.
          </p>
        ) : (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white/80 p-4">
            <h3 className="text-sm font-semibold text-ink">Cumulative Interaction Share</h3>
            <p className="muted mt-1 text-xs">
              Each row shows what share of total interactions is captured by top-N supporters.
            </p>
            <div className="mt-4 space-y-3">
              {data.xAmplifiers.concentrationCurve.map((point) => {
                const width = Math.max(2, Math.round(point.cumulativeShare * 100));
                return (
                  <div key={`curve-${point.rank}`}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-ink">Top {point.rank}</span>
                      <span className="text-slate">{formatPercent(point.cumulativeShare)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-blue-500"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      )}

      {visiblePanels.has("x_quotes") && (
      <section className="mt-10 card p-6">
        <h2 className="section-title text-2xl">Quote Post Analytics (X API)</h2>
        <p className="muted mt-2 text-sm">
          Tracks who quote-posts your tweets, quote volume by source post, and quote quality trend.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          <MetricStatCard label="Total Quotes" value={formatCompact(data.xQuotes.totalQuotes)} />
          <MetricStatCard
            label="Unique Quote Authors"
            value={formatCompact(data.xQuotes.uniqueQuoteAuthors)}
          />
          <MetricStatCard
            label="Verified Quote Authors"
            value={formatCompact(data.xQuotes.verifiedQuoteAuthors)}
          />
          <MetricStatCard
            label="Latest Day Quotes"
            value={latestQuotesDay ? formatCompact(latestQuotesDay.quotes) : "n/a"}
            hint={latestQuotesDay ? formatDateShort(latestQuotesDay.date) : "No quote rows"}
          />
        </div>
        {data.xQuotes.note && (
          <p className="muted mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            {data.xQuotes.note}
          </p>
        )}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white/80 p-4">
          <h3 className="text-sm font-semibold text-ink">Quote Impact Funnel</h3>
          <p className="muted mt-1 text-xs">
            Tracks quote volume, downstream engagement quality, and high-intent quote share.
          </p>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="muted text-[11px] uppercase tracking-[0.12em]">Stage 1: Quotes</p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {formatCompact(data.xQuotes.funnel.quotes)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="muted text-[11px] uppercase tracking-[0.12em]">
                Stage 2: Quote Engagements
              </p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {formatCompact(data.xQuotes.funnel.quoteEngagements)}
              </p>
              <p className="muted text-xs">
                {data.xQuotes.funnel.engagementPerQuote !== null
                  ? `${data.xQuotes.funnel.engagementPerQuote.toFixed(2)} per quote`
                  : "n/a"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <p className="muted text-[11px] uppercase tracking-[0.12em]">
                Stage 3: High-Intent Quotes
              </p>
              <p className="mt-1 text-lg font-semibold text-ink">
                {formatCompact(data.xQuotes.funnel.highIntentQuotes)}
              </p>
              <p className="muted text-xs">
                {data.xQuotes.funnel.highIntentRate !== null
                  ? `${formatPercent(data.xQuotes.funnel.highIntentRate)} of quotes (>=${formatNumber(
                      data.xQuotes.funnel.highIntentThreshold
                    )} engagements)`
                  : "n/a"}
              </p>
            </div>
          </div>
          {data.xQuotes.funnel.note && (
            <p className="muted mt-3 text-xs">{data.xQuotes.funnel.note}</p>
          )}
        </div>
        {data.xQuotes.topQuotedPosts.length === 0 ? (
          <p className="muted mt-6 text-sm">No quote-post rows in current API window.</p>
        ) : (
          <>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.12em] text-slate">
                  <tr>
                    <th className="pb-3 pr-4">Source Post</th>
                    <th className="pb-3 pr-4">Quotes</th>
                    <th className="pb-3 pr-4">Unique Authors</th>
                    <th className="pb-3 pr-4">Verified Authors</th>
                    <th className="pb-3 pr-4">Avg Quote Engagement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.xQuotes.topQuotedPosts.map((post) => (
                    <tr key={`quote-post-${post.sourceTweetId}`} className="text-slate">
                      <td className="py-4 pr-4">
                        <a
                          href={post.sourceLink}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-ink hover:underline"
                        >
                          {post.sourceText || "Untitled source post"}
                        </a>
                        <p className="muted mt-1 text-xs">
                          {post.sourceCreatedAt ? formatDateShort(post.sourceCreatedAt) : "n/a"}
                        </p>
                      </td>
                      <td className="py-4 pr-4">{formatNumber(post.quotes)}</td>
                      <td className="py-4 pr-4">{formatNumber(post.uniqueAuthors)}</td>
                      <td className="py-4 pr-4">{formatNumber(post.verifiedAuthors)}</td>
                      <td className="py-4 pr-4">{post.avgQuoteEngagement.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-sm font-semibold text-ink">Top Quote Authors</p>
                {data.xQuotes.topQuoteAuthors.length === 0 ? (
                  <p className="muted mt-3 text-xs">No quote authors in window.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {data.xQuotes.topQuoteAuthors.slice(0, 8).map((author) => (
                      <div
                        key={`quote-author-${author.userId}`}
                        className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-ink">{author.handle}</p>
                          <p className="muted text-xs">
                            {author.quotes} quotes · avg {author.avgEngagement.toFixed(1)} engagements
                          </p>
                        </div>
                        <span className="text-xs text-slate">
                          {author.verified ? "Verified" : "Unverified"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                <p className="text-sm font-semibold text-ink">Quote Quality Trend (Daily)</p>
                {data.xQuotes.daily.length === 0 ? (
                  <p className="muted mt-3 text-xs">No quote trend rows in window.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {data.xQuotes.daily.slice(-7).map((day) => (
                      <div
                        key={`quote-day-${day.date.toISOString()}`}
                        className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <p className="text-xs text-ink">{formatDateShort(day.date)}</p>
                        <p className="text-xs text-slate">
                          {day.quotes} quotes · avg {day.avgEngagement.toFixed(1)} engagements
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>
      )}

      {visiblePanels.has("x_half_life") && (
      <section className="mt-10 card p-6">
        <h2 className="section-title text-2xl">Post Half-Life (X API)</h2>
        <p className="muted mt-2 text-sm">
          Measures how quickly posts reach 50% of current total engagement, based on snapshot history.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          <MetricStatCard
            label="Posts Evaluated"
            value={formatCompact(data.xPostHalfLife.postsEvaluated)}
          />
          <MetricStatCard
            label="Median Half-Life"
            value={formatHours(data.xPostHalfLife.medianHalfLifeHours)}
          />
          <MetricStatCard
            label="P75 Half-Life"
            value={formatHours(data.xPostHalfLife.p75HalfLifeHours)}
          />
          <MetricStatCard
            label="Fastest Weekday"
            value={halfLifeBestDay ? halfLifeBestDay.day : "n/a"}
            hint={
              halfLifeBestDay?.medianHalfLifeHours !== null &&
              halfLifeBestDay?.medianHalfLifeHours !== undefined
                ? formatHours(halfLifeBestDay.medianHalfLifeHours)
                : "Need more snapshots"
            }
          />
        </div>
        {data.xPostHalfLife.note && (
          <p className="muted mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            {data.xPostHalfLife.note}
          </p>
        )}
        {data.xPostHalfLife.available && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-sm font-semibold text-ink">Median Half-Life by Weekday</p>
              <div className="mt-3 space-y-2">
                {data.xPostHalfLife.byWeekday.map((row) => {
                  const width =
                    row.medianHalfLifeHours !== null
                      ? Math.max(
                          2,
                          Math.round(
                            (row.medianHalfLifeHours /
                              Math.max(
                                ...data.xPostHalfLife.byWeekday.map(
                                  (item) => item.medianHalfLifeHours ?? 0
                                ),
                                1
                              )) *
                              100
                          )
                        )
                      : 0;
                  return (
                    <div key={`half-life-day-${row.day}`}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-ink">{row.day}</span>
                        <span className="text-slate">
                          {formatHours(row.medianHalfLifeHours)} · {formatNumber(row.posts)} posts
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100">
                        {row.medianHalfLifeHours !== null && (
                          <div
                            className="h-2 rounded-full bg-cyan-500"
                            style={{ width: `${width}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
              <p className="text-sm font-semibold text-ink">Sample Posts (Highest Engagement)</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[460px] text-left text-xs">
                  <thead className="uppercase tracking-[0.12em] text-slate">
                    <tr>
                      <th className="pb-2 pr-3">Post</th>
                      <th className="pb-2 pr-3">Half-Life</th>
                      <th className="pb-2 pr-3">Final Engagements</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.xPostHalfLife.samples.slice(0, 10).map((sample) => (
                      <tr key={`half-life-sample-${sample.tweetId}`} className="text-slate">
                        <td className="py-2 pr-3">
                          <a
                            href={sample.link}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-ink hover:underline"
                          >
                            {sample.tweetId.slice(0, 10)}...
                          </a>
                          <p className="muted mt-1 text-[11px]">
                            {formatDateShort(sample.createdAt)}
                          </p>
                        </td>
                        <td className="py-2 pr-3">{formatHours(sample.halfLifeHours)}</td>
                        <td className="py-2 pr-3">{formatNumber(sample.finalEngagements)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
      )}

      {visiblePanels.has("x_followers") && (
      <section className="mt-10 card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title text-2xl">Follower Snapshot (X API)</h2>
          <a
            href={followerSnapshotCsvHref}
            download="x_follower_snapshots.csv"
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Download Snapshot CSV
          </a>
        </div>
        <p className="muted mt-2 text-sm">
          Captures follower count on each successful API pull so growth can be tracked over refreshes.
        </p>
        <div className="mt-6 grid gap-6 lg:grid-cols-4">
          <MetricStatCard
            label="Current Followers"
            value={
              data.xFollowers.currentFollowers !== null
                ? formatCompact(data.xFollowers.currentFollowers)
                : "n/a"
            }
          />
          <MetricStatCard
            label="Change vs Previous Snapshot"
            value={
              data.xFollowers.changeSincePrevious !== null
                ? formatSignedNumber(data.xFollowers.changeSincePrevious)
                : "n/a"
            }
          />
          <MetricStatCard
            label="Snapshot Count"
            value={formatCompact(data.xFollowers.snapshots.length)}
          />
          <MetricStatCard
            label="Latest Snapshot"
            value={latestFollowerSnapshot ? formatDateShort(latestFollowerSnapshot.capturedAt) : "n/a"}
            hint={latestFollowerSnapshot ? formatDateTimeShort(latestFollowerSnapshot.capturedAt) : "No snapshot stored yet"}
          />
        </div>
      </section>
      )}

      {visiblePanels.has("x_brand") && (
      <section className="mt-10 card p-6">
        <h2 className="section-title text-2xl">Brand Listening (X API)</h2>
        <p className="muted mt-2 text-sm">
          Optional keyword/hashtag listening from recent search.
        </p>
        {!data.xBrandListening.enabled ? (
          <p className="muted mt-4 text-sm">
            Set <span className="font-semibold text-ink">X_BRAND_QUERY</span> in{" "}
            <span className="font-semibold text-ink">.env.local</span> to enable this panel.
          </p>
        ) : (
          <>
            <div className="mt-6 grid gap-6 lg:grid-cols-4">
              <MetricStatCard
                label="Brand Mentions"
                value={formatCompact(data.xBrandListening.totalBrandMentions)}
                hint={data.xBrandListening.query ?? ""}
              />
              <MetricStatCard
                label="Compare Mentions"
                value={formatCompact(data.xBrandListening.totalCompareMentions)}
                hint={data.xBrandListening.compareQuery ?? "No compare query"}
              />
              <MetricStatCard
                label="Avg Share of Voice"
                value={
                  data.xBrandListening.averageShareOfVoice !== null
                    ? formatPercent(data.xBrandListening.averageShareOfVoice)
                    : "n/a"
                }
              />
              <MetricStatCard
                label="Top Mention Authors"
                value={formatCompact(data.xBrandListening.topAuthors.length)}
              />
            </div>
            {data.xBrandListening.note && (
              <p className="muted mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                {data.xBrandListening.note}
              </p>
            )}
            {data.xBrandListening.topAuthors.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.12em] text-slate">
                    <tr>
                      <th className="pb-3 pr-4">Author</th>
                      <th className="pb-3 pr-4">Verified</th>
                      <th className="pb-3 pr-4">Mentions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.xBrandListening.topAuthors.map((author) => (
                      <tr key={`brand-author-${author.userId}`} className="text-slate">
                        <td className="py-4 pr-4">
                          {author.handle !== "@unknown" ? (
                            <a
                              href={`https://x.com/${author.handle.replace("@", "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-ink hover:underline"
                            >
                              {author.handle}
                            </a>
                          ) : (
                            <span className="font-semibold text-ink">{author.handle}</span>
                          )}
                          <p className="muted mt-1 text-xs">{author.name}</p>
                        </td>
                        <td className="py-4 pr-4">{author.verified ? "Yes" : "No"}</td>
                        <td className="py-4 pr-4">{formatNumber(author.mentions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.xBrandListening.daily.length > 0 && (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.12em] text-slate">
                    <tr>
                      <th className="pb-3 pr-4">Day</th>
                      <th className="pb-3 pr-4">Brand Mentions</th>
                      <th className="pb-3 pr-4">Compare Mentions</th>
                      <th className="pb-3 pr-4">Share of Voice</th>
                      <th className="pb-3 pr-4">Unique Authors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {data.xBrandListening.daily.slice(-14).map((day) => (
                      <tr key={`brand-day-${day.date.toISOString()}`} className="text-slate">
                        <td className="py-4 pr-4">{formatDateShort(day.date)}</td>
                        <td className="py-4 pr-4">{formatNumber(day.brandMentions)}</td>
                        <td className="py-4 pr-4">{formatNumber(day.compareMentions)}</td>
                        <td className="py-4 pr-4">
                          {day.shareOfVoice !== null ? formatPercent(day.shareOfVoice) : "n/a"}
                        </td>
                        <td className="py-4 pr-4">{formatNumber(day.uniqueAuthors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      )}

      <section className="mt-12 card p-6">
        <h3 className="section-title text-lg">API Safety & Billing Disclaimer</h3>
        <ul className="muted mt-3 list-disc pl-5 text-sm">
          <li>
            This software is provided as-is under open-source terms. You are responsible for
            your own API usage and account billing.
          </li>
          <li>
            Keep API keys and tokens in server-side env files only (for example: `.env.local`).
            Do not place secrets in `NEXT_PUBLIC_*` variables.
          </li>
          <li>
            Use CSV mode or manual refresh when you want tighter control over API costs.
          </li>
        </ul>
      </section>

      <footer className="mt-16 text-center text-sm text-slate">
        <span>Made by your favourite ❤️ goblin ❤️ (</span>
        <a
          href="https://x.com/crypto_goblinz"
          target="_blank"
          rel="noreferrer"
          className="rounded px-1 font-semibold text-ink transition hover:bg-gold/40 hover:underline"
        >
          @crypto_goblinz
        </a>
        <span>).</span>
      </footer>

      {/* Clear notes on what is missing today and what comes next. */}
      <section className="mt-12 card p-6">
        <h3 className="section-title text-lg">Notes & Next Steps</h3>
        <ul className="muted mt-3 list-disc pl-5 text-sm">
          <li>
            This is an open-source tool, so exports vary and a few edge cases may
            still be buggy. The CSV Validation panel is the fastest way to spot
            missing columns.
          </li>
          <li>
            Video watch time appears only when Data/raw/x_video_overview.csv is
            provided.
          </li>
          <li>
            Non-technical? Use the copy-paste prompt in PROMPT.md to ask an LLM
            to walk you through the setup.
          </li>
          <li>
            If this helps, share it with your friends or other marketers.
          </li>
          <li>
            Future: add verified-follower and repeat-supporter scoring once
            per-user engagement data is available.
          </li>
        </ul>
      </section>
    </main>
  );
}

function TimeMatrixCard({
  title,
  slots,
  showHourly,
  emptyState
}: {
  title: string;
  slots: {
    day: string;
    hour: number | null;
    posts: number;
    engagementRate: number | null;
  }[];
  showHourly: boolean;
  emptyState: string;
}) {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hasHourlySlots = showHourly && slots.some((slot) => slot.hour !== null);

  if (slots.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="muted mt-2 text-xs">{emptyState}</p>
      </div>
    );
  }

  const maxRate = Math.max(...slots.map((slot) => slot.engagementRate ?? 0), 0);
  const slotMap = new Map(
    slots.map((slot) => [`${slot.day}-${slot.hour ?? "day"}`, slot])
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hasHourlySlots ? (
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[840px] text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-slate">Day</th>
                {Array.from({ length: 24 }, (_, hour) => (
                  <th key={`${title}-h-${hour}`} className="px-1 py-1 text-slate">
                    {String(hour).padStart(2, "0")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dayNames.map((day) => (
                <tr key={`${title}-${day}`}>
                  <td className="px-2 py-1 font-semibold text-ink">{day}</td>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const slot = slotMap.get(`${day}-${hour}`);
                    const rate = slot?.engagementRate ?? null;
                    const intensity =
                      rate !== null && maxRate > 0
                        ? 0.12 + (rate / maxRate) * 0.68
                        : 0;
                    return (
                      <td key={`${title}-${day}-${hour}`} className="px-1 py-1">
                        <div
                          className="h-6 w-6 rounded border border-slate-200/70 text-center leading-6"
                          style={{
                            backgroundColor:
                              rate !== null
                                ? `rgba(var(--accent-rgb), ${intensity})`
                                : "rgba(148, 163, 184, 0.1)"
                          }}
                          title={
                            rate !== null
                              ? `${day} ${String(hour).padStart(2, "0")}:00 - ${formatPercent(
                                  rate
                                )} (${slot?.posts ?? 0} posts)`
                              : `${day} ${String(hour).padStart(2, "0")}:00 - no posts`
                          }
                        >
                          {slot ? "•" : ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-7 gap-2">
          {dayNames.map((day) => {
            const slot = slotMap.get(`${day}-day`) ?? slotMap.get(`${day}-null`);
            const rate = slot?.engagementRate ?? null;
            const intensity =
              rate !== null && maxRate > 0 ? 0.18 + (rate / maxRate) * 0.62 : 0.08;
            return (
              <div
                key={`${title}-${day}-day`}
                className="rounded-lg border border-slate-200 px-2 py-3 text-center"
                style={{
                  backgroundColor:
                    rate !== null
                      ? `rgba(var(--accent-rgb), ${intensity})`
                      : "rgba(148, 163, 184, 0.12)"
                }}
              >
                <p className="text-[11px] font-semibold text-ink">{day}</p>
                <p className="mt-1 text-[11px] text-slate">
                  {rate !== null ? formatPercent(rate) : "n/a"}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted mt-2 text-[11px]">
        Dot intensity = relative engagement rate for that platform.
      </p>
    </div>
  );
}

function EngagementCohortMatrix({
  rows,
  ageBuckets
}: {
  rows: {
    weekKey: string;
    label: string;
    totalPosts: number;
    cells: {
      ageBucket: string;
      posts: number;
      medianEngagementRate: number | null;
      averageEngagementRate: number | null;
    }[];
  }[];
  ageBuckets: string[];
}) {
  // We color by relative median engagement rate so stronger cohort-age cells pop immediately.
  const maxRate = Math.max(
    ...rows.flatMap((row) =>
      row.cells
        .map((cell) => cell.medianEngagementRate ?? 0)
        .filter((value) => value > 0)
    ),
    0
  );

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 p-4">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.12em] text-slate">
          <tr>
            <th className="pb-3 pr-4">Publish Week (UTC)</th>
            {ageBuckets.map((bucket) => (
              <th key={`cohort-bucket-${bucket}`} className="pb-3 pr-4">
                {bucket}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr key={`cohort-row-${row.weekKey}`}>
              <td className="py-4 pr-4 align-top">
                <p className="font-semibold text-ink">{row.label}</p>
                <p className="muted mt-1 text-xs">{formatNumber(row.totalPosts)} posts</p>
              </td>
              {row.cells.map((cell) => {
                const intensity =
                  cell.medianEngagementRate !== null && maxRate > 0
                    ? 0.12 + (cell.medianEngagementRate / maxRate) * 0.68
                    : 0.08;
                return (
                  <td key={`cohort-cell-${row.weekKey}-${cell.ageBucket}`} className="py-4 pr-4">
                    <div
                      className="rounded-lg border border-slate-200 px-3 py-2"
                      style={{
                        backgroundColor:
                          cell.posts > 0
                            ? `rgba(var(--accent-rgb), ${intensity})`
                            : "rgba(148, 163, 184, 0.08)"
                      }}
                    >
                      <p className="text-xs font-semibold text-ink">
                        {cell.medianEngagementRate !== null
                          ? formatPercent(cell.medianEngagementRate)
                          : "n/a"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate">
                        {formatNumber(cell.posts)} posts
                        {cell.averageEngagementRate !== null
                          ? ` · avg ${formatPercent(cell.averageEngagementRate)}`
                          : ""}
                      </p>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted mt-3 text-[11px]">
        Cell value = median engagement rate for posts in that publish-week cohort and age bucket.
      </p>
    </div>
  );
}

function getValidationStatus(item: {
  source: string;
  missingRequired: string[];
  missingOptional: string[];
}) {
  if (item.source === "missing") {
    return { label: "Missing file", tone: "bg-rose-50 text-rose-700" };
  }
  if (item.missingRequired.length > 0) {
    return { label: "Needs attention", tone: "bg-amber-50 text-amber-700" };
  }
  if (item.missingOptional.length > 0) {
    return { label: "Partial", tone: "bg-slate-100 text-slate-700" };
  }
  return { label: "OK", tone: "bg-emerald-50 text-emerald-700" };
}

function getSetupTone(status: "ok" | "warning" | "info") {
  if (status === "ok") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "warning") {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-slate-100 text-slate-700";
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            active ? "bg-emerald-500" : "bg-slate-300"
          }`}
        />
        {label}
      </p>
      <p className="muted mt-1 text-xs">{active ? "ON" : "OFF"}</p>
    </div>
  );
}

function MetricStatCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="metric-card rounded-2xl p-4">
      <p className="muted text-xs">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="muted mt-1 text-xs">{hint}</p>}
    </div>
  );
}

function parseVisiblePanels(raw: string | undefined): Set<MetricPanelKey> {
  const all = new Set(METRIC_PANELS.map((panel) => panel.key));
  if (!raw) return all;

  const parsed = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part): part is MetricPanelKey =>
      METRIC_PANELS.some((panel) => panel.key === part)
    );

  return parsed.length > 0 ? new Set(parsed) : all;
}

function buildBaseQuery(
  params: Record<string, string | string[] | undefined>
): URLSearchParams {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) return;
    if (key === "refresh") return;
    if (key === "refresh_override") return;
    const normalized = Array.isArray(value) ? value[0] : value;
    if (!normalized) return;
    query.set(key, normalized);
  });

  return query;
}

function buildPanelToggleHref(
  baseQuery: URLSearchParams,
  key: MetricPanelKey,
  visiblePanels: Set<MetricPanelKey>
): string {
  const nextVisible = new Set(visiblePanels);
  if (nextVisible.has(key)) {
    nextVisible.delete(key);
  } else {
    nextVisible.add(key);
  }

  if (nextVisible.size === 0) {
    nextVisible.add(key);
  }

  const nextQuery = new URLSearchParams(baseQuery.toString());
  const allVisible = nextVisible.size === METRIC_PANELS.length;
  if (allVisible) {
    nextQuery.delete("panels");
  } else {
    nextQuery.set("panels", Array.from(nextVisible).join(","));
  }

  return nextQuery.toString() ? `?${nextQuery.toString()}` : "/";
}

function buildSupporterFilterHref(
  baseQuery: URLSearchParams,
  filter: "all" | "verified"
): string {
  const nextQuery = new URLSearchParams(baseQuery.toString());
  if (filter === "all") {
    nextQuery.delete("supporters");
  } else {
    nextQuery.set("supporters", filter);
  }
  return nextQuery.toString() ? `?${nextQuery.toString()}` : "/";
}

function formatPerPost(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "n/a";
  if (Math.abs(value) >= 1000) return formatCompact(value);
  return value.toFixed(1);
}

function formatMissingList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

// Keeps date formatting consistent across coverage cards.
function formatDateRange(start: Date | null, end: Date | null): string {
  if (!start || !end) return "No data";
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric"
  };
  const formatter = new Intl.DateTimeFormat("en-US", options);
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

// Short date formatting for table rows (ex: Jan 26, 2026).
function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatDateTimeShort(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatApiFreshness(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(parsed);
}

function shouldForceRefresh(token: string | undefined): boolean {
  if (!token) return false;
  const numeric = Number(token);
  if (!Number.isFinite(numeric)) return false;
  return Date.now() - numeric <= 30_000;
}

function isRefreshOverride(token: string | undefined): boolean {
  if (!token) return false;
  const normalized = token.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function formatDurationShort(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  if (seconds >= 60) return `${Math.ceil(seconds / 60)}m`;
  return `${seconds}s`;
}

// Count how many daily rows fall into the target month (YYYY-MM).
function countDaysForMonth(daily: { date: Date }[], monthKey: string): number {
  return daily.filter((entry) => getMonthKey(entry.date) === monthKey).length;
}

function getMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function renderDayOfWeekHeatmap(
  dayOfWeek: { day: string; averageViews: number; totalViews: number; days: number }[]
) {
  const maxAverage = Math.max(...dayOfWeek.map((day) => day.averageViews), 1);

  return dayOfWeek.map((day) => {
    const intensity = day.averageViews / maxAverage;
    const background = `rgba(var(--accent-rgb), ${0.15 + intensity * 0.65})`;
    return (
      <div
        key={day.day}
        className="rounded-xl border border-white/60 px-3 py-4 text-center"
        style={{ backgroundColor: background }}
      >
        <p className="text-xs uppercase tracking-[0.2em] text-white">{day.day}</p>
        <p className="mt-2 text-lg font-semibold text-white">
          {formatCompact(day.averageViews)}
        </p>
        <p className="mt-1 text-[11px] text-white/80">
          avg per day
        </p>
      </div>
    );
  });
}

function calculateEngagementRate(
  month: { views: number; likes: number; comments: number; reposts: number } | null
): number | null {
  if (!month || !month.views) return null;
  return (month.likes + month.comments + month.reposts) / month.views;
}

function calculateCtr(month: { views: number; clicks: number } | null): number | null {
  if (!month || !month.views) return null;
  if (!month.clicks) return null;
  return month.clicks / month.views;
}

function calculateRateMom(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }
  return (current - previous) / previous;
}

function perThousand(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return (numerator / denominator) * 1000;
}

function formatSignedNumber(value: number): string {
  if (value > 0) return `+${formatNumber(value)}`;
  if (value < 0) return `-${formatNumber(Math.abs(value))}`;
  return "0";
}

function medianNumber(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function formatRiskLabel(
  risk: "low" | "moderate" | "high" | "extreme" | "n/a"
): string {
  if (risk === "n/a") return "n/a";
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

function formatHours(hours: number | null): string {
  if (hours === null || Number.isNaN(hours)) return "n/a";
  if (hours >= 48) return `${(hours / 24).toFixed(1)}d`;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours * 60)}m`;
}

function buildCsvDownloadHref(rows: string[][]): string {
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

function escapeCsvCell(value: string): string {
  const normalized = (value ?? "").replace(/\r?\n/g, " ");
  if (/[",]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function formatDurationMs(ms: number): string {
  if (!ms) return "n/a";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds >= 3600) {
    return `${(totalSeconds / 3600).toFixed(1)} hrs`;
  }
  if (totalSeconds >= 60) {
    return `${Math.round(totalSeconds / 60)} min`;
  }
  return `${totalSeconds}s`;
}

function formatSecondsAsClock(seconds: number): string {
  if (!seconds || Number.isNaN(seconds)) return "n/a";
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}
