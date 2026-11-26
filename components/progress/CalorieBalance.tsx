"use client";

import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, FlameIcon, ForkIcon, InfoIcon, PencilIcon, ScaleIcon, TargetIcon } from "@/components/icons";
import { Card } from "@/components/ui";
import { type Balance, type Period, formatShort } from "@legymdary/shared";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString("en-US");
const signed = (n: number, d = 0) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`;
const LABEL: Record<Period, string> = { week: "Week", month: "Month", year: "Year" };

/** Deficit or surplus over a week, month or year; vs target; and logs vs the scale. */
export function CalorieBalance({
  data,
  direction,
  planDaily,
  verdicts,
}: {
  data: Record<Period, Balance>;
  direction: "lose" | "gain" | "maintain";
  /** The plan's daily deficit / surplus (target − maintenance). */
  planDaily: number | null;
  verdicts: Record<Period, string | null>;
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [why, setWhy] = useState(false);
  const b = data[period];
  const deficit = b.balance < 0;
  const good = direction === "gain" ? b.balance > 0 : direction === "lose" ? deficit : Math.abs(b.avgDaily ?? 0) < 150;
  const max = Math.max(1, ...b.bars.map((x) => Math.abs(x.value ?? 0)));
  const verdict = verdicts[period];
  const agrees = verdict?.startsWith("Your scale agrees");
  const kgMax = Math.max(0.1, Math.abs(b.estimateKg ?? 0), Math.abs(b.scale?.change ?? 0));
  const targetGood = b.vsTarget != null && (direction === "gain" ? b.vsTarget >= 0 : b.vsTarget <= 0);

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
              period === p ? "bg-citron text-carbon" : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            {LABEL[p]}
          </button>
        ))}
      </div>

      {b.counted === 0 ? (
        <div className="flex items-center gap-3 py-2 text-sm text-zinc-400">
          <PencilIcon className="h-5 w-5 shrink-0" />
          Log full days of food to see your balance.
        </div>
      ) : (
        <>
          {/* Hero */}
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                good ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300",
              )}
            >
              {deficit ? <ArrowDownIcon className="h-6 w-6" /> : <ArrowUpIcon className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              <div className={cn("text-3xl font-semibold leading-none tabular-nums", good ? "text-emerald-300" : "text-amber-300")}>
                {fmt(b.balance)}
                <span className="ml-1.5 text-base font-medium">kcal {deficit ? "deficit" : "surplus"}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-zinc-400">
                {b.avgDaily != null && <span className="tabular-nums">{fmt(b.avgDaily)}/day</span>}
                {planDaily != null && planDaily !== 0 && (
                  <span className="flex items-center gap-1 tabular-nums" title="Your plan's daily deficit or surplus">
                    <TargetIcon className="h-3.5 w-3.5" /> plan {fmt(planDaily)}/day
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Days counted */}
          <div title={`${b.counted} of ${b.days} days had a full food log`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-zinc-400" style={{ width: `${(b.counted / b.days) * 100}%` }} />
            </div>
            <div className="mt-1 text-[11px] tabular-nums text-zinc-500">
              {b.counted}/{b.days} days logged
            </div>
          </div>

          {/* Eaten · burned · vs target */}
          <div className="grid grid-cols-3 gap-2">
            <Chip icon={<ForkIcon className="h-4 w-4 text-sky-300" />} value={fmt(b.eaten)} label="eaten" />
            <Chip icon={<FlameIcon className="h-4 w-4 text-orange-300" />} value={fmt(b.burned)} label={b.estimatedBurn ? "burned*" : "burned"} />
            <Chip
              icon={<TargetIcon className={cn("h-4 w-4", b.vsTarget == null ? "text-zinc-500" : targetGood ? "text-emerald-300" : "text-amber-300")} />}
              value={b.vsTarget != null ? `${b.vsTarget > 0 ? "+" : b.vsTarget < 0 ? "−" : ""}${fmt(b.vsTarget)}` : "–"}
              label={b.vsTarget == null ? "vs target" : b.vsTarget <= 0 ? "under target" : "over target"}
            />
          </div>

          {/* Bars: below the line = deficit, above = surplus */}
          <div>
            <div className="relative h-20" aria-hidden="true">
              <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-700" />
              <div className="flex h-full items-stretch gap-[2px]">
                {b.bars.map((x) => {
                  const h = x.value == null ? 0 : (Math.abs(x.value) / max) * 50;
                  const ok = x.value != null && (direction === "gain" ? x.value > 0 : x.value < 0);
                  return (
                    <div
                      key={x.date}
                      className="relative flex-1"
                      title={x.value == null ? `${formatShort(x.date)}: not logged` : `${formatShort(x.date)}: ${signed(x.value)} kcal`}
                    >
                      {x.value == null ? (
                        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-700" />
                      ) : (
                        <div
                          className={cn("absolute inset-x-0 rounded-sm", ok ? "bg-emerald-400/80" : "bg-amber-400/80")}
                          style={x.value < 0 ? { top: "50%", height: `${h}%` } : { bottom: "50%", height: `${h}%` }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {period !== "month" && (
              <div className="mt-1 flex text-[10px] text-zinc-500">
                {b.bars.map((x, i) => (
                  <span key={x.date} className={cn("flex-1 text-center", period === "year" && i % 2 === 1 && "invisible")}>
                    {x.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Logs vs scale */}
          <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
            <KgRow icon={<ForkIcon className="h-4 w-4" />} label="Logs" value={b.estimateKg} max={kgMax} />
            <KgRow icon={<ScaleIcon className="h-4 w-4" />} label="Scale" value={b.scale?.change ?? null} max={kgMax} />
            {verdict && (
              <button
                type="button"
                onClick={() => setWhy((v) => !v)}
                aria-expanded={why}
                className={cn("flex w-full items-center gap-2 pt-1 text-left text-xs", agrees ? "text-emerald-300" : "text-amber-200")}
              >
                {agrees ? <CheckIcon className="h-4 w-4" /> : <InfoIcon className="h-4 w-4" />}
                <span className="font-medium">
                  {agrees
                    ? "Scale matches your logs"
                    : (b.scale?.change ?? 0) > (b.estimateKg ?? 0)
                      ? "Scale is behind your logs"
                      : "Scale is ahead of your logs"}
                </span>
                {!agrees && <span className="ml-auto text-zinc-500">{why ? "hide" : "why?"}</span>}
              </button>
            )}
            {why && verdict && !agrees && <p className="text-xs text-zinc-400">{verdict}</p>}
          </div>

          <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <InfoIcon className="h-3.5 w-3.5 shrink-0" />
            Full-log days only · 7,700 kcal is about 1 kg{b.estimatedBurn ? " · *estimated burn without a watch" : ""}
          </p>
        </>
      )}
    </Card>
  );
}

function Chip({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="truncate text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}

/** A signed kg bar from the centre: left = lost, right = gained. */
function KgRow({ icon, label, value, max }: { icon: React.ReactNode; label: string; value: number | null; max: number }) {
  const pct = value == null ? 0 : (Math.abs(value) / max) * 50;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex w-14 shrink-0 items-center gap-1.5 text-zinc-400">
        {icon}
        {label}
      </span>
      <div className="relative h-2.5 flex-1 rounded-full bg-zinc-800">
        <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
        {value != null && (
          <div
            className={cn("absolute inset-y-0 rounded-full", value <= 0 ? "bg-sky-300" : "bg-violet-300")}
            style={value <= 0 ? { right: "50%", width: `${pct}%` } : { left: "50%", width: `${pct}%` }}
          />
        )}
      </div>
      <span className="w-16 shrink-0 text-right font-semibold tabular-nums">{value != null ? `${signed(value, 1)} kg` : "–"}</span>
    </div>
  );
}
