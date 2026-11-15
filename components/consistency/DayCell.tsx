import type { ConsistencyDay } from "@/lib/queries";
import { isActiveDay, isLoggedDay } from "@/lib/streaks";
import { cn } from "@/lib/utils";

export type Layer = "both" | "exercise" | "food";

/** 0–4 exercise intensity from logged sets + Garmin minutes. */
export function exLevel(d?: ConsistencyDay) {
  if (!isActiveDay(d)) return 0;
  const score = d!.sets + d!.garminMin / 6;
  return score >= 25 ? 4 : score >= 15 ? 3 : score >= 8 ? 2 : 1;
}
/** 0 none · 1 some meals · 2 three or more meals. */
export const foodLevel = (d?: ConsistencyDay) => (!isLoggedDay(d) ? 0 : d!.meals >= 3 ? 2 : 1);

export const EX = ["bg-zinc-800", "bg-emerald-800", "bg-emerald-600", "bg-emerald-500", "bg-emerald-300"];
export const FOOD = ["bg-zinc-800", "bg-sky-800", "bg-sky-500"];
const EMPTY = "bg-zinc-800/70";
const FUTURE = "bg-zinc-900/50";

/**
 * One day, used everywhere (calendar, year grid, this-week strip):
 * top half = exercise (green), bottom half = food logged (blue).
 * With a single layer selected the whole cell shows that layer.
 */
export function DayCell({
  d,
  layer = "both",
  future = false,
  className,
  children,
}: {
  d?: ConsistencyDay;
  layer?: Layer;
  future?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  if (future) return <div className={cn("relative overflow-hidden", FUTURE, className)}>{children}</div>;
  const ex = exLevel(d);
  const fd = foodLevel(d);
  if (layer !== "both") {
    const cls = layer === "exercise" ? (ex ? EX[ex] : EMPTY) : fd ? FOOD[fd] : EMPTY;
    return <div className={cn("relative overflow-hidden", cls, className)}>{children}</div>;
  }
  return (
    <div className={cn("relative flex flex-col overflow-hidden", className)}>
      <div className={cn("flex-1", ex ? EX[ex] : EMPTY)} />
      <div className={cn("flex-1", fd ? FOOD[fd] : EMPTY, "border-t border-zinc-950/40")} />
      {children && <div className="absolute inset-0">{children}</div>}
    </div>
  );
}

/** Legend that matches DayCell exactly. */
export function DayLegend({ layer = "both" }: { layer?: Layer }) {
  const sw = "inline-block h-3 w-3 rounded-[3px]";
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-zinc-400">
      {layer === "both" && (
        <span className="flex items-center gap-1.5">
          <span className="inline-flex h-4 w-4 flex-col overflow-hidden rounded-[3px]">
            <span className="flex-1 bg-emerald-500" />
            <span className="flex-1 bg-sky-500" />
          </span>
          top = exercise · bottom = food
        </span>
      )}
      {layer !== "food" && (
        <span className="flex items-center gap-1">
          Exercise
          {EX.slice(1).map((c) => (
            <span key={c} className={cn(sw, c)} />
          ))}
          <span className="text-zinc-500">more</span>
        </span>
      )}
      {layer !== "exercise" && (
        <span className="flex items-center gap-1">
          Food
          <span className={cn(sw, FOOD[1])} />
          <span className="text-zinc-500">1–2 meals</span>
          <span className={cn(sw, FOOD[2])} />
          <span className="text-zinc-500">3+</span>
        </span>
      )}
    </div>
  );
}
