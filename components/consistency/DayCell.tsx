import { type ConsistencyDay, isActiveDay, isLoggedDay } from "@legymdary/shared";
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

/** One-line legend that matches DayCell. */
export function DayLegend({ layer = "both" }: { layer?: Layer }) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-400">
      {layer === "both" ? (
        <>
          <span className="inline-flex h-4 w-4 flex-col overflow-hidden rounded-[4px]">
            <span className="flex-1 bg-emerald-500" />
            <span className="flex-1 bg-sky-500" />
          </span>
          Top half = exercise · bottom half = food logged
        </>
      ) : (
        <>
          <span className={cn("inline-block h-4 w-4 rounded-[4px]", layer === "exercise" ? EX[3] : FOOD[2])} />
          {layer === "exercise" ? "Trained" : "Food logged"} · brighter = more
        </>
      )}
    </div>
  );
}
