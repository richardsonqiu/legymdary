"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card } from "@/components/ui";
import { relockTarget, setTargetMode } from "@/lib/actions";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Steady (fixed until you change it) or adaptive (follows burn and weight). */
export function TargetModeCard({
  mode,
  current,
  live,
  direction,
}: {
  mode: "steady" | "adaptive";
  current: number;
  /** What the plan would say right now. */
  live: number | null;
  direction: "lose" | "gain" | "maintain";
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
  const extra = direction === "gain" ? "surplus" : "deficit";
  const drift = live != null ? live - current : 0;

  const options = [
    {
      key: "steady" as const,
      title: "Steady",
      tag: direction === "maintain" ? null : "recommended",
      body:
        direction === "gain"
          ? `Stays at ${fmt(current)} kcal. Workouts don't change it, so on hard training days eat a little more if you want to keep your surplus.`
          : `Stays at ${fmt(current)} kcal. Workouts don't add calories, so extra exercise becomes extra ${extra} and you lose a bit faster.`,
    },
    {
      key: "adaptive" as const,
      title: "Adapts to my burn",
      tag: null,
      body: "Moves with your average daily burn and weight (changes under 50 kcal are skipped). More training over time means a higher target.",
    },
  ];

  return (
    <Card className="space-y-3">
      <div className="grid gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={mode === o.key}
            disabled={pending}
            onClick={() => mode !== o.key && run(() => setTargetMode(o.key))}
            className={cn(
              "press rounded-2xl border px-4 py-3 text-left transition-colors",
              mode === o.key ? "border-teal-300/60 bg-teal-300/10" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]",
            )}
          >
            <div className="font-semibold">
              {o.title}
              {o.tag && <span className="ml-2 text-xs font-normal text-teal-300">{o.tag}</span>}
            </div>
            <div className="mt-0.5 text-sm text-zinc-400">{o.body}</div>
          </button>
        ))}
      </div>
      {mode === "steady" && live != null && Math.abs(drift) >= 50 && (
        <div className="space-y-2 rounded-xl border border-sky-300/20 bg-sky-300/[0.06] px-3 py-2.5 text-sm text-sky-100">
          <p>
            With your latest weight and burn, the plan would now say <b>{fmt(live)} kcal</b> ({drift > 0 ? "+" : ""}
            {fmt(drift)}). Your target stays at {fmt(current)} until you update it.
          </p>
          <Button variant="secondary" className="w-full" disabled={pending} onClick={() => run(relockTarget)}>
            Update to {fmt(live)} kcal from today
          </Button>
        </div>
      )}
      <p className="text-xs text-zinc-500">Either way, past days keep the target they had.</p>
      {error && <p className="text-sm text-amber-300">{error}</p>}
    </Card>
  );
}
