"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FlameIcon, LockIcon, RefreshIcon, WaveIcon } from "@/components/icons";
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
  const drift = live != null ? live - current : 0;

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
      line: <>Follows your average burn and weight</>,
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
      {mode === "steady" && live != null && Math.abs(drift) >= 50 && (
        <div className="flex items-center gap-3 rounded-xl border border-sky-300/20 bg-sky-300/[0.06] px-3 py-2.5">
          <div className="min-w-0 flex-1 text-sm text-sky-100">
            <div className="text-[11px] uppercase tracking-wide text-sky-200/70">Plan now</div>
            <div className="tabular-nums">
              <b>{fmt(live)}</b> kcal{" "}
              <span className="text-sky-200/70">
                ({drift > 0 ? "+" : "−"}
                {fmt(Math.abs(drift))})
              </span>
            </div>
          </div>
          <Button variant="secondary" disabled={pending} onClick={() => run(relockTarget)} aria-label={`Update to ${fmt(live)} kcal from today`}>
            <RefreshIcon className="h-4 w-4" /> Update
          </Button>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <LockIcon className="h-3.5 w-3.5" /> Past days keep their target
      </p>
      {error && <p className="text-sm text-amber-300">{error}</p>}
    </Card>
  );
}
