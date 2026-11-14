"use client";

import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import { DumbbellIcon, FlameIcon } from "@/components/icons";
import { buttonClass, Card } from "@/components/ui";
import { calcStreaks } from "@/lib/utils";

/** Streak is computed on the client so "today" is the user's local day. */
export function StreakCard({
  workoutDates,
  active,
}: {
  workoutDates: string[];
  active: { name: string; count: number } | null;
}) {
  const { current, longest } = calcStreaks(workoutDates);

  return (
    <Card className="space-y-4 border-zinc-700/70 bg-gradient-to-b from-zinc-900 to-zinc-900/40">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5 text-sm text-zinc-400">
            <FlameIcon className="h-4 w-4" />
            Current streak
          </div>
          <div className="mt-1 text-5xl font-bold leading-none tabular-nums">
            <CountUp value={current} duration={500} />
            <span className="ml-1.5 text-xl font-medium text-zinc-500">
              {current === 1 ? "day" : "days"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">
            Longest
          </div>
          <div className="text-lg font-semibold tabular-nums text-zinc-300">
            {longest}
          </div>
        </div>
      </div>

      <Link href="/log" transitionTypes={["nav-forward"]} className={buttonClass("primary", "lg", "w-full")}>
        <DumbbellIcon className="h-5 w-5" />
        {active ? "Continue workout" : "Start workout"}
      </Link>
      {active && (
        <p className="-mt-1 text-center text-xs text-zinc-500">
          {active.name} · {active.count} exercise
          {active.count === 1 ? "" : "s"} in progress
        </p>
      )}
    </Card>
  );
}
