"use client";

import { addDays, format, parseISO, startOfWeek } from "date-fns";
import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
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
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const today = mounted ? todayStr() : null;

  const data = useMemo(() => {
    if (!today) return null;
    const ws = weekStreak(byDate, today);
    const fs = foodStreak(byDate, today);
    const weekStart = startOfWeek(parseISO(today), { weekStartsOn: 1 });
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = ds(addDays(weekStart, i));
      return {
        date,
        active: isActiveDay(byDate.get(date)),
        logged: isLoggedDay(byDate.get(date)),
        future: date > today,
      };
    });
    // Streak start dates make each celebration unique to that streak.
    const foodStart = ds(
      addDays(
        parseISO(today),
        -(fs.current - (isLoggedDay(byDate.get(today)) ? 1 : 0)),
      ),
    );
    const weekStartStreak = ds(
      addDays(
        weekStart,
        -7 * Math.max(0, ws.current - (ws.thisWeek >= WEEKLY_TARGET ? 1 : 0)),
      ),
    );
    return { ws, fs, week, foodStart, weekStartStreak };
  }, [byDate, today]);

  if (!data)
    return (
      <div className="h-56 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />
    );
  const { ws, fs, week } = data;
  const foodM = milestoneReached(fs.current, FOOD_MILESTONES);
  const weekM = milestoneReached(ws.current, WEEK_MILESTONES);
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
      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="font-semibold">This week</div>
          <div
            className={cn(
              "text-sm",
              left === 0 ? "text-teal-300" : "text-zinc-400",
            )}
          >
            {left === 0
              ? `✓ ${ws.thisWeek} workouts — goal hit`
              : `${ws.thisWeek} of ${WEEKLY_TARGET} workouts`}
          </div>
        </div>

        {/* Two simple rows: did I train? did I log food? */}
        <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] items-center gap-y-2.5 text-center">
          <span />
          {week.map((d) => (
            <span
              key={d.date}
              className={cn(
                "text-[11px]",
                d.date === today ? "font-bold text-zinc-50" : "text-zinc-500",
              )}
            >
              {format(parseISO(d.date), "EEEEE")}
            </span>
          ))}
          <span className="text-left text-xs text-zinc-300">Exercise</span>
          {week.map((d) => (
            <Dot
              key={d.date}
              on={d.active}
              future={d.future}
              today={d.date === today}
              color="bg-teal-400"
            />
          ))}
          <span className="text-left text-xs text-zinc-300">Food</span>
          {week.map((d) => (
            <Dot
              key={d.date}
              on={d.logged}
              future={d.future}
              today={d.date === today}
              color="bg-sky-400"
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-zinc-300">
            🔥 <b className="text-zinc-50">{ws.current}</b> week
            {ws.current === 1 ? "" : "s"} training streak
          </span>
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-zinc-300">
            🥗 <b className="text-zinc-50">{fs.current}</b> day
            {fs.current === 1 ? "" : "s"} logging food
          </span>
        </div>

        <Link
          href="/log"
          transitionTypes={["nav-forward"]}
          className={buttonClass("primary", "lg", "w-full")}
        >
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
    </div>
  );
}

function Dot({
  on,
  future,
  today,
  color,
}: {
  on: boolean;
  future: boolean;
  today: boolean;
  color: string;
}) {
  return (
    <span className="flex justify-center">
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
          future
            ? "border border-dashed border-zinc-700"
            : on
              ? cn(color, "text-zinc-950")
              : "border border-zinc-700",
          today && !on && "border-zinc-300",
        )}
      >
        {on && !future ? "✓" : ""}
      </span>
    </span>
  );
}
