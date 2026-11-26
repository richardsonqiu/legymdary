"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import type { Balance, Period } from "@/lib/balance";
import { cn, formatShort } from "@/lib/utils";

const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString("en-US");
const signed = (n: number, unit = "") => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("en-US")}${unit}`;
const LABEL: Record<Period, string> = { week: "Week", month: "Month", year: "Year" };
const RANGE: Record<Period, string> = { week: "last 7 days", month: "last 30 days", year: "last 12 months" };

/**
 * How much deficit (or surplus) you built up over a week, month or year, the
 * weight change that implies, and what the scale actually did.
 */
export function CalorieBalance({
  data,
  direction,
  planDaily,
  verdicts,
}: {
  data: Record<Period, Balance>;
  direction: "lose" | "gain" | "maintain";
  /** The plan's daily deficit / surplus (target − maintenance), for comparison. */
  planDaily: number | null;
  verdicts: Record<Period, string | null>;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const b = data[period];
  const deficit = b.balance < 0;
  const word = deficit ? "deficit" : "surplus";
  const onTrack = direction === "lose" ? deficit : direction === "gain" ? !deficit && b.balance > 0 : Math.abs(b.avgDaily ?? 0) < 150;
  const max = Math.max(1, ...b.bars.map((x) => Math.abs(x.value ?? 0)));

  return (
    <Card className="space-y-4">
      <div role="tablist" className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
        {(["week", "month", "year"] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className={cn(
              "press flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors",
              period === p ? "bg-zinc-100 text-zinc-950" : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            {LABEL[p]}
          </button>
        ))}
      </div>

      {b.counted === 0 ? (
        <p className="text-sm text-zinc-400">
          No complete days in the {RANGE[period]} yet. Log all your meals for a day (or mark skipped ones) and it counts here.
        </p>
      ) : (
        <>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              {RANGE[period]} · {b.counted} of {b.days} days counted
            </div>
            <div className={cn("mt-1 text-3xl font-semibold tabular-nums", onTrack ? "text-emerald-300" : "text-amber-300")}>
              {fmt(b.balance)} kcal {word}
            </div>
            <div className="text-sm text-zinc-400">
              {b.avgDaily != null && <>about {fmt(b.avgDaily)} a day</>}
              {planDaily != null && planDaily !== 0 && (
                <>
                  {" "}
                  · your plan aims for {fmt(planDaily)} {planDaily < 0 ? "deficit" : "surplus"}
                </>
              )}
            </div>
          </div>

          {/* Daily (or monthly average) balance: below the line = deficit, above = surplus. */}
          <div className="relative h-24" aria-hidden="true">
            <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-700" />
            <div className="flex h-full items-stretch gap-[2px]">
              {b.bars.map((x) => {
                const h = x.value == null ? 0 : (Math.abs(x.value) / max) * 50;
                const good = x.value != null && (direction === "gain" ? x.value > 0 : x.value < 0);
                return (
                  <div key={x.date} className="relative flex-1" title={x.value == null ? `${formatShort(x.date)}: not counted` : `${formatShort(x.date)}: ${signed(x.value)} kcal`}>
                    {x.value == null ? (
                      <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-700" />
                    ) : (
                      <div
                        className={cn("absolute inset-x-0 rounded-sm", good ? "bg-emerald-400/80" : "bg-amber-400/80")}
                        style={x.value < 0 ? { top: "50%", height: `${h}%` } : { bottom: "50%", height: `${h}%` }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {period !== "month" && (
            <div className="-mt-2 flex justify-between text-[10px] text-zinc-500">
              {b.bars.map((x, i) => (
                <span key={x.date} className={cn("flex-1 text-center", period === "year" && i % 2 === 1 && "invisible")}>
                  {x.label}
                </span>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">From your logs</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">
                {b.estimateKg != null ? `${signed(b.estimateKg)} kg` : "–"}
              </div>
              <div className="text-[11px] text-zinc-400">
                {b.estimateKg != null ? `${b.compareDays < b.days ? `over ${b.compareDays} days, ` : ""}7,700 kcal is about 1 kg` : "needs 3 complete days"}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">On the scale</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">{b.scale ? `${signed(b.scale.change)} kg` : "–"}</div>
              <div className="text-[11px] text-zinc-400">
                {b.scale ? `${b.scale.weighIns} weigh-ins, trend line` : "weigh in a few times to compare"}
              </div>
            </div>
          </div>
          {verdicts[period] && <p className="text-sm text-zinc-300">{verdicts[period]}</p>}

          <p className="text-[11px] leading-relaxed text-zinc-500">
            Eaten {fmt(b.eaten)} kcal, burned {fmt(b.burned)} kcal on counted days.{" "}
            {b.estimatedBurn
              ? "Days without watch data use your plan's estimated burn. "
              : "Burn comes from your watch or ring. "}
            Days without a full food log are left out, so they can&apos;t make it look better or worse.
          </p>
        </>
      )}
    </Card>
  );
}
