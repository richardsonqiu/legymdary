"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { useMemo, useState } from "react";
import { WorkoutSummary } from "@/components/WorkoutSummary";
import { ChevronLeftIcon, ChevronRightIcon, FlameIcon } from "@/components/icons";
import { Card } from "@/components/ui";
import type { WorkoutDetail } from "@/lib/queries";
import { calcStreaks, cn, toDateStr } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function HistoryCalendar({ workouts }: { workouts: WorkoutDetail[] }) {
  const byDate = useMemo(() => {
    const map = new Map<string, WorkoutDetail[]>();
    for (const w of workouts) {
      const list = map.get(w.date) ?? [];
      list.push(w);
      map.set(w.date, list);
    }
    return map;
  }, [workouts]);

  const { current, longest } = useMemo(() => {
    const days = workouts
      .filter((w) => w.exercises.some((e) => e.sets.length > 0))
      .map((w) => w.date);
    return calcStreaks(days);
  }, [workouts]);

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(
    workouts[0]?.date ?? null,
  );

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const selectedWorkouts = selected ? (byDate.get(selected) ?? []) : [];

  return (
    <div className="space-y-5">
      {/* Streaks */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-500">
            <FlameIcon className="h-4 w-4" /> Current streak
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {current}
            <span className="ml-1 text-sm font-medium text-zinc-500">
              {current === 1 ? "day" : "days"}
            </span>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Longest streak
          </div>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {longest}
            <span className="ml-1 text-sm font-medium text-zinc-500">
              {longest === 1 ? "day" : "days"}
            </span>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setCursor((c) => addMonths(c, -1))}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div className="text-sm font-semibold">
            {format(cursor, "MMMM yyyy")}
          </div>
          <button
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-1 grid grid-cols-7">
          {WEEKDAYS.map((d, i) => (
            <div
              key={i}
              className="py-1 text-center text-[11px] font-medium text-zinc-600"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const ds = toDateStr(day);
            const inMonth = isSameMonth(day, cursor);
            const hasWorkout = byDate.has(ds);
            const isSel = selected === ds;
            const today = isToday(day);
            return (
              <button
                key={ds}
                onClick={() => hasWorkout && setSelected(ds)}
                disabled={!hasWorkout}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-full text-sm tabular-nums transition-colors",
                  hasWorkout
                    ? "cursor-pointer font-semibold"
                    : "cursor-default",
                  isSel
                    ? "bg-white text-zinc-950 ring-2 ring-zinc-500"
                    : hasWorkout
                      ? "bg-zinc-100 text-zinc-950 hover:bg-white"
                      : inMonth
                        ? "text-zinc-400"
                        : "text-zinc-700",
                  today && !hasWorkout && "ring-1 ring-inset ring-zinc-600",
                )}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selected day */}
      {selectedWorkouts.length > 0 ? (
        <div className="space-y-3">
          {selectedWorkouts.map((w) => (
            <Card key={w.id}>
              <WorkoutSummary workout={w} />
            </Card>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
          Tap a highlighted day to see that session.
        </p>
      )}
    </div>
  );
}
