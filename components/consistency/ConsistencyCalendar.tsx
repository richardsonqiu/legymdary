"use client";

import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Segmented } from "@/components/charts/common";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { Card } from "@/components/ui";
import type { ConsistencyDay } from "@/lib/queries";
import { isActiveDay, isLoggedDay } from "@/lib/streaks";
import { cn, todayStr } from "@/lib/utils";

type Layer = "both" | "exercise" | "food";
type View = "week" | "month" | "year";
const ds = (d: Date) => format(d, "yyyy-MM-dd");
const noop = () => () => {};

/** 0–4 exercise intensity from logged sets + Garmin minutes. */
function exLevel(d?: ConsistencyDay) {
  if (!isActiveDay(d)) return 0;
  const score = d!.sets + d!.garminMin / 6;
  return score >= 25 ? 4 : score >= 15 ? 3 : score >= 8 ? 2 : 1;
}
/** 0 none · 1 some meals · 2 three or more meals. */
const foodLevel = (d?: ConsistencyDay) => (!isLoggedDay(d) ? 0 : d!.meals >= 3 ? 2 : 1);

const EX = ["bg-zinc-800/80", "bg-emerald-900", "bg-emerald-700", "bg-emerald-500", "bg-emerald-300"];
const FOOD = ["bg-zinc-800/80", "bg-sky-800", "bg-sky-400"];

function Cell({ d, layer, future, size = "sm" }: { d?: ConsistencyDay; layer: Layer; future: boolean; size?: "sm" | "lg" }) {
  const ex = exLevel(d);
  const fd = foodLevel(d);
  const base = size === "sm" ? "h-3 w-3 rounded-[3px]" : "h-full w-full rounded-lg";
  if (future) return <div className={cn(base, "bg-zinc-900/40")} />;
  if (layer === "food") return <div className={cn(base, FOOD[fd])} />;
  if (layer === "exercise") return <div className={cn(base, EX[ex])} />;
  // Both: exercise fill + a food dot.
  return (
    <div className={cn(base, EX[ex], "relative")}>
      {fd > 0 && (
        <span
          className={cn(
            "absolute rounded-full",
            fd === 2 ? "bg-sky-300" : "bg-sky-600",
            size === "sm" ? "bottom-[1px] right-[1px] h-[5px] w-[5px]" : "bottom-1.5 right-1.5 h-2 w-2",
          )}
        />
      )}
    </div>
  );
}

function tip(d: ConsistencyDay | undefined, date: string) {
  const parts = [format(parseISO(date), "EEE d MMM")];
  if (!d) return `${parts[0]}: nothing logged`;
  if (d.sets) parts.push(`${d.sets} sets`);
  if (d.garmin) parts.push(`${d.garmin} activit${d.garmin > 1 ? "ies" : "y"} (${d.garminMin} min)`);
  if (d.meals) parts.push(`${d.meals} meal${d.meals > 1 ? "s" : ""} · ${d.kcal} kcal`);
  return parts.join(" · ");
}

export function ConsistencyCalendar({ days }: { days: ConsistencyDay[] }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [layer, setLayer] = useState<Layer>("both");
  const [view, setView] = useState<View>("month");
  const [month, setMonth] = useState<string | null>(null);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = mounted ? todayStr() : null;

  useEffect(() => {
    if (view === "year" && scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [view, mounted]);

  if (!today) return <div className="h-64 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />;
  const monthStart = month ?? ds(startOfMonth(parseISO(today)));

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          options={[
            { label: "Week", value: "week" },
            { label: "Month", value: "month" },
            { label: "Year", value: "year" },
          ]}
          value={view}
          onChange={(v) => setView(v as View)}
        />
        <Segmented
          options={[
            { label: "Both", value: "both" },
            { label: "Exercise", value: "exercise" },
            { label: "Food", value: "food" },
          ]}
          value={layer}
          onChange={(v) => setLayer(v as Layer)}
        />
      </div>

      {view === "week" && <WeekView byDate={byDate} today={today} layer={layer} />}
      {view === "month" && (
        <MonthView byDate={byDate} today={today} layer={layer} monthStart={monthStart} setMonth={setMonth} />
      )}
      {view === "year" && (
        <div ref={scrollRef} className="-mx-1 overflow-x-auto px-1 pb-1">
          <YearGrid byDate={byDate} today={today} layer={layer} />
        </div>
      )}

      <Legend layer={layer} />
    </Card>
  );
}

function WeekView({ byDate, today, layer }: { byDate: Map<string, ConsistencyDay>; today: string; layer: Layer }) {
  const start = startOfWeek(parseISO(today), { weekStartsOn: 1 });
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 7 }, (_, i) => {
        const date = ds(addDays(start, i));
        const d = byDate.get(date);
        const future = date > today;
        return (
          <div key={date} className="space-y-1 text-center" title={tip(d, date)}>
            <div className={cn("text-[10px] uppercase", date === today ? "font-semibold text-zinc-100" : "text-zinc-500")}>
              {format(parseISO(date), "EEEEE")}
            </div>
            <div className="aspect-square">
              <Cell d={d} layer={layer} future={future} size="lg" />
            </div>
            <div className="text-[10px] leading-tight text-zinc-500">
              {future ? "" : isActiveDay(d) ? "💪" : ""}
              {future ? "" : isLoggedDay(d) ? "🍽️" : ""}
              {!future && !isActiveDay(d) && !isLoggedDay(d) ? "–" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  byDate,
  today,
  layer,
  monthStart,
  setMonth,
}: {
  byDate: Map<string, ConsistencyDay>;
  today: string;
  layer: Layer;
  monthStart: string;
  setMonth: (m: string) => void;
}) {
  const ms = parseISO(monthStart);
  const gridStart = startOfWeek(ms, { weekStartsOn: 1 });
  const me = endOfMonth(ms);
  const cells: string[] = [];
  for (let d = gridStart; d <= me || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(ds(d));
  const inMonth = (s: string) => s.slice(0, 7) === monthStart.slice(0, 7);
  const monthDays = cells.filter((c) => inMonth(c) && c <= today);
  const active = monthDays.filter((c) => isActiveDay(byDate.get(c))).length;
  const logged = monthDays.filter((c) => isLoggedDay(byDate.get(c))).length;
  const canNext = ds(addMonths(ms, 1)) <= today;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setMonth(ds(addMonths(ms, -1)))}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800"
          aria-label="Previous month"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="text-center">
          <div className="text-sm font-medium">{format(ms, "MMMM yyyy")}</div>
          <div className="text-[11px] text-zinc-500">
            {active} active day{active === 1 ? "" : "s"} · {logged} day{logged === 1 ? "" : "s"} with food logged
          </div>
        </div>
        <button
          onClick={() => canNext && setMonth(ds(addMonths(ms, 1)))}
          disabled={!canNext}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-600">
        {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const d = byDate.get(c);
          const out = !inMonth(c);
          return (
            <div key={c} title={tip(d, c)} className={cn("relative aspect-square", out && "opacity-25")}>
              <Cell d={d} layer={layer} future={c > today} size="lg" />
              <span
                className={cn(
                  "pointer-events-none absolute left-1.5 top-1 text-[10px] tabular-nums",
                  c === today ? "font-bold text-white" : exLevel(d) >= 3 && layer !== "food" ? "text-zinc-950/70" : "text-zinc-400",
                )}
              >
                {Number(c.slice(8))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearGrid({ byDate, today, layer }: { byDate: Map<string, ConsistencyDay>; today: string; layer: Layer }) {
  const end = addDays(startOfWeek(parseISO(today), { weekStartsOn: 1 }), 6);
  const start = startOfWeek(addDays(parseISO(today), -7 * 52), { weekStartsOn: 1 });
  const weeks: string[][] = [];
  for (let w = start; w <= end; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => ds(addDays(w, i))));
  const yearDays = weeks.flat().filter((d) => d <= today);
  const active = yearDays.filter((d) => isActiveDay(byDate.get(d))).length;
  const logged = yearDays.filter((d) => isLoggedDay(byDate.get(d))).length;
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-zinc-500">
        Last 12 months: {active} active days · {logged} days with food logged
      </div>
      <div className="flex gap-[3px]">
        {weeks.map((wk, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            <div className="h-3 text-[9px] leading-3 text-zinc-600">
              {wk[0].slice(8) <= "07" ? format(parseISO(wk[0]), "MMM") : ""}
            </div>
            {wk.map((d) => (
              <div key={d} title={tip(byDate.get(d), d)}>
                <Cell d={byDate.get(d)} layer={layer} future={d > today} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Legend({ layer }: { layer: Layer }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
      {layer !== "food" && (
        <span className="flex items-center gap-1">
          Exercise: less
          {EX.slice(1).map((c) => (
            <span key={c} className={cn("h-2.5 w-2.5 rounded-[3px]", c)} />
          ))}
          more
        </span>
      )}
      {layer === "food" && (
        <span className="flex items-center gap-1">
          Food: <span className={cn("h-2.5 w-2.5 rounded-[3px]", FOOD[1])} /> some meals
          <span className={cn("ml-1 h-2.5 w-2.5 rounded-[3px]", FOOD[2])} /> 3+ meals
        </span>
      )}
      {layer === "both" && (
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-sky-300" /> food logged
        </span>
      )}
    </div>
  );
}
