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
  { key: "time_matrix", label: "Day/Hour Matrix" }
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
  const forceRefresh = shouldForceRefresh(refreshToken);
  const data = await getDashboardData({ forceRefresh });
  const xSource = data.sourceStates.find((state) => state.platform === "x");
  const linkedInSource = data.sourceStates.find(
    (state) => state.platform === "linkedin"
  );
  const xApiEnabled = xSource?.mode === "api" || xSource?.mode === "hybrid";
  const linkedInApiEnabled =
    linkedInSource?.mode === "api" || linkedInSource?.mode === "hybrid";

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

  return (
    <main className="px-6 pb-20 pt-10 lg:px-14">
      {/* Hero section explains what the dashboard covers and the current time window. */}
      <section className="relative overflow-hidden rounded-[28px] border border-white/60 bg-white/70 p-10 shadow-glow">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-sea/20 blur-3xl" />
        <div className="absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-moss/25 blur-3xl" />
        <div className="relative z-20 mb-4 flex flex-col items-end gap-3 md:absolute md:mb-0 md:right-6 md:top-6">
          <ThemeToggle />
          <ManualRefreshButton />
        </div>
        <div className="relative z-10 pr-0 md:pr-56">
          <div>
            <p className="muted text-sm uppercase tracking-[0.3em]">
              Open social analytics
            </p>
            <h1 className="section-title mt-4 text-3xl font-semibold text-ink md:text-5xl">
              Social Metric Dashboard (API + CSV)
            </h1>
            <p className="mt-4 max-w-2xl text-base text-slate">
              Hybrid ingestion from X API and CSV files. Each platform can run
              independently in API or CSV mode, so partial setups still work.
            </p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate">
              <div className="glass rounded-full px-4 py-2">
                Latest MoM: {data.lastMonthLabel} vs {data.previousMonthLabel}
              </div>
              <div className="glass rounded-full px-4 py-2">
                Data freshness: {dataFreshness}
              </div>
              <div className="glass rounded-full px-4 py-2">
                Data pipeline: CSV-first with optional API enrichment
              </div>
              <div className="glass rounded-full px-4 py-2">
                API freshness: X {xApiFreshness}, LinkedIn {linkedInApiFreshness}
              </div>
              {data.sourceStates.map((state) => (
                <div
                  key={`${state.platform}-${state.mode}`}
                  className="glass rounded-full px-4 py-2"
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

      {data.usingSampleData && (
        <section className="mt-6">
          <div className="card border border-amber-200/80 bg-amber-50/70 p-4">
            <p className="text-sm font-semibold text-amber-900">
              You&apos;re viewing sample data.
            </p>
            <p className="mt-1 text-xs text-amber-800">
              Replace the sample files by dropping your CSV exports into
              <span className="font-semibold text-amber-900"> Data/raw</span>. The
              dashboard auto-falls back to available API/CSV sources if one is missing.
            </p>
          </div>
        </section>
      )}

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
