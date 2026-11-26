import { addDays, format, parseISO, startOfWeek } from "date-fns";

export type ConsistencyDay = {
  date: string;
  sets: number; // working sets logged in the app
  garmin: number; // Garmin activities
  garminMin: number; // their total minutes
  meals: number;
  /** Meals marked as skipped. */
  skipped: number;
  kcal: number;
};

/** Pure streak + milestone logic for the consistency calendar (client-safe). */

export const WEEKLY_TARGET = 3; // active days per week
export const FOOD_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
export const WEEK_MILESTONES = [2, 4, 8, 12, 16, 26, 52];

export const isActiveDay = (d?: ConsistencyDay) => !!d && (d.sets > 0 || d.garminMin >= 15);
export const isLoggedDay = (d?: ConsistencyDay) => !!d && (d.meals > 0 || d.skipped > 0);

const ds = (d: Date) => format(d, "yyyy-MM-dd");
const weekStart = (s: string) => ds(startOfWeek(parseISO(s), { weekStartsOn: 1 }));

/** Consecutive days with food logged; today doesn't break it until it's over. */
export function foodStreak(byDate: Map<string, ConsistencyDay>, today: string) {
  let cur = 0;
  let d = parseISO(today);
  if (!isLoggedDay(byDate.get(today))) d = addDays(d, -1);
  while (isLoggedDay(byDate.get(ds(d)))) {
    cur++;
    d = addDays(d, -1);
  }
  let longest = 0;
  let run = 0;
  const dates = [...byDate.keys()].sort();
  if (dates.length) {
    for (let x = parseISO(dates[0]); ds(x) <= today; x = addDays(x, 1)) {
      run = isLoggedDay(byDate.get(ds(x))) ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  return { current: cur, longest: Math.max(longest, cur) };
}

/** Active days in the week containing `date`. */
export function activeDaysInWeek(byDate: Map<string, ConsistencyDay>, date: string) {
  const start = parseISO(weekStart(date));
  let n = 0;
  for (let i = 0; i < 7; i++) if (isActiveDay(byDate.get(ds(addDays(start, i))))) n++;
  return n;
}

/** Consecutive weeks hitting the weekly target; the current week counts once met. */
export function weekStreak(byDate: Map<string, ConsistencyDay>, today: string) {
  let w = parseISO(weekStart(today));
  let cur = 0;
  if (activeDaysInWeek(byDate, ds(w)) >= WEEKLY_TARGET) cur = 1;
  w = addDays(w, -7);
  while (activeDaysInWeek(byDate, ds(w)) >= WEEKLY_TARGET) {
    cur++;
    w = addDays(w, -7);
  }
  let longest = 0;
  let run = 0;
  const dates = [...byDate.keys()].sort();
  if (dates.length) {
    for (let x = parseISO(weekStart(dates[0])); ds(x) <= today; x = addDays(x, 7)) {
      run = activeDaysInWeek(byDate, ds(x)) >= WEEKLY_TARGET ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
  }
  return { current: cur, longest: Math.max(longest, cur), thisWeek: activeDaysInWeek(byDate, today) };
}

/** Highest milestone reached by `value`, if any. */
export const milestoneReached = (value: number, list: number[]) =>
  [...list].reverse().find((m) => value >= m) ?? null;
export const nextMilestone = (value: number, list: number[]) => list.find((m) => m > value) ?? null;
