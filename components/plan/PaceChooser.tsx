"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, inputClass } from "@/components/ui";
import { setGoalPace } from "@/lib/actions";
import { type PaceOption, formatMedium } from "@legymdary/shared";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * "When do you want to get there?" Three ready-made paces with their calories
 * and arrival dates, or a date of your own.
 */
export function PaceChooser({
  options,
  direction,
  currentRate,
  currentDate,
  dateTooSoon,
  today,
  overrideActive,
}: {
  options: PaceOption[];
  direction: "lose" | "gain";
  /** The pace in use, to highlight the matching option. */
  currentRate: number | null;
  currentDate: string | null;
  dateTooSoon: boolean;
  today: string;
  /** Custom calories are set (Advanced). Picking a pace replaces them. */
  overrideActive?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(currentDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const selected = currentDate ? "date" : (options.find((o) => currentRate != null && Math.abs(o.weeklyRate - currentRate) < 0.015)?.key ?? null);

  function apply(input: { weeklyRate: number } | { targetDate: string }) {
    setError(null);
    start(async () => {
      const res = await setGoalPace(input);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <p className="text-sm text-zinc-400">Pick how fast. Each option shows your daily calories and when you would get there.</p>
      {overrideActive && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          You set your own calories. Picking a pace or date below switches back to the plan&apos;s calories.
        </p>
      )}
      <div className="grid gap-2">
        {options.map((o) => {
          const on = selected === o.key;
          return (
            <button
              key={o.key}
              type="button"
              disabled={pending}
              onClick={() => apply({ weeklyRate: o.weeklyRate })}
              aria-pressed={on}
              className={cn(
                "press rounded-2xl border px-4 py-3 text-left transition-colors",
                on ? "border-teal-300/60 bg-teal-300/10" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]",
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">
                  {o.label}
                  {o.key === "balanced" && <span className="ml-2 text-xs font-normal text-teal-300">recommended</span>}
                </span>
                <span className="text-sm tabular-nums text-zinc-300">
                  {direction === "lose" ? "−" : "+"}
                  {o.effectiveRate} kg a week
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3 text-sm">
                <span className="tabular-nums text-zinc-200">{o.calories != null ? `${fmt(o.calories)} kcal a day` : "Calories once your details are in"}</span>
                <span className="tabular-nums text-zinc-400">{o.eta ? `by ${formatMedium(o.eta)}` : ""}</span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">{o.note}</div>
            </button>
          );
        })}
      </div>

      <div className={cn("rounded-2xl border px-4 py-3", selected === "date" ? "border-teal-300/60 bg-teal-300/10" : "border-white/[0.08]")}>
        <div className="mb-2 text-sm font-semibold">Or pick your own date</div>
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className={cn(inputClass, "h-11 flex-1")}
            aria-label="Goal date"
          />
          <Button variant="secondary" className="h-11" disabled={pending || !date} onClick={() => apply({ targetDate: date })}>
            Use date
          </Button>
        </div>
        {selected === "date" && dateTooSoon && (
          <p className="mt-2 text-sm text-amber-200">
            That date needs a faster pace than is safe, so the plan uses the fastest safe pace and you will arrive a bit later.
          </p>
        )}
      </div>
      {error && <p className="text-sm text-amber-300">{error}</p>}
    </Card>
  );
}
