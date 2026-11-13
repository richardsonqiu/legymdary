"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { MacroSummary } from "@/components/food/MacroSummary";
import { CameraIcon } from "@/components/icons";
import { Card, buttonClass } from "@/components/ui";
import type { DailyTargets } from "@/lib/nutrition";
import type { DayTotals } from "@/lib/queries";
import { todayStr } from "@/lib/utils";

const noop = () => () => {};

/** Today's intake, with "today" resolved in the user's timezone. */
export function TodayFoodCard({
  totals,
  targets,
}: {
  totals: DayTotals[];
  targets: DailyTargets;
}) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) {
    return <div className="h-40 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />;
  }
  const today = todayStr();
  const t = totals.find((d) => d.date === today);
  return (
    <Card className="space-y-4">
      <MacroSummary
        compact
        totals={t ?? { calories: 0, protein: 0, carbs: 0, fat: 0 }}
        targets={targets}
      />
      <Link href="/food" className={buttonClass("secondary", "md", "w-full")}>
        <CameraIcon className="h-4 w-4" />
        {t ? `${t.count} meal${t.count > 1 ? "s" : ""} logged · add another` : "Log your first meal today"}
      </Link>
    </Card>
  );
}
