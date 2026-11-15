"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART, ChartFrame, tooltipLabelStyle, tooltipStyle } from "@/components/charts/common";
import { GarminAttribution } from "@/components/garmin/GarminAttribution";
import { Card } from "@/components/ui";
import { isFullyLogged } from "@/lib/energy";
import { KCAL_PER_KG } from "@/lib/nutrition";
import { addDaysStr, cn, formatShort, kg, todayStr } from "@/lib/utils";

const noop = () => () => {};
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export type EnergyRow = {
  date: string;
  eaten: number;
  meals: number;
  burned: number | null;
};

/** Calories in (food log) vs out (Garmin) — today and the last 7 days. */
export function EnergyBalanceCard({ rows }: { rows: EnergyRow[] }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const today = mounted ? todayStr() : null;

  const data = useMemo(() => {
    if (!today) return null;
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = addDaysStr(today, i - 7); // the 7 complete days before today
      const r = byDate.get(date);
      return { date, eaten: r?.eaten ?? 0, meals: r?.meals ?? 0, burned: r?.burned ?? null };
    });
    const complete = week.filter(
      (d) => d.burned != null && isFullyLogged({ date: d.date, calories: d.eaten, count: d.meals }),
    );
    const net = complete.reduce((a, d) => a + d.eaten - (d.burned ?? 0), 0);
    return { todayRow: byDate.get(today) ?? null, week, complete, net };
  }, [rows, today]);

  if (!data) {
    return <div className="h-64 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />;
  }
  const t = data.todayRow;
  const todayNet = t && t.burned != null ? t.eaten - t.burned : null;
  const avgNet = data.complete.length ? data.net / data.complete.length : null;

  return (
    <Card className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Mini label="Eaten today" value={fmt(t?.eaten ?? 0)} />
        <Mini label="Burned so far" value={t?.burned != null ? fmt(t.burned) : "–"} />
        <Mini
          label="Net"
          value={todayNet != null ? `${todayNet > 0 ? "+" : "−"}${fmt(Math.abs(todayNet))}` : "–"}
          tone={todayNet == null ? undefined : todayNet > 0 ? "surplus" : "deficit"}
        />
      </div>

      <ChartFrame height={150}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.week} margin={{ top: 4, right: 4, left: -12, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => formatShort(String(d)).split(" ")[0]}
              stroke={CHART.axis}
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke={CHART.axis}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v) => (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(1)}k` : String(v))}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              labelFormatter={(l) => formatShort(String(l))}
              formatter={(v, name) => [`${fmt(Number(v))} kcal`, name === "eaten" ? "Eaten" : "Burned"]}
            />
            <Bar dataKey="eaten" fill="#34d399" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="burned" fill="#71717a" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      <div className="flex items-center gap-4 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-400" />Eaten</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-zinc-500" />Burned (Garmin)</span>
      </div>

      {avgNet != null ? (
        <p className="text-sm text-zinc-300">
          Last {data.complete.length} fully-logged day{data.complete.length === 1 ? "" : "s"}: avg{" "}
          <b className={cn(avgNet > 0 ? "text-amber-300" : "text-emerald-300")}>
            {avgNet > 0 ? "+" : ""}
            {fmt(avgNet)} kcal/day
          </b>{" "}
          {Math.abs((avgNet * 7) / KCAL_PER_KG) < 0.05
            ? "≈ maintenance."
            : `≈ ${avgNet > 0 ? "+" : "−"}${kg(Math.abs((avgNet * 7) / KCAL_PER_KG))} kg/week.`}
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          Log all your meals for a few days to see your weekly energy balance.
        </p>
      )}
      <GarminAttribution />
    </Card>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "surplus" | "deficit" }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "surplus" && "text-amber-300",
          tone === "deficit" && "text-emerald-300",
        )}
      >
        {value}
      </div>
    </div>
  );
}
