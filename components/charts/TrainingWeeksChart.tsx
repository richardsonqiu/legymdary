"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, ChartFrame, Segmented, tooltipLabelStyle, tooltipStyle } from "@/components/charts/common";
import type { ActivityTypeSummary, TrainingWeek } from "@/lib/queries";
import { formatShort } from "@legymdary/shared";

const GYM = "#34d399"; // emerald-400
const GARMIN = "#a78bfa"; // violet-400

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Weekly training from both sources: gym sessions logged here + Garmin activities. */
export function TrainingWeeksChart({ weeks, types }: { weeks: TrainingWeek[]; types: ActivityTypeSummary[] }) {
  const [metric, setMetric] = useState<"minutes" | "sessions">("minutes");
  const totalSessions = weeks.reduce((a, w) => a + w.gymSessions + w.garminSessions, 0);
  if (totalSessions === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
        Log a workout or connect Garmin to see your weekly training.
      </p>
    );
  }
  const data = weeks.map((w) => ({
    week: w.week,
    Gym: metric === "minutes" ? w.gymMin : w.gymSessions,
    Garmin: metric === "minutes" ? w.garminMin : w.garminSessions,
  }));
  const last4 = weeks.slice(-4);
  const avgMin = Math.round(last4.reduce((a, w) => a + w.gymMin + w.garminMin, 0) / last4.length);
  const avgSessions = Math.round((last4.reduce((a, w) => a + w.gymSessions + w.garminSessions, 0) / last4.length) * 10) / 10;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-zinc-400">
          Last 4 weeks: <b className="text-zinc-100">{avgSessions}</b> sessions ·{" "}
          <b className="text-zinc-100">{Math.floor(avgMin / 60)}h {avgMin % 60}m</b> a week
          <div className="mt-1 flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: GYM }} /> Gym (logged here)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: GARMIN }} /> Garmin
            </span>
          </div>
        </div>
        <Segmented
          options={[
            { label: "Minutes", value: "minutes" },
            { label: "Sessions", value: "sessions" },
          ]}
          value={metric}
          onChange={(v) => setMetric(v as "minutes" | "sessions")}
        />
      </div>
      <ChartFrame height={200}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis
              dataKey="week"
              tickFormatter={formatShort}
              tick={{ fill: CHART.axis, fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: CHART.grid }}
              minTickGap={16}
            />
            <YAxis tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              labelFormatter={(l) => `Week of ${formatShort(String(l))}`}
              formatter={(v, n) => [metric === "minutes" ? `${v} min` : `${v}`, n]}
            />
            <Bar dataKey="Gym" stackId="t" fill={GYM} radius={[0, 0, 0, 0]} />
            <Bar dataKey="Garmin" stackId="t" fill={GARMIN} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
      {types.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-500">Garmin activities · last 90 days</div>
          <ul className="divide-y divide-zinc-800/70 text-sm">
            {types.slice(0, 6).map((t) => (
              <li key={t.type} className="flex items-baseline justify-between gap-3 py-1.5">
                <span className="text-zinc-200">
                  {titleCase(t.type)} <span className="text-xs text-zinc-500">× {t.count}</span>
                </span>
                <span className="text-xs tabular-nums text-zinc-400">
                  {Math.floor(t.minutes / 60)}h {t.minutes % 60}m{t.km > 0 ? ` · ${t.km} km` : ""} · {t.kcal.toLocaleString("en-US")} kcal
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
