"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART,
  ChartFrame,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/components/charts/common";
import { formatShort } from "@/lib/utils";

export function WeeklyVolumeChart({
  weeks,
}: {
  weeks: { week: string; sets: number }[];
}) {
  const total = weeks.reduce((a, w) => a + w.sets, 0);

  if (total === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
        Log some workouts to see your weekly training volume.
      </p>
    );
  }

  return (
    <ChartFrame height={200}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={weeks}
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        >
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="week"
            tickFormatter={formatShort}
            tick={{ fill: CHART.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
            minTickGap={16}
          />
          <YAxis
            tick={{ fill: CHART.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            labelFormatter={(l) => `Week of ${formatShort(String(l))}`}
            formatter={(v: unknown) => [`${Number(v)} sets`, "Volume"]}
          />
          <Bar dataKey="sets" fill={CHART.bar} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
