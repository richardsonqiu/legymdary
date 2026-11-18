"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, ChartFrame, Segmented, tooltipLabelStyle, tooltipStyle } from "@/components/charts/common";
import type { SeriesPoint } from "@/lib/analysis/service";
import { formatMedium, formatShort } from "@/lib/utils";

const METRICS = [
  { value: "readiness", label: "Ready", unit: "" },
  { value: "hrv", label: "HRV", unit: " ms" },
  { value: "rhr", label: "RHR", unit: " bpm" },
  { value: "sleepScore", label: "Score", unit: "" },
  { value: "sleepHours", label: "Hours", unit: " h" },
  { value: "battery", label: "Battery", unit: "" },
  { value: "strain", label: "Strain", unit: "" },
] as const;
type Key = (typeof METRICS)[number]["value"];

export function TrendChart({ series }: { series: SeriesPoint[] }) {
  const [metric, setMetric] = useState<Key>("readiness");
  const meta = METRICS.find((m) => m.value === metric)!;
  const pts = series.filter((s) => s[metric] != null);

  return (
    <div className="space-y-3">
      <Segmented
        options={METRICS.map((m) => ({ label: m.label, value: m.value }))}
        value={metric}
        onChange={setMetric}
        className="max-w-full overflow-x-auto [scrollbar-width:none]"
      />
      {pts.length < 2 ? (
        <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
          Not enough {meta.label.toLowerCase()} data yet.
        </p>
      ) : (
        <ChartFrame height={190}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 6, right: 6, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatShort} stroke={CHART.axis} fontSize={10} tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis domain={["auto", "auto"]} stroke={CHART.axis} fontSize={10} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={tooltipLabelStyle}
                labelFormatter={(l) => formatMedium(String(l))}
                formatter={(v) => [`${v}${meta.unit}`, meta.label]}
              />
              <Line type="monotone" dataKey={metric} stroke={CHART.line} strokeWidth={2} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}
    </div>
  );
}
