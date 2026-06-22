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
import { EmptyState } from "@/components/ui";
import { BarsIcon } from "@/components/icons";
import type { ProgressPoint } from "@/lib/queries";
import { addDaysStr, formatMedium, formatShort, kg, todayStr } from "@/lib/utils";

type Metric = "topWeight" | "volume" | "bestE1rm";

const METRICS: { label: string; value: Metric; unit: string }[] = [
  { label: "Top set", value: "topWeight", unit: "kg" },
  { label: "Volume", value: "volume", unit: "kg" },
  { label: "Est 1RM", value: "bestE1rm", unit: "kg" },
];

const selectClass =
  "h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 text-sm font-medium text-zinc-100 outline-none focus:border-zinc-500";

export function ExerciseProgressChart({
  exercises,
  byExercise,
}: {
  exercises: { id: number; name: string }[];
  byExercise: Record<number, ProgressPoint[]>;
}) {
  const [exerciseId, setExerciseId] = useState<number>(exercises[0]?.id ?? 0);
  const [metric, setMetric] = useState<Metric>("topWeight");
  const [range, setRange] = useState<number>(90);
  const meta = METRICS.find((m) => m.value === metric)!;

  const points = useMemo(() => {
    const all = byExercise[exerciseId] ?? [];
    const min = range > 0 ? addDaysStr(todayStr(), -range) : "0000-00-00";
    return all
      .filter((p) => p.date >= min)
      .map((p) => ({ date: p.date, value: Math.round(p[metric] * 10) / 10 }));
  }, [byExercise, exerciseId, metric, range]);

  if (exercises.length === 0) {
    return (
      <EmptyState
        icon={<BarsIcon className="h-6 w-6" />}
        title="No exercise history yet"
        description="Log a few workouts and your per-exercise progress will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      <select
        value={exerciseId}
        onChange={(e) => setExerciseId(Number(e.target.value))}
        className={selectClass}
      >
        {exercises.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          options={METRICS.map((m) => ({ label: m.label, value: m.value }))}
          value={metric}
          onChange={setMetric}
        />
        <Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />
      </div>

      {points.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
          No data in this range.
        </p>
      ) : (
        <ChartFrame height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
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
                width={44}
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
