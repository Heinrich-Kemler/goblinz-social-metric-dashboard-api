"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { MonthSummary } from "@/lib/metrics";
import { formatCompact, formatPercent } from "@/lib/format";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)"
];
const GRID_COLOR = "var(--chart-grid)";

type Props = {
  combinedMonthly: MonthSummary[];
  xMonthly: MonthSummary[];
  linkedinMonthly: MonthSummary[];
  engagementMix: { label: string; value: number }[];
  linkedinContentTypes: {
    type: string;
    posts: number;
    impressions: number;
    views: number;
    engagements: number;
  }[];
};

type TooltipEntry = {
  name?: string;
  value?: number | string;
};

type InsightSignal = {
  label: string;
  value: string;
  hint: string;
  sparkline: number[];
};

// Charts are separated into a client component because Recharts needs the DOM.
export function DashboardCharts({
  combinedMonthly,
  xMonthly,
  linkedinMonthly,
  engagementMix,
  linkedinContentTypes
}: Props) {
  const engagementRateData = buildEngagementRateData(xMonthly, linkedinMonthly);
  const xNetFollows = xMonthly.map((month) => ({
    ...month,
    netFollows: month.newFollows - month.unfollows
  }));
  const contentTypeEfficiency = linkedinContentTypes.map((item) => ({
    ...item,
    efficiency: item.impressions ? (item.engagements / item.impressions) * 1000 : 0
  }));
  const peakCombinedMonth =
    combinedMonthly.length > 0
      ? combinedMonthly.reduce((best, month) =>
          month.views > best.views ? month : best
        )
      : null;
  const insightSignals = buildInsightSignals(combinedMonthly, xMonthly, linkedinMonthly);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        {insightSignals.map((signal) => (
          <div key={signal.label} className="card p-4">
            <p className="muted text-[11px] uppercase tracking-[0.18em]">{signal.label}</p>
            <p className="section-title mt-2 text-2xl text-ink">{signal.value}</p>
            <p className="muted mt-1 text-xs">{signal.hint}</p>
            <div className="mt-3 flex items-end gap-1">
              {signal.sparkline.map((point, index) => {
                const maxPoint = Math.max(...signal.sparkline, 1);
                const height = Math.max(4, Math.round((point / maxPoint) * 26));
                return (
                  <span
                    key={`${signal.label}-spark-${index}`}
                    className="w-2 rounded-full bg-[linear-gradient(180deg,var(--accent),var(--accent-2))]"
                    style={{ height }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6">
          <h3 className="section-title text-lg">Engagement Mix</h3>
          <p className="muted text-sm">
            Split of likes, comments, and reposts across the full range.
          </p>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={engagementMix}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={5}
                >
                  {engagementMix.map((entry, index) => (
                    <Cell
                      key={entry.label}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend verticalAlign="bottom" height={24} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6 lg:col-span-2">
          <h3 className="section-title text-lg">Monthly Views (All Platforms)</h3>
          <p className="muted text-sm">
            Combined impressions/views from X and LinkedIn.
          </p>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={combinedMonthly} margin={{ left: 8, right: 8 }}>
                <defs>
                  <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="views"
                  name="Views"
                  stroke="var(--chart-1)"
                  fill="url(#viewsFill)"
                  strokeWidth={2.4}
                />
                {peakCombinedMonth && (
                  <ReferenceDot
                    x={peakCombinedMonth.label}
                    y={peakCombinedMonth.views}
                    r={4}
                    fill="var(--chart-3)"
                    stroke="white"
                    strokeWidth={1}
                    ifOverflow="visible"
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-6">
          <h3 className="section-title text-lg">Monthly Posts (X)</h3>
          <p className="muted text-sm">
            Uses the "Create Post" field from the X analytics export.
          </p>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={xMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="posts" name="Posts" fill="var(--chart-2)" radius={[7, 7, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="section-title text-lg">Monthly Posts (LinkedIn)</h3>
          <p className="muted text-sm">
            Counted from the LinkedIn "All posts" export.
          </p>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={linkedinMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="posts" name="Posts" fill="var(--chart-1)" radius={[7, 7, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="section-title text-lg">Monthly Reposts + Shares</h3>
          <p className="muted text-sm">
            Combines reposts and quote-style shares (where available).
          </p>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={combinedMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="reposts" name="Reposts" fill="var(--chart-3)" radius={[7, 7, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="section-title text-lg">Engagement Rate Trend</h3>
          <p className="muted text-sm">
            Likes, comments, and reposts divided by views per month.
          </p>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={engagementRateData}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(value: number) => formatPercent(value)} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="xRate"
                  name="X"
                  stroke="var(--chart-1)"
                  strokeWidth={2.4}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="linkedinRate"
                  name="LinkedIn"
                  stroke="var(--chart-3)"
                  strokeWidth={2.4}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="section-title text-lg">Net Follows (X)</h3>
          <p className="muted text-sm">
            New follows minus unfollows by month.
          </p>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={xNetFollows}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="netFollows" name="Net Follows" fill="var(--chart-2)" radius={[7, 7, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="section-title text-lg">LinkedIn Content Types (Lollipop Ranking)</h3>
          <p className="muted text-sm">
            Impression ranking with clearer visual gap between formats.
          </p>
          {linkedinContentTypes.length === 0 ? (
            <p className="muted mt-6 text-sm">
              No post-level CSV detected yet. Add the LinkedIn "All posts" file
              to see this breakdown.
            </p>
          ) : (
            <LollipopRanking
              rows={linkedinContentTypes.map((item) => ({
                label: item.type,
                value: item.impressions,
                meta: `${formatCompact(item.posts)} posts`
              }))}
              valueLabel="impressions"
            />
          )}
        </div>

        <div className="card p-6">
          <h3 className="section-title text-lg">Content Type Efficiency</h3>
          <p className="muted text-sm">
            Engagements per 1,000 impressions by content type.
          </p>
          {contentTypeEfficiency.length === 0 ? (
            <p className="muted mt-6 text-sm">
              No post-level CSV detected yet. Add the LinkedIn "All posts" file
              to see this breakdown.
            </p>
          ) : (
            <LollipopRanking
              rows={contentTypeEfficiency.map((item) => ({
                label: item.type,
                value: item.efficiency,
                meta: `${formatCompact(item.engagements)} engagements`
              }))}
              valueLabel="per 1k"
              formatter={(value) => value.toFixed(1)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function LollipopRanking({
  rows,
  valueLabel,
  formatter
}: {
  rows: { label: string; value: number; meta: string }[];
  valueLabel: string;
  formatter?: (value: number) => string;
}) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const maxValue = Math.max(...sorted.map((row) => row.value), 1);

  return (
    <div className="mt-5 space-y-3">
      {sorted.map((row, index) => {
        const width = Math.max(8, Math.round((row.value / maxValue) * 100));
        return (
          <div key={`lollipop-${row.label}-${index}`}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-ink">{row.label}</span>
              <span className="text-slate">
                {(formatter ? formatter(row.value) : formatCompact(row.value))} {valueLabel}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-100">
              <div
                className="relative h-2 rounded-full bg-[linear-gradient(90deg,var(--chart-1),var(--chart-2))]"
                style={{ width: `${width}%` }}
              >
                <span className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white bg-[var(--chart-3)] shadow" />
              </div>
            </div>
            <p className="muted mt-1 text-[11px]">{row.meta}</p>
          </div>
        );
      })}
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
          <p key={`tooltip-entry-${index}`} className="text-slate">
            <span className="font-semibold text-ink">{entry.name ?? `Series ${index + 1}`}:</span>{" "}
            {formatTooltipValue(entry.value)}
          </p>
        ))}
      </div>
    </div>
  );
}

function formatTooltipValue(value: number | string | undefined): string {
  if (typeof value === "number") {
    if (value >= 0 && value <= 1) return formatPercent(value);
    return formatCompact(value);
  }
  if (typeof value === "string") return value;
  return "n/a";
}

function buildInsightSignals(
  combinedMonthly: MonthSummary[],
  xMonthly: MonthSummary[],
  linkedinMonthly: MonthSummary[]
): InsightSignal[] {
  const monthlySorted = [...combinedMonthly].sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );
  const last = monthlySorted[monthlySorted.length - 1] ?? null;
  const prev = monthlySorted[monthlySorted.length - 2] ?? null;
  const bestViewsMonth =
    monthlySorted.length > 0
      ? monthlySorted.reduce((best, month) => (month.views > best.views ? month : best))
      : null;

  const xBestRate = pickBestRateMonth(xMonthly, "X");
  const liBestRate = pickBestRateMonth(linkedinMonthly, "LinkedIn");
  const overallBestRate = [xBestRate, liBestRate]
    .filter((item): item is { label: string; rate: number; platform: "X" | "LinkedIn" } => item !== null)
    .sort((a, b) => b.rate - a.rate)[0] ?? null;
  const momViews =
    last && prev && prev.views > 0 ? (last.views - prev.views) / prev.views : null;

  return [
    {
      label: "Largest Reach Month",
      value: bestViewsMonth ? `${formatCompact(bestViewsMonth.views)}` : "n/a",
      hint: bestViewsMonth ? bestViewsMonth.label : "Need monthly history",
      sparkline: monthlySorted.slice(-8).map((month) => month.views)
    },
    {
      label: "Latest MoM Views",
      value: momViews !== null ? formatPercent(momViews) : "n/a",
      hint: last && prev ? `${prev.label} -> ${last.label}` : "Need 2 months",
      sparkline: monthlySorted.slice(-8).map((month) => month.engagements)
    },
    {
      label: "Best Engagement Rate",
      value: overallBestRate ? `${overallBestRate.platform} · ${formatPercent(overallBestRate.rate)}` : "n/a",
      hint: overallBestRate ? overallBestRate.label : "Need engagement + view data",
      sparkline: monthlySorted.slice(-8).map((month) => month.posts)
    }
  ];
}

function pickBestRateMonth(months: MonthSummary[], platform: "X" | "LinkedIn") {
  const withRate = months
    .map((month) => ({
      label: month.label,
      platform,
      rate: calculateRate(month)
    }))
    .filter(
      (month): month is { label: string; platform: "X" | "LinkedIn"; rate: number } =>
        month.rate !== null
    );
  return withRate.length > 0 ? withRate.sort((a, b) => b.rate - a.rate)[0] : null;
}

function buildEngagementRateData(
  xMonthly: MonthSummary[],
  linkedinMonthly: MonthSummary[]
) {
  const map = new Map<
    string,
    { monthKey: string; label: string; xRate: number | null; linkedinRate: number | null }
  >();

  xMonthly.forEach((month) => {
    map.set(month.monthKey, {
      monthKey: month.monthKey,
      label: month.label,
      xRate: calculateRate(month),
      linkedinRate: null
    });
  });

  linkedinMonthly.forEach((month) => {
    const existing = map.get(month.monthKey);
    if (existing) {
      existing.linkedinRate = calculateRate(month);
    } else {
      map.set(month.monthKey, {
        monthKey: month.monthKey,
        label: month.label,
        xRate: null,
        linkedinRate: calculateRate(month)
      });
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );
}

function calculateRate(month: MonthSummary): number | null {
  if (!month.views) return null;
  const engagements = month.likes + month.comments + month.reposts;
  return engagements / month.views;
}
