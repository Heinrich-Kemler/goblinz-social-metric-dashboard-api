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
  "var(--chart-4)"
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

// Charts are separated into a client component because Recharts needs the DOM.
export function DashboardCharts({
  combinedMonthly,
  xMonthly,
  linkedinMonthly,
  engagementMix,
  linkedinContentTypes
}: Props) {
  // Engagement rate line data pairs X + LinkedIn on the same months.
  const engagementRateData = buildEngagementRateData(xMonthly, linkedinMonthly);
  const xNetFollows = xMonthly.map((month) => ({
    ...month,
    netFollows: month.newFollows - month.unfollows
  }));
  const contentTypeEfficiency = linkedinContentTypes.map((item) => ({
    ...item,
    efficiency: item.impressions ? (item.engagements / item.impressions) * 1000 : 0
  }));

  return (
    <div className="grid gap-6">
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
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={6}
                >
                  {engagementMix.map((entry, index) => (
                    <Cell
                      key={entry.label}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCompact(value)}
                />
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
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatCompact} />
                <Tooltip formatter={(value: number) => formatCompact(value)} />
                <Area
                  type="monotone"
                  dataKey="views"
                  stroke="var(--chart-1)"
                  fill="url(#viewsFill)"
                  strokeWidth={2}
                />
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
                <YAxis tickFormatter={formatCompact} />
                <Tooltip formatter={(value: number) => formatCompact(value)} />
                <Bar dataKey="posts" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
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
                <YAxis tickFormatter={formatCompact} />
                <Tooltip formatter={(value: number) => formatCompact(value)} />
                <Bar dataKey="posts" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
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
                <YAxis tickFormatter={formatCompact} />
                <Tooltip formatter={(value: number) => formatCompact(value)} />
                <Bar dataKey="reposts" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="section-title text-lg">X Engagements</h3>
          <p className="muted text-sm">Likes, comments, and reposts by month.</p>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={xMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatCompact} />
                <Tooltip formatter={(value: number) => formatCompact(value)} />
                <Legend />
                <Bar dataKey="likes" stackId="a" fill="var(--chart-1)" />
                <Bar dataKey="comments" stackId="a" fill="var(--chart-4)" />
                <Bar dataKey="reposts" stackId="a" fill="var(--chart-3)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-6">
          <h3 className="section-title text-lg">LinkedIn Engagements</h3>
          <p className="muted text-sm">
            Reactions, comments, and reposts by month.
          </p>
          <div className="mt-6 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={linkedinMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatCompact} />
                <Tooltip formatter={(value: number) => formatCompact(value)} />
                <Legend />
                <Bar dataKey="likes" stackId="a" fill="var(--chart-2)" />
                <Bar dataKey="comments" stackId="a" fill="var(--chart-4)" />
                <Bar dataKey="reposts" stackId="a" fill="var(--chart-3)" />
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
                <YAxis tickFormatter={(value: number) => formatPercent(value)} />
                <Tooltip formatter={(value: number) => formatPercent(value)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="xRate"
                  name="X"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="linkedinRate"
                  name="LinkedIn"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
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
                <YAxis tickFormatter={formatCompact} />
                <Tooltip formatter={(value: number) => formatCompact(value)} />
                <Bar dataKey="netFollows" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="section-title text-lg">LinkedIn Content Types</h3>
          <p className="muted text-sm">
            Impressions by content type from the "All posts" export.
          </p>
          {linkedinContentTypes.length === 0 ? (
            <p className="muted mt-6 text-sm">
              No post-level CSV detected yet. Add the LinkedIn "All posts" file
              to see this breakdown.
            </p>
          ) : (
            <div className="mt-6 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={linkedinContentTypes} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis type="number" tickFormatter={formatCompact} />
                  <YAxis
                    type="category"
                    dataKey="type"
                    width={110}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip formatter={(value: number) => formatCompact(value)} />
                  <Bar
                    dataKey="impressions"
                    fill="var(--chart-1)"
                    radius={[6, 6, 6, 6]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
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
            <div className="mt-6 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={contentTypeEfficiency} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                  <XAxis type="number" tickFormatter={formatCompact} />
                  <YAxis
                    type="category"
                    dataKey="type"
                    width={110}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value: number) => `${formatCompact(value)} per 1k`}
                  />
                  <Bar dataKey="efficiency" fill="var(--chart-3)" radius={[6, 6, 6, 6]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
