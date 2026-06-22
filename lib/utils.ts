import { clsx, type ClassValue } from "clsx";
import {
  addDays,
  differenceInCalendarDays,
  format,
  parseISO,
  startOfWeek,
} from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Muscle groups and equipment used for tagging + filtering exercises. */
export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
] as const;

export const EQUIPMENT = [
  "Barbell",
  "Dumbbell",
  "Machine",
  "Bodyweight",
  "Cable",
] as const;

/* ------------------------------------------------------------------ */
/* Fitness math                                                        */
/* ------------------------------------------------------------------ */

/** Estimated one-rep max via the Epley formula: weight × (1 + reps / 30). */
export function estimate1RM(weight: number, reps: number): number {
  if (!weight || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

/** Volume of a single set = weight × reps. */
export function setVolume(weight: number, reps: number): number {
  return (weight || 0) * (reps || 0);
}

export function round(n: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Format a number compactly: thousands separators, at most 1 decimal. */
export function kg(n: number | null | undefined): string {
  if (n === null || n === undefined) return "–";
  return round(n, 1).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/* ------------------------------------------------------------------ */
/* Dates — workouts/body stats store calendar days as 'YYYY-MM-DD'      */
/* ------------------------------------------------------------------ */

export function todayStr(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function addDaysStr(s: string, n: number): string {
  return format(addDays(parseISO(s), n), "yyyy-MM-dd");
}

export function daysBetween(a: string, b: string): number {
  return differenceInCalendarDays(parseISO(b), parseISO(a));
}

export function startOfWeekStr(s: string = todayStr()): string {
  return format(startOfWeek(parseISO(s), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function formatPretty(s: string): string {
  return format(parseISO(s), "EEE, d MMM yyyy");
}

export function formatMedium(s: string): string {
  return format(parseISO(s), "d MMM yyyy");
}

export function formatShort(s: string): string {
  return format(parseISO(s), "d MMM");
}

/* ------------------------------------------------------------------ */
/* Streaks — consecutive calendar days with at least one workout       */
/* ------------------------------------------------------------------ */

export function calcStreaks(dateStrings: string[]): {
  current: number;
  longest: number;
} {
  const days = [...new Set(dateStrings)].sort();
  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (daysBetween(days[i - 1], days[i]) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  const present = new Set(days);
  const today = todayStr();
  // A workout today, or yesterday (grace so today's rest day doesn't reset it).
  let cursor = today;
  if (!present.has(cursor)) {
    cursor = addDaysStr(today, -1);
    if (!present.has(cursor)) return { current: 0, longest };
  }
  let current = 0;
  while (present.has(cursor)) {
    current += 1;
    cursor = addDaysStr(cursor, -1);
  }

  return { current, longest };
}
