/**
 * Several devices can report the same thing (Garmin, an Oura Ring, Apple
 * Health). Each device's numbers are stored on their own (source_daily, raw
 * rows keyed "oura-…" / "apple-…"), and the user picks which device to use
 * for what. For every day the chosen device is used; if it has nothing for
 * that day, the next one in line fills in.
 *
 * garmin_daily (read across the app) is the result. resolveDays() rebuilds it
 * after every sync, upload, disconnect or preference change.
 */
import { and, between, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { garminActivities, garminDaily, sourceDaily, sourcePrefs } from "@/db/schema";

export * from "@/lib/sources-shared";
import { DEFAULT_PREFS, isPref, orderFor, sourceOfKey, type Category, type Device, type Prefs } from "@/lib/sources-shared";

export async function getPrefs(userId: string): Promise<Prefs> {
  const [row] = await db.select().from(sourcePrefs).where(eq(sourcePrefs.userId, userId)).limit(1);
  if (!row) return { ...DEFAULT_PREFS };
  return {
    sleep: isPref(row.sleep) ? row.sleep : "auto",
    recovery: isPref(row.recovery) ? row.recovery : "auto",
    activity: isPref(row.activity) ? row.activity : "auto",
    workouts: isPref(row.workouts) ? row.workouts : "auto",
  };
}

export async function savePrefs(userId: string, prefs: Prefs) {
  await db
    .insert(sourcePrefs)
    .values({ userId, ...prefs, updatedAt: new Date() })
    .onConflictDoUpdate({ target: sourcePrefs.userId, set: { ...prefs, updatedAt: new Date() } });
}

/* ------------------------------------------------------------------ */

type DailyRow = typeof sourceDaily.$inferSelect;
const FIELDS: Record<Category | "garminOnly", (keyof DailyRow)[]> = {
  activity: ["totalKcal", "activeKcal", "bmrKcal", "consumedKcal", "steps", "intensityMinutes"],
  sleep: ["sleepSeconds", "sleepScore"],
  recovery: ["restingHr", "hrvLastNight", "hrvWeeklyAvg", "hrvStatus"],
  workouts: [],
  // Only Garmin measures these; taken from Garmin whatever the preference.
  garminOnly: ["stressAvg", "bodyBatteryHigh", "bodyBatteryLow", "bodyBatteryCharged", "bodyBatteryDrained"],
};

const hasAny = (r: DailyRow | undefined, fields: (keyof DailyRow)[]) => !!r && fields.some((f) => r[f] != null);

/** Data rows per day → the merged row for that day. Exported for tests. */
export function mergeDay(rows: DailyRow[], prefs: Prefs) {
  const by = new Map(rows.map((r) => [r.source as Device, r]));
  const out: Record<string, unknown> = {};
  let activitySource: Device | null = null;
  for (const cat of ["activity", "sleep", "recovery"] as const) {
    const fields = FIELDS[cat];
    const src = orderFor(prefs, cat).find((d) => hasAny(by.get(d), fields));
    for (const f of fields) out[f] = src ? (by.get(src)![f] ?? null) : null;
    if (cat === "activity") activitySource = src ?? null;
  }
  const g = by.get("garmin");
  for (const f of FIELDS.garminOnly) out[f] = g ? (g[f] ?? null) : null;
  const source = activitySource ?? orderFor(prefs, "sleep").find((d) => by.has(d)) ?? rows[0]?.source ?? "garmin";
  return { ...out, source };
}

/**
 * Rebuilds garmin_daily (and which activities count) for a user from every
 * device's rows, following their preferences. With no range, every day.
 */
export async function resolveDays(userId: string, range?: { from: string; to: string }) {
  const prefs = await getPrefs(userId);
  const inRange = (col: typeof sourceDaily.date | typeof garminDaily.date | typeof garminActivities.date) =>
    range ? between(col, range.from, range.to) : undefined;

  const rows = await db
    .select()
    .from(sourceDaily)
    .where(and(eq(sourceDaily.userId, userId), inRange(sourceDaily.date)));
  const byDate = new Map<string, DailyRow[]>();
  for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);

  const now = new Date();
  const merged = [...byDate.entries()].map(([date, rs]) => ({ userId, date, ...mergeDay(rs, prefs), updatedAt: now }));
  for (let i = 0; i < merged.length; i += 100) {
    const part = merged.slice(i, i + 100);
    const ex = (c: string) => sql.raw(`excluded.${c}`);
    await db
      .insert(garminDaily)
      .values(part as (typeof garminDaily.$inferInsert)[])
      .onConflictDoUpdate({
        target: [garminDaily.userId, garminDaily.date],
        set: {
          totalKcal: ex("total_kcal"),
          activeKcal: ex("active_kcal"),
          bmrKcal: ex("bmr_kcal"),
          consumedKcal: ex("consumed_kcal"),
          steps: ex("steps"),
          intensityMinutes: ex("intensity_minutes"),
          restingHr: ex("resting_hr"),
          stressAvg: ex("stress_avg"),
          bodyBatteryHigh: ex("body_battery_high"),
          bodyBatteryLow: ex("body_battery_low"),
          bodyBatteryCharged: ex("body_battery_charged"),
          bodyBatteryDrained: ex("body_battery_drained"),
          sleepSeconds: ex("sleep_seconds"),
          sleepScore: ex("sleep_score"),
          hrvLastNight: ex("hrv_last_night"),
          hrvWeeklyAvg: ex("hrv_weekly_avg"),
          hrvStatus: ex("hrv_status"),
          source: ex("source"),
          updatedAt: now,
        },
      });
  }
  // Days no device has any more (e.g. after a disconnect) disappear.
  const existing = await db
    .select({ date: garminDaily.date })
    .from(garminDaily)
    .where(and(eq(garminDaily.userId, userId), inRange(garminDaily.date)));
  const gone = existing.map((e) => e.date).filter((d) => !byDate.has(d));
  for (let i = 0; i < gone.length; i += 200) {
    await db.delete(garminDaily).where(and(eq(garminDaily.userId, userId), inArray(garminDaily.date, gone.slice(i, i + 200))));
  }

  await resolveActivities(userId, prefs, range);
}

/**
 * Workouts: per day, only the preferred device's activities count (so a run
 * recorded by both a watch and the ring isn't counted twice). Spreadsheet
 * imports always count.
 */
async function resolveActivities(userId: string, prefs: Prefs, range?: { from: string; to: string }) {
  const acts = await db
    .select({ id: garminActivities.id, activityId: garminActivities.activityId, date: garminActivities.date, excluded: garminActivities.excluded })
    .from(garminActivities)
    .where(and(eq(garminActivities.userId, userId), range ? between(garminActivities.date, range.from, range.to) : undefined));
  const order = orderFor(prefs, "workouts");
  const devicesByDay = new Map<string, Set<Device>>();
  for (const a of acts) {
    const s = sourceOfKey(a.activityId);
    if (s === "sheet") continue;
    devicesByDay.set(a.date, (devicesByDay.get(a.date) ?? new Set()).add(s));
  }
  const show: number[] = [];
  const hide: number[] = [];
  for (const a of acts) {
    const s = sourceOfKey(a.activityId);
    const keep = s === "sheet" || order.find((d) => devicesByDay.get(a.date)?.has(d)) === s;
    if (keep && a.excluded) show.push(a.id);
    if (!keep && !a.excluded) hide.push(a.id);
  }
  for (const [ids, excluded] of [
    [show, false],
    [hide, true],
  ] as const) {
    for (let i = 0; i < ids.length; i += 200) {
      await db.update(garminActivities).set({ excluded }).where(inArray(garminActivities.id, ids.slice(i, i + 200)));
    }
  }
}

