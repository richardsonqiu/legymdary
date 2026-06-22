"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART,
  ChartFrame,
  RANGE_OPTIONS,
  Segmented,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/components/charts/common";
import type { BodyStat } from "@/db/schema";
import { addDaysStr, formatMedium, formatShort, kg, todayStr } from "@/lib/utils";

type Metric = "weight" | "waist" | "bodyFat";

const METRICS: { label: string; value: Metric; unit: string }[] = [
  { label: "Weight", value: "weight", unit: "kg" },
  { label: "Waist", value: "waist", unit: "cm" },
  { label: "Body fat", value: "bodyFat", unit: "%" },
];

export function BodyStatsChart({ data }: { data: BodyStat[] }) {
  const [metric, setMetric] = useState<Metric>("weight");
  const [range, setRange] = useState<number>(90);
  const meta = METRICS.find((m) => m.value === metric)!;

  const points = useMemo(() => {
    const min = range > 0 ? addDaysStr(todayStr(), -range) : "0000-00-00";
    return data
      .filter((d) => d.date >= min && d[metric] != null)
      .map((d) => ({ date: d.date, value: d[metric] as number }));
  }, [data, metric, range]);

  const first = points[0]?.value;
  const last = points[points.length - 1]?.value;
  const delta = first != null && last != null ? last - first : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          options={METRICS.map((m) => ({ label: m.label, value: m.value }))}
          value={metric}
          onChange={setMetric}
        />
        <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
      </div>

      {last != null ? (
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {kg(last)}
            <span className="ml-0.5 text-sm font-normal text-zinc-500">
              {meta.unit}
            </span>
          </span>
          {delta != null && delta !== 0 && (
            <span className="text-xs tabular-nums text-zinc-400">
              {delta > 0 ? "+" : ""}
              {kg(delta)} {meta.unit} over range
            </span>
          )}
        </div>
      ) : null}

      {points.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
          No {meta.label.toLowerCase()} data in this range.
        </p>
      ) : (
        <ChartFrame height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 8, right: 8, bottom: 0, left: -12 }}
            >
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatShort}
                tick={{ fill: CHART.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: CHART.grid }}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: CHART.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={40}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                labelFormatter={(l) => formatMedium(String(l))}
                formatter={(v: unknown) => [
                  `${kg(Number(v))} ${meta.unit}`,
                  meta.label,
                ]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={CHART.line}
                strokeWidth={2}
                dot={{ r: 2.5, fill: CHART.line }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}
    </div>
  );
}
