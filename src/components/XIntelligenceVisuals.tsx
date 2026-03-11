"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCompact, formatPercent } from "@/lib/format";
import type {
  XAmplifiersInsight,
  XMentionsInsight,
  XPostHalfLifeInsight,
  XQuotesInsight
} from "@/lib/metrics";

type Props = {
  mentions: XMentionsInsight;
  amplifiers: XAmplifiersInsight;
  quotes: XQuotesInsight;
  postHalfLife: XPostHalfLifeInsight;
};

type TooltipEntry = {
  name?: string;
  value?: number | string;
  color?: string;
};

const GRID_COLOR = "var(--chart-grid)";

export function XIntelligenceVisuals({
  mentions,
  amplifiers,
  quotes,
  postHalfLife
}: Props) {
  const mentionSeries = buildMentionSeries(mentions);
  const retentionSeries = amplifiers.retention.map((point) => ({
    label: point.label,
    supporters: point.supporters,
    retentionPct: point.retentionRate !== null ? point.retentionRate * 100 : null
  }));
  const concentrationSeries = buildConcentrationSeries(amplifiers);
  const quoteFunnelSeries = buildQuoteFunnelSeries(quotes);
  const halfLifeSeries = buildHalfLifeHistogram(postHalfLife);
  const cohortRows = amplifiers.cohortRetention.rows.slice(-8);
  const cohortMaxOffset = amplifiers.cohortRetention.maxWeekOffset;

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <h3 className="section-title text-lg">Mentions Velocity + Spikes</h3>
          <p className="muted text-sm">
            Mentions vs 7-day baseline with automatic spike markers.
          </p>
          {mentionSeries.length === 0 ? (
            <p className="muted mt-6 text-sm">No mention velocity data in current window.</p>
          ) : (
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mentionSeries} margin={{ left: 6, right: 6 }}>
                  <defs>
                    <linearGradient id="mentionsAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.36} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={14} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="mentions"
                    fill="url(#mentionsAreaFill)"
                    stroke="var(--chart-1)"
                    strokeWidth={2.4}
                    name="Mentions"
                  />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    name="7d Baseline"
                    connectNulls
                  />
                  <Line
                    type="linear"
                    dataKey="spikeMentions"
                    stroke="transparent"
                    dot={{ r: 4.5, fill: "var(--chart-3)", stroke: "white", strokeWidth: 1 }}
                    activeDot={false}
                    name="Spike"
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="section-title text-lg">Quote Impact Funnel</h3>
          <p className="muted text-sm">
            From raw quotes to quality quote engagement.
          </p>
          {quoteFunnelSeries.length === 0 ? (
            <p className="muted mt-6 text-sm">No quote funnel data in current window.</p>
          ) : (
            <>
              <div className="mt-5 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quoteFunnelSeries} layout="vertical">
                    <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
                    <YAxis dataKey="stage" type="category" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" radius={[10, 10, 10, 10]}>
                      {quoteFunnelSeries.map((entry) => (
                        <Cell key={`funnel-${entry.stage}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {quoteFunnelSeries.map((stage) => (
                  <div key={`quote-stage-${stage.stage}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs font-semibold text-ink">{stage.stage}</p>
                    <p className="mt-1 text-sm text-slate">{formatCompact(stage.value)}</p>
                    <p className="muted mt-1 text-[11px]">{stage.conversionLabel}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <h3 className="section-title text-lg">Supporter Retention Trend</h3>
          <p className="muted text-sm">
            Week-over-week supporter volume with retention rate overlay.
          </p>
          {retentionSeries.length < 2 ? (
            <p className="muted mt-6 text-sm">Need at least two weeks to render retention trend.</p>
          ) : (
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={retentionSeries} margin={{ left: 6, right: 6 }}>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value) => `${value}%`}
                    domain={[0, 100]}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    yAxisId="left"
                    dataKey="supporters"
                    name="Supporters"
                    fill="var(--chart-2)"
                    radius={[7, 7, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="retentionPct"
                    name="Retention %"
                    stroke="var(--chart-4)"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="section-title text-lg">Engagement Concentration Curve</h3>
          <p className="muted text-sm">
            Cumulative share captured by top supporters vs equal-share baseline.
          </p>
          {concentrationSeries.length === 0 ? (
            <p className="muted mt-6 text-sm">No concentration curve data in current window.</p>
          ) : (
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={concentrationSeries} margin={{ left: 6, right: 6 }}>
                  <defs>
                    <linearGradient id="concentrationFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                  <XAxis dataKey="rank" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(value) => `${value}%`} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="sharePct"
                    name="Cumulative Share"
                    stroke="var(--chart-3)"
                    fill="url(#concentrationFill)"
                    strokeWidth={2.4}
                  />
                  <Line
                    type="monotone"
                    dataKey="equalSharePct"
                    name="Equal Share"
                    stroke="var(--chart-2)"
                    strokeDasharray="4 4"
                    strokeWidth={1.8}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card p-5">
          <h3 className="section-title text-lg">Supporter Cohort Heatmap</h3>
          <p className="muted text-sm">
            Cohorts by first-seen week with week-by-week return rate.
          </p>
          {!amplifiers.cohortRetention.available || cohortRows.length === 0 ? (
            <p className="muted mt-6 text-sm">
              {amplifiers.cohortRetention.note ?? "Need more weekly history for cohort heatmap."}
            </p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="uppercase tracking-[0.12em] text-slate">
                  <tr>
                    <th className="pb-2 pr-3">Cohort</th>
                    <th className="pb-2 pr-3">Size</th>
                    {Array.from({ length: cohortMaxOffset + 1 }, (_, offset) => (
                      <th key={`cohort-head-${offset}`} className="pb-2 pr-3">
                        W+{offset}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {cohortRows.map((row) => (
                    <tr key={`cohort-row-${row.cohortWeekKey}`} className="text-slate">
                      <td className="py-2 pr-3 font-semibold text-ink">{row.cohortLabel}</td>
                      <td className="py-2 pr-3">{formatCompact(row.cohortSize)}</td>
                      {Array.from({ length: cohortMaxOffset + 1 }, (_, offset) => {
                        const cell = row.cells.find((item) => item.weekOffset === offset);
                        if (!cell) {
                          return (
                            <td key={`cohort-empty-${row.cohortWeekKey}-${offset}`} className="py-2 pr-3">
                              —
                            </td>
                          );
                        }
                        const intensity = 0.14 + cell.retentionRate * 0.72;
                        return (
                          <td key={`cohort-cell-${row.cohortWeekKey}-${offset}`} className="py-2 pr-3">
                            <span
                              className="rounded-md px-2 py-1 font-semibold"
                              style={{
                                backgroundColor: `rgba(var(--accent-rgb), ${intensity})`,
                                color: cell.retentionRate > 0.42 ? "#081226" : "#1f2937"
                              }}
                            >
                              {formatPercent(cell.retentionRate)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="section-title text-lg">Post Half-Life Distribution</h3>
          <p className="muted text-sm">
            Histogram of hours to hit 50% engagement by post.
          </p>
          {halfLifeSeries.length === 0 ? (
            <p className="muted mt-6 text-sm">Need more snapshot history to plot half-life bins.</p>
          ) : (
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={halfLifeSeries}>
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                  <XAxis dataKey="binLabel" tick={{ fontSize: 11 }} interval={0} angle={-28} height={56} />
                  <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="posts" name="Posts" radius={[8, 8, 0, 0]} fill="var(--chart-4)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      {label ? <p className="mb-1 font-semibold text-ink">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <p key={`tooltip-row-${index}`} className="text-slate">
            <span className="font-semibold text-ink">
              {entry.name ?? `Series ${index + 1}`}:
            </span>{" "}
            {formatTooltipValue(entry.value)}
          </p>
        ))}
      </div>
    </div>
  );
}

function formatTooltipValue(value: number | string | undefined): string {
  if (typeof value === "number") {
    if (value >= 0 && value <= 1) {
      return formatPercent(value);
    }
    return formatCompact(value);
  }
  if (typeof value === "string") return value;
  return "n/a";
}

function buildMentionSeries(mentions: XMentionsInsight) {
  const spikeSet = new Set(
    mentions.spikes.map((item) => item.date.toISOString().slice(0, 10))
  );
  return mentions.velocity.map((point) => {
    const dayKey = point.date.toISOString().slice(0, 10);
    return {
      label: shortDate(point.date),
      mentions: point.mentions,
      baseline: point.rolling7d,
      spikeMentions: spikeSet.has(dayKey) ? point.mentions : null
    };
  });
}

function buildConcentrationSeries(amplifiers: XAmplifiersInsight) {
  const maxRank = amplifiers.concentrationCurve.length;
  if (maxRank === 0) return [];
  return amplifiers.concentrationCurve.map((point) => ({
    rank: point.rank,
    sharePct: Number((point.cumulativeShare * 100).toFixed(2)),
    equalSharePct: Number(((point.rank / maxRank) * 100).toFixed(2))
  }));
}

function buildQuoteFunnelSeries(quotes: XQuotesInsight) {
  const funnel = quotes.funnel;
  if (funnel.quotes <= 0) return [];
  const stage1 = funnel.quotes;
  const stage2 = funnel.quoteEngagements;
  const stage3 = funnel.highIntentQuotes;
  const stage2Rate = stage1 > 0 ? stage2 / stage1 : null;
  const stage3Rate = stage2 > 0 ? stage3 / stage2 : null;
  return [
    {
      stage: "Quotes",
      value: stage1,
      color: "var(--chart-1)",
      conversionLabel: "Entry stage"
    },
    {
      stage: "Engagements",
      value: stage2,
      color: "var(--chart-2)",
      conversionLabel: stage2Rate !== null ? `${formatPercent(stage2Rate)} vs quotes` : "n/a"
    },
    {
      stage: "High Intent",
      value: stage3,
      color: "var(--chart-3)",
      conversionLabel: stage3Rate !== null ? `${formatPercent(stage3Rate)} vs engagements` : "n/a"
    }
  ];
}

function buildHalfLifeHistogram(postHalfLife: XPostHalfLifeInsight) {
  const values = postHalfLife.samples
    .map((sample) => sample.halfLifeHours)
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (values.length === 0) return [];

  const maxValue = Math.max(...values);
  const binSize = maxValue <= 24 ? 3 : maxValue <= 72 ? 6 : 12;
  const binCount = Math.min(12, Math.max(3, Math.ceil(maxValue / binSize)));

  const bins = Array.from({ length: binCount }, (_, index) => {
    const start = index * binSize;
    const end = start + binSize;
    return {
      start,
      end,
      posts: 0
    };
  });

  values.forEach((value) => {
    const rawIndex = Math.floor(value / binSize);
    const clampedIndex = Math.min(bins.length - 1, Math.max(0, rawIndex));
    bins[clampedIndex].posts += 1;
  });

  return bins.map((bin) => ({
    binLabel: `${bin.start}-${bin.end}h`,
    posts: bin.posts
  }));
}

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric"
  }).format(date);
}
