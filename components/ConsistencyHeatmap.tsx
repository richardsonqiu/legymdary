"use client";

import {
  addDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";
import { useEffect, useMemo, useRef } from "react";
import type { WorkoutDetail } from "@/lib/queries";
import { cn, formatMedium, todayStr } from "@/lib/utils";

// Brightness ramps up with training volume — the monochrome answer to GitHub green.
const LEVELS = [
  "bg-zinc-800/70",
  "bg-zinc-600",
  "bg-zinc-400",
  "bg-zinc-200",
  "bg-zinc-50",
];

function level(sets: number): number {
  if (sets <= 0) return 0;
  if (sets <= 5) return 1;
  if (sets <= 10) return 2;
  if (sets <= 15) return 3;
  return 4;
}

const WEEKS = 53;
const DOW_LABELS = ["", "M", "", "W", "", "F", ""];

export function ConsistencyHeatmap({
  workouts,
}: {
  workouts: WorkoutDetail[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { weeks, monthLabels, totalDays, totalSets } = useMemo(() => {
    const setsByDate = new Map<string, number>();
    for (const w of workouts) {
      setsByDate.set(w.date, (setsByDate.get(w.date) ?? 0) + w.totalSets);
    }

    const today = todayStr();
    const todayDate = parseISO(today);
    const end = endOfWeek(todayDate, { weekStartsOn: 1 });
    const start = startOfWeek(addDays(todayDate, -7 * (WEEKS - 1)), {
      weekStartsOn: 1,
    });
    const days = eachDayOfInterval({ start, end });

    const cells = days.map((d) => {
      const ds = format(d, "yyyy-MM-dd");
      const sets = setsByDate.get(ds) ?? 0;
      return { date: ds, sets, future: ds > today };
    });

    const weeks: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    let lastMonth = -1;
    const monthLabels = weeks.map((wk) => {
      const first = parseISO(wk[0].date);
      const m = first.getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        return format(first, "MMM");
      }
      return "";
    });

    let totalDays = 0;
    let totalSets = 0;
    for (const c of cells) {
      if (c.sets > 0) {
        totalDays += 1;
        totalSets += c.sets;
      }
    }

    return { weeks, monthLabels, totalDays, totalSets };
  }, [workouts]);

  // Start scrolled to the most recent weeks.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm text-zinc-300">
          <span className="font-semibold tabular-nums">{totalDays}</span> session
          {totalDays === 1 ? "" : "s"} in the last year
        </p>
        <p className="text-xs tabular-nums text-zinc-500">
          {totalSets} sets
        </p>
      </div>

      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div className="inline-block min-w-max">
          {/* Month labels */}
          <div className="mb-1 flex gap-1 pl-7">
            {monthLabels.map((m, i) => (
              <div
                key={i}
                className="relative h-3 w-3.5 text-[10px] leading-none text-zinc-500"
              >
                {m && (
                  <span className="absolute left-0 top-0 whitespace-nowrap">
                    {m}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Weekday labels + cells */}
          <div className="flex gap-1">
            <div className="flex w-6 flex-col gap-1 pr-1">
              {DOW_LABELS.map((l, i) => (
                <div
                  key={i}
                  className="flex h-3.5 items-center text-[9px] leading-none text-zinc-600"
                >
                  {l}
                </div>
              ))}
            </div>

            {weeks.map((wk, i) => (
              <div key={i} className="flex flex-col gap-1">
                {wk.map((cell) => (
                  <div
                    key={cell.date}
                    title={
                      cell.future
                        ? undefined
                        : `${cell.sets} set${cell.sets === 1 ? "" : "s"} · ${formatMedium(cell.date)}`
                    }
                    className={cn(
                      "h-3.5 w-3.5 rounded-[3px]",
                      cell.future ? "bg-transparent" : LEVELS[level(cell.sets)],
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-zinc-500">
        <span>Less</span>
        {LEVELS.map((c, i) => (
          <span key={i} className={cn("h-3 w-3 rounded-[3px]", c)} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
