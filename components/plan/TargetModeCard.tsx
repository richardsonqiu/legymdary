"use client";

import { formatPretty } from "@legymdary/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarIcon, FlameIcon, LockIcon, WaveIcon } from "@/components/icons";
import { Card } from "@/components/ui";
import { setReviewCadence, setTargetMode } from "@/lib/actions";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Steady (fixed until you change it) or adaptive (follows burn and weight). */
export function TargetModeCard({
  mode,
  current,
  direction,
  cadence,
  nextReview,
}: {
  mode: "steady" | "adaptive";
  current: number;
  direction: "lose" | "gain" | "maintain";
  cadence: "weekly" | "monthly";
  nextReview: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { error: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if ("error" in r) setError(r.error);
      router.refresh();
    });

  const options = [
    {
      key: "steady" as const,
      icon: LockIcon,
      title: "Steady",
      tag: direction === "maintain" ? null : "recommended",
      line: (
        <>
          <b className="tabular-nums text-zinc-200">{fmt(current)} kcal</b> every day ·{" "}
          <FlameIcon className="inline h-3.5 w-3.5 align-[-2px] text-orange-300" /> workouts ={" "}
          {direction === "gain" ? "smaller surplus" : "extra deficit"}
        </>
      ),
    },
    {
      key: "adaptive" as const,
      icon: WaveIcon,
      title: "Adapts to my burn",
      tag: null,
      line: <>Follows your average burn and weight, at each review (max 100 kcal a step)</>,
    },
  ];

  return (
    <Card className="space-y-3">
      <div className="grid gap-2">
        {options.map((o) => {
          const on = mode === o.key;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={on}
              disabled={pending}
              onClick={() => !on && run(() => setTargetMode(o.key))}
              className={cn(
                "press flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors",
                on ? "border-teal-300/60 bg-teal-300/10" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]",
              )}
            >
              <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", on ? "bg-teal-300/20 text-teal-200" : "bg-zinc-800 text-zinc-400")}>
                <o.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">
                  {o.title}
                  {o.tag && <span className="ml-2 text-xs font-normal text-teal-300">{o.tag}</span>}
                </span>
                <span className="block text-xs text-zinc-400">{o.line}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          <CalendarIcon className="h-4 w-4" /> Review
        </span>
        <div role="radiogroup" aria-label="Review how often" className="flex flex-1 gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
          {(["weekly", "monthly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={cadence === c}
              disabled={pending}
              onClick={() => cadence !== c && run(() => setReviewCadence(c))}
              className={cn(
                "press flex-1 rounded-lg py-1.5 text-xs font-medium",
                cadence === c ? "bg-citron text-carbon" : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              {c === "weekly" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-zinc-500">
        Next review {formatPretty(nextReview)}. The target only changes at a review, never day to day.
      </p>
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <LockIcon className="h-3.5 w-3.5" /> Past days keep their target
      </p>
      {error && <p className="text-sm text-amber-300">{error}</p>}
    </Card>
  );
}
