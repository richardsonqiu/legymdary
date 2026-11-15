"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { GarminAttribution } from "@/components/garmin/GarminAttribution";
import { BoltIcon } from "@/components/icons";
import { Card } from "@/components/ui";
import type { Readiness } from "@/lib/energy";
import { cn, todayStr } from "@/lib/utils";

const noop = () => () => {};

export function ReadinessCard({ byDate }: { byDate: Record<string, Readiness | null> }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) {
    return <div className="h-32 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />;
  }
  const r = byDate[todayStr()];
  if (!r) {
    return (
      <Card className="text-sm text-zinc-400">
        No recovery data for today yet — wear your watch to sleep, then{" "}
        <Link href="/garmin" transitionTypes={["nav-forward"]} className="text-zinc-200 underline">sync</Link>.
      </Card>
    );
  }
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            r.verdict === "push" && "bg-emerald-500/15 text-emerald-300",
            r.verdict === "normal" && "bg-sky-500/15 text-sky-300",
            r.verdict === "easy" && "bg-amber-500/15 text-amber-300",
          )}
        >
          <BoltIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold">{r.headline}</div>
          <div className="text-xs text-zinc-400">{r.advice}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {r.signals.map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">{s.label}</div>
            <div
              className={cn(
                "text-sm font-semibold tabular-nums",
                s.tone === "good" && "text-emerald-300",
                s.tone === "poor" && "text-amber-300",
              )}
            >
              {s.value}
            </div>
          </div>
        ))}
      </div>
      <GarminAttribution />
    </Card>
  );
}
