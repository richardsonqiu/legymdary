"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
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
import { addDaysStr, formatMedium, formatShort, kg } from "@/lib/utils";

/**
 * Logged weights plus a straight-line projection from the latest weigh-in to
 * the goal weight at the planned pace. Dates are plotted as day offsets.
 */
export function ProjectionChart({
  weights,
  goalWeight,
  weeklyRate,
  direction,
}: {
  weights: { date: string; weight: number }[];
  goalWeight: number | null;
  weeklyRate: number;
  direction: "lose" | "gain" | "maintain";
}) {
  if (weights.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
        Log your weight on the Stats tab to see your projection.
      </p>
    );
  }
  const last = weights[weights.length - 1];
  const data: { date: string; actual?: number; projected?: number }[] = weights.map((w) => ({
    date: w.date,
    actual: w.weight,
  }));
  data[data.length - 1].projected = last.weight;

  if (goalWeight != null && weeklyRate > 0 && direction !== "maintain") {
    const sign = direction === "lose" ? -1 : 1;
    const weeks = Math.ceil(Math.abs(goalWeight - last.weight) / weeklyRate);
    for (let i = 1; i <= Math.min(weeks, 104); i++) {
      const v = last.weight + sign * weeklyRate * i;
      const done = sign < 0 ? v <= goalWeight : v >= goalWeight;
      data.push({ date: addDaysStr(last.date, i * 7), projected: done ? goalWeight : v });
      if (done) break;
    }
  }

  const vals = data.flatMap((d) => [d.actual, d.projected]).filter((v): v is number => v != null);
  if (goalWeight != null) vals.push(goalWeight);
  const min = Math.floor(Math.min(...vals) - 1);
  const max = Math.ceil(Math.max(...vals) + 1);

  return (
    <ChartFrame height={220}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatShort}
            stroke={CHART.axis}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            domain={[min, max]}
            stroke={CHART.axis}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          {goalWeight != null && (
            <ReferenceLine
              y={goalWeight}
              stroke="#34d399"
              strokeDasharray="4 4"
              label={{ value: "goal", fill: "#34d399", fontSize: 10, position: "insideTopRight" }}
            />
          )}
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            labelFormatter={(l) => formatMedium(String(l))}
            formatter={(v, name) => [`${kg(Number(v))} kg`, name === "actual" ? "Logged" : "Projected"]}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke={CHART.line}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="projected"
            stroke={CHART.lineSoft}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
