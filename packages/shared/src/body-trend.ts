import { weightTrendPerWeek } from "./nutrition";
import { addDaysStr, daysBetween } from "./utils";

/** Body measurements the Progress screens chart. */
export type BodyMetric = "weight" | "waist" | "bodyFat";

export const BODY_METRICS: { label: string; value: BodyMetric; unit: string }[] = [
  { label: "Weight", value: "weight", unit: "kg" },
  { label: "Waist", value: "waist", unit: "cm" },
  { label: "Body fat", value: "bodyFat", unit: "%" },
];

/** Range choices in days; 0 means everything. */
export const BODY_RANGES: { label: string; value: number }[] = [
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: 0 },
];

type Row = { date: string } & Partial<Record<BodyMetric, number | null>>;

/** Dated values of one metric within the last `range` days of `today`, oldest first as given. */
export function bodyStatPoints(data: Row[], metric: BodyMetric, range: number, today: string): { date: string; value: number }[] {
  const min = range > 0 ? addDaysStr(today, -range) : "0000-00-00";
  return data.filter((d) => d.date >= min && d[metric] != null).map((d) => ({ date: d.date, value: d[metric] as number }));
}

/** Change from the first to the last point, or null when there are none. */
export function pointsDelta(points: { value: number }[]): number | null {
  return points.length > 0 ? points[points.length - 1].value - points[0].value : null;
}

/** Weight change in kg per week over the last 28 days of weigh-ins (needs 3+), as the Goal page shows. */
export function recentWeightTrend(weights: { date: string; weight: number }[], today: string): number | null {
  const recent = weights.filter((w) => w.date >= addDaysStr(today, -28));
  return weightTrendPerWeek(recent.map((w) => ({ day: daysBetween(recent[0].date, w.date), weight: w.weight })));
}
