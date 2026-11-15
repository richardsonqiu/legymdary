"use client";

import { addDays, format, parseISO, startOfWeek } from "date-fns";
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { CountUp } from "@/components/CountUp";
import { Celebration } from "@/components/consistency/Celebration";
import { DumbbellIcon } from "@/components/icons";
import { buttonClass, Card } from "@/components/ui";
import type { ConsistencyDay } from "@/lib/queries";
import {
  foodStreak,
  FOOD_MILESTONES,
  isActiveDay,
  isLoggedDay,
  milestoneReached,
  nextMilestone,
  weekStreak,
  WEEK_MILESTONES,
  WEEKLY_TARGET,
} from "@/lib/streaks";
import { cn, todayStr } from "@/lib/utils";

const noop = () => () => {};
const ds = (d: Date) => format(d, "yyyy-MM-dd");

/** Weekly exercise streak + daily food-logging streak, this week at a glance, and milestone celebrations. */
export function StreaksCard({
  days,
  active,
}: {
  days: ConsistencyDay[];
  active: { name: string; count: number } | null;
}) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const today = mounted ? todayStr() : null;

  const data = useMemo(() => {
    if (!today) return null;
    const ws = weekStreak(byDate, today);
    const fs = foodStreak(byDate, today);
    const weekStart = startOfWeek(parseISO(today), { weekStartsOn: 1 });
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = ds(addDays(weekStart, i));
      return { date, active: isActiveDay(byDate.get(date)), logged: isLoggedDay(byDate.get(date)), future: date > today };
    });
    // Streak start dates make each celebration unique to that streak.
    const foodStart = ds(addDays(parseISO(today), -(fs.current - (isLoggedDay(byDate.get(today)) ? 1 : 0))));
    const weekStartStreak = ds(addDays(weekStart, -7 * Math.max(0, ws.current - (ws.thisWeek >= WEEKLY_TARGET ? 1 : 0))));
    return { ws, fs, week, foodStart, weekStartStreak };
  }, [byDate, today]);

  if (!data) return <div className="h-56 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />;
  const { ws, fs, week } = data;
  const foodM = milestoneReached(fs.current, FOOD_MILESTONES);
  const weekM = milestoneReached(ws.current, WEEK_MILESTONES);
  const nextFood = nextMilestone(fs.current, FOOD_MILESTONES);
  const nextWeek = nextMilestone(ws.current, WEEK_MILESTONES);
  const left = Math.max(0, WEEKLY_TARGET - ws.thisWeek);

  return (
    <div className="space-y-3">
      {weekM && (
        <Celebration
          id={`weeks-${weekM}-${data.weekStartStreak}`}
          emoji="🏆"
          title={`${weekM} weeks in a row!`}
          text={`You've trained ${WEEKLY_TARGET}+ days every week for ${weekM} weeks. That's how results are built.`}
        />
      )}
      {foodM && (
        <Celebration
          id={`food-${foodM}-${data.foodStart}`}
          emoji="🥗"
          title={`${foodM}-day logging streak!`}
          text={`You've logged your food ${foodM} days straight. Awareness is the first step to change.`}
        />
      )}
      <Card className="space-y-4 border-zinc-700/70 bg-gradient-to-b from-zinc-900 to-zinc-900/40">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-zinc-400">💪 Training streak</div>
            <div className="mt-1 text-4xl font-bold leading-none tabular-nums">
              <CountUp value={ws.current} duration={500} />
              <span className="ml-1 text-base font-medium text-zinc-500">{ws.current === 1 ? "week" : "weeks"}</span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">
              {nextWeek ? `${nextWeek - ws.current} to the ${nextWeek}-week badge` : `best ${ws.longest}`}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-400">🍽️ Logging streak</div>
            <div className="mt-1 text-4xl font-bold leading-none tabular-nums">
              <CountUp value={fs.current} duration={500} />
              <span className="ml-1 text-base font-medium text-zinc-500">{fs.current === 1 ? "day" : "days"}</span>
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">
              {nextFood ? `${nextFood - fs.current} to the ${nextFood}-day badge` : `best ${fs.longest}`}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-zinc-400">This week</span>
            <span className={cn(left === 0 ? "text-emerald-300" : "text-zinc-500")}>
              {left === 0
                ? `✓ ${ws.thisWeek} active days — week goal hit`
                : `${ws.thisWeek} of ${WEEKLY_TARGET} active days · ${left} to go`}
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {week.map((d) => (
              <div key={d.date} className="space-y-1 text-center">
                <div
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-lg text-sm",
                    d.future ? "bg-zinc-900/40" : d.active ? "bg-emerald-500/80" : "bg-zinc-800/70",
                    d.date === today && "ring-2 ring-zinc-200/70",
                  )}
                >
                  {d.logged && !d.future ? <span className="text-[11px]">🍽️</span> : null}
                </div>
                <div className="text-[10px] text-zinc-500">{format(parseISO(d.date), "EEEEE")}</div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-zinc-600">Green = trained (logged sets or 15+ min Garmin activity) · 🍽️ = food logged</p>
        </div>

        <Link href="/log" transitionTypes={["nav-forward"]} className={buttonClass("primary", "lg", "w-full")}>
          <DumbbellIcon className="h-5 w-5" />
          {active ? "Continue workout" : "Start workout"}
        </Link>
        {active && (
          <p className="-mt-1 text-center text-xs text-zinc-500">
            {active.name} · {active.count} exercise{active.count === 1 ? "" : "s"} in progress
          </p>
        )}
      </Card>
    </div>
  );
}
