/**
 * Pure helpers for "which device for what" (safe for client components).
 * Server-side storage and resolving live in lib/sources.ts.
 */

export const DEVICES = ["garmin", "oura", "apple"] as const;
export type Device = (typeof DEVICES)[number];
export const CATEGORIES = ["sleep", "recovery", "activity", "workouts"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Prefs = Record<Category, Device | "auto">;

export const DEFAULT_PREFS: Prefs = { sleep: "auto", recovery: "auto", activity: "auto", workouts: "auto" };

export const DEVICE_LABEL: Record<Device, string> = { garmin: "Garmin", oura: "Oura", apple: "Apple Health" };
export const CATEGORY_INFO: Record<Category, { label: string; covers: string }> = {
  sleep: { label: "Sleep", covers: "Time asleep, stages, sleep score, overnight heart rate and breathing" },
  recovery: { label: "Recovery", covers: "HRV and resting heart rate (readiness uses these)" },
  activity: { label: "Daily activity", covers: "Steps and calories burned (Food and your plan use these)" },
  workouts: { label: "Workouts", covers: "Runs, rides, classes and other activities" },
};

/** Device behind a raw row / activity id: "apple-…", "oura-…", "sheet-…", else Garmin. */
export function sourceOfKey(key: string | null | undefined): Device | "sheet" {
  if (!key) return "garmin";
  if (key.startsWith("oura-")) return "oura";
  if (key.startsWith("apple-")) return "apple";
  if (key.startsWith("sheet-")) return "sheet";
  return "garmin";
}

/** Devices in the order to try them for a category. */
export function orderFor(prefs: Prefs, cat: Category): Device[] {
  const first = prefs[cat];
  const base: Device[] = ["garmin", "oura", "apple"];
  return first === "auto" ? base : [first, ...base.filter((d) => d !== first)];
}

export const isPref = (v: unknown): v is Device | "auto" => v === "auto" || (DEVICES as readonly string[]).includes(v as string);

export function cleanPrefs(input: unknown): Prefs {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    sleep: isPref(o.sleep) ? o.sleep : "auto",
    recovery: isPref(o.recovery) ? o.recovery : "auto",
    activity: isPref(o.activity) ? o.activity : "auto",
    workouts: isPref(o.workouts) ? o.workouts : "auto",
  };
}

/** For raw rows: of the payloads for one day, the one from the preferred device. */
export function pickBySource<T extends { key: string | null }>(rows: T[], order: Device[]): T | null {
  for (const d of order) {
    const hit = rows.find((r) => sourceOfKey(r.key) === d);
    if (hit) return hit;
  }
  return rows[0] ?? null;
}

/** Activities for one day from the preferred device (spreadsheet imports always kept). */
export function pickActivities<T extends { key: string | null }>(rows: T[], order: Device[]): T[] {
  const device = order.find((d) => rows.some((r) => sourceOfKey(r.key) === d));
  return rows.filter((r) => {
    const s = sourceOfKey(r.key);
    return s === "sheet" || s === device;
  });
}
