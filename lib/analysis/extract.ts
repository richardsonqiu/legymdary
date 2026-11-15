import { and, between, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  bodyStats,
  garminDaily,
  garminRaw,
  meals,
  sets,
  workoutExercises,
  workouts,
} from "@/db/schema";
import { addDaysStr } from "@/lib/utils";

/**
 * Server-only. Flattens everything we know about each calendar day — Garmin
 * raw payloads (preferred), the typed garmin_daily fallback, and the app's
 * meals / workouts / body stats — into one DayRow per date.
 *
 * Garmin field paths are read defensively from several candidates because
 * payload shapes vary by device and API version; a missing field is null.
 */

export type DayRow = {
  date: string;
  // Sleep (Garmin dates a night by the morning you wake up)
  sleepSec: number | null;
  sleepScore: number | null;
  deepSec: number | null;
  remSec: number | null;
  lightSec: number | null;
  awakeSec: number | null;
  awakeCount: number | null;
  sleepNeedMin: number | null;
  bedtimeMin: number | null; // minutes from local midnight; evening times are negative (23:30 → -30)
  wakeMin: number | null;
  sleepRespiration: number | null;
  sleepSpo2Avg: number | null;
  sleepSpo2Low: number | null;
  sleepStress: number | null;
  sleepAvgHr: number | null;
  // HRV
  hrv: number | null;
  hrvWeekly: number | null;
  hrvStatus: string | null;
  hrvBalancedLow: number | null;
  hrvBalancedHigh: number | null;
  // Day
  rhr: number | null;
  stressAvg: number | null;
  highStressMin: number | null;
  bbHigh: number | null;
  bbLow: number | null;
  bbWake: number | null;
  steps: number | null;
  intensityMin: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  respirationAvg: number | null;
  // Training
  activities: { name: string; type: string | null; min: number; kcal: number | null; load: number | null; aerobicTE: number | null }[];
  cardioLoad: number | null; // Σ Garmin activityTrainingLoad, else HR-zone TRIMP
  strengthVolume: number; // app: Σ kg × reps over working sets
  strengthSets: number;
  vo2max: number | null;
  // Nutrition (app photo log)
  intakeKcal: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
  lastMealMin: number | null; // local minutes from midnight
  alcohol: boolean;
  // Body
  weight: number | null;
  bodyFat: number | null;
};

type Json = Record<string, unknown>;

/** First finite number found at any of the dot-paths. */
function num(o: unknown, ...paths: string[]): number | null {
  for (const p of paths) {
    let v: unknown = o;
    for (const k of p.split(".")) v = v && typeof v === "object" ? (v as Json)[k] : undefined;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}
function str(o: unknown, ...paths: string[]): string | null {
  for (const p of paths) {
    let v: unknown = o;
    for (const k of p.split(".")) v = v && typeof v === "object" ? (v as Json)[k] : undefined;
    if (typeof v === "string" && v) return v;
  }
  return null;
}
/** Minutes after local midnight from a Garmin "local" timestamp (epoch-ms-as-local or ISO without zone). */
function localMinutes(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
  if (typeof v === "string") {
    const m = /T?(\d{2}):(\d{2})/.exec(v.includes("T") ? v.split("T")[1] : v.split(" ")[1] ?? "");
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  return null;
}
/** Local-minus-GMT offset in minutes from a pair of Garmin timestamps. */
function offsetMinutes(local: unknown, gmt: unknown): number | null {
  const toMs = (v: unknown) =>
    typeof v === "number" ? v : typeof v === "string" ? Date.parse(v.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? "" : "Z")) : NaN;
  const a = toMs(local);
  const b = toMs(gmt);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((a - b) / 60_000) : null;
}

const ALCOHOL = /\b(beer|wine|whisk(e)?y|vodka|gin|rum|tequila|sake|soju|cocktail|champagne|prosecco|cider|lager|ale|spirits?|liquor|alcohol)\b/i;

export type Extracted = { rows: DayRow[]; tzOffsetMin: number | null };

export async function extractDays(userId: string, from: string, to: string): Promise<Extracted> {
  const DS = ["daily_summary", "sleep_summary", "hrv_daily", "user_summary", "activities"] as const;
  const [raw, typed, mealRows, setRows, body] = await Promise.all([
    db
      .select({ dataset: garminRaw.dataset, key: garminRaw.key, date: garminRaw.date, payload: garminRaw.payload })
      .from(garminRaw)
      .where(and(eq(garminRaw.userId, userId), inArray(garminRaw.dataset, [...DS]), between(garminRaw.date, from, to))),
    db
      .select()
      .from(garminDaily)
      .where(and(eq(garminDaily.userId, userId), between(garminDaily.date, from, to))),
    db
      .select()
      .from(meals)
      .where(and(eq(meals.userId, userId), between(meals.date, from, to))),
    db
      .select({ date: workouts.date, reps: sets.reps, weight: sets.weight, isWarmup: sets.isWarmup })
      .from(sets)
      .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .where(and(eq(workouts.userId, userId), between(workouts.date, from, to))),
    db
      .select()
      .from(bodyStats)
      .where(and(eq(bodyStats.userId, userId), between(bodyStats.date, from, to))),
  ]);

  const rawBy = new Map<string, Json[]>(); // `${dataset}|${date}` → payloads
  for (const r of raw) {
    if (!r.date) continue;
    let p: unknown;
    try {
      p = JSON.parse(r.payload);
    } catch {
      continue;
    }
    if (!p || typeof p !== "object") continue;
    const k = `${r.dataset}|${r.date}`;
    rawBy.set(k, [...(rawBy.get(k) ?? []), p as Json]);
  }
  const one = (ds: string, date: string) => rawBy.get(`${ds}|${date}`)?.[0] ?? null;
  const typedBy = new Map(typed.map((t) => [t.date, t]));

  // Timezone offset (for meal times): from the most recent sleep with both clocks.
  let tzOffsetMin: number | null = null;
  for (const r of [...raw].reverse()) {
    if (r.dataset !== "sleep_summary") continue;
    try {
      const p = JSON.parse(r.payload) as Json;
      const off = offsetMinutes(p.sleepStartTimestampLocal, p.sleepStartTimestampGMT);
      if (off != null && Math.abs(off) <= 14 * 60) {
        tzOffsetMin = off;
        break;
      }
    } catch {
      /* skip */
    }
  }

  const rows: DayRow[] = [];
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    const ds = one("daily_summary", d);
    const sl = one("sleep_summary", d);
    const hv = one("hrv_daily", d);
    const us = one("user_summary", d);
    const tg = typedBy.get(d);
    const acts = rawBy.get(`activities|${d}`) ?? [];

    // Sleep need may be an object ({actual, baseline}) or a number of minutes.
    const need = sl?.sleepNeed;
    const sleepNeedMin =
      typeof need === "number" ? need : num(need, "actual", "baseline");

    let bed = localMinutes(sl?.sleepStartTimestampLocal);
    if (bed != null && bed > 12 * 60) bed -= 24 * 60;

    // Training load: Garmin's per-activity load, else TRIMP from HR-zone minutes.
    let cardio = 0;
    let haveLoad = false;
    const actList = acts.map((a) => {
      const load = num(a, "activityTrainingLoad");
      let trimp: number | null = null;
      const zones = [1, 2, 3, 4, 5].map((z) => num(a, `hrTimeInZone_${z}`));
      if (zones.some((z) => z != null)) {
        trimp = zones.reduce<number>((acc, sec, i) => acc + ((sec ?? 0) / 60) * (i + 1), 0);
      }
      const l = load ?? trimp;
      if (l != null) {
        cardio += l;
        haveLoad = true;
      }
      return {
        name: str(a, "activityName") ?? str(a, "activityType.typeKey") ?? "Activity",
        type: str(a, "activityType.typeKey"),
        min: Math.round((num(a, "duration") ?? 0) / 60),
        kcal: num(a, "calories"),
        load: l != null ? Math.round(l) : null,
        aerobicTE: num(a, "aerobicTrainingEffect"),
      };
    });
    const vo2 = acts.map((a) => num(a, "vO2MaxValue")).filter((v): v is number => v != null);

    const dayMeals = mealRows.filter((m) => m.date === d);
    const lastMeal = dayMeals.reduce<number | null>((acc, m) => {
      if (tzOffsetMin == null) return acc;
      const local = new Date(m.createdAt.getTime() + tzOffsetMin * 60_000);
      const min = local.getUTCHours() * 60 + local.getUTCMinutes();
      return acc == null || min > acc ? min : acc;
    }, null);
    const working = setRows.filter((s) => s.date === d && !s.isWarmup);
    const bs = body.find((b) => b.date === d);

    const im = num(ds, "intensityMinutes.moderate");
    const iv = num(ds, "intensityMinutes.vigorous");

    rows.push({
      date: d,
      sleepSec: num(sl, "sleepTimeSeconds") ?? tg?.sleepSeconds ?? null,
      sleepScore: num(sl, "sleepScores.overall.value", "sleepScores.overallScore.value") ?? tg?.sleepScore ?? null,
      deepSec: num(sl, "deepSleepSeconds"),
      remSec: num(sl, "remSleepSeconds"),
      lightSec: num(sl, "lightSleepSeconds"),
      awakeSec: num(sl, "awakeSleepSeconds"),
      awakeCount: num(sl, "awakeCount"),
      sleepNeedMin,
      bedtimeMin: bed,
      wakeMin: localMinutes(sl?.sleepEndTimestampLocal),
      sleepRespiration: num(sl, "averageRespirationValue"),
      sleepSpo2Avg: num(sl, "averageSpO2Value"),
      sleepSpo2Low: num(sl, "lowestSpO2Value"),
      sleepStress: num(sl, "avgSleepStress"),
      sleepAvgHr: num(sl, "avgHeartRate"),
      hrv: num(hv, "lastNightAvg") ?? tg?.hrvLastNight ?? null,
      hrvWeekly: num(hv, "weeklyAvg") ?? tg?.hrvWeeklyAvg ?? null,
      hrvStatus: str(hv, "status") ?? tg?.hrvStatus ?? null,
      hrvBalancedLow: num(hv, "baseline.balancedLow"),
      hrvBalancedHigh: num(hv, "baseline.balancedUpper"),
      rhr: num(ds, "heartRate.restingValue") ?? num(us, "restingHeartRate") ?? tg?.restingHr ?? null,
      stressAvg: (() => {
        const v = num(ds, "stress.avgLevel") ?? num(us, "averageStressLevel") ?? tg?.stressAvg ?? null;
        return v != null && v >= 0 ? v : null;
      })(),
      highStressMin: (() => {
        const ms = num(ds, "stress.highStressDurationInMillis");
        const s = num(us, "highStressDuration");
        return ms != null ? Math.round(ms / 60_000) : s != null ? Math.round(s / 60) : null;
      })(),
      bbHigh: num(ds, "bodyBattery.maxValue") ?? num(us, "bodyBatteryHighestValue") ?? tg?.bodyBatteryHigh ?? null,
      bbLow: num(ds, "bodyBattery.minValue") ?? num(us, "bodyBatteryLowestValue") ?? tg?.bodyBatteryLow ?? null,
      bbWake: num(us, "bodyBatteryAtWakeTime"),
      steps: num(ds, "movement.steps.value") ?? num(us, "totalSteps") ?? tg?.steps ?? null,
      intensityMin: im != null || iv != null ? (im ?? 0) + 2 * (iv ?? 0) : (tg?.intensityMinutes ?? null),
      activeKcal: num(ds, "calories.burnedActive") ?? num(us, "activeKilocalories") ?? tg?.activeKcal ?? null,
      totalKcal: num(ds, "calories.burnedTotal") ?? num(us, "totalKilocalories") ?? tg?.totalKcal ?? null,
      respirationAvg: num(ds, "respiration.avgValue"),
      activities: actList,
      cardioLoad: haveLoad ? Math.round(cardio) : acts.length ? 0 : null,
      strengthVolume: working.reduce((a, s) => a + s.weight * s.reps, 0),
      strengthSets: working.length,
      vo2max: vo2.length ? Math.max(...vo2) : null,
      intakeKcal: dayMeals.reduce((a, m) => a + m.calories, 0),
      protein: dayMeals.reduce((a, m) => a + m.protein, 0),
      carbs: dayMeals.reduce((a, m) => a + m.carbs, 0),
      fat: dayMeals.reduce((a, m) => a + m.fat, 0),
      mealCount: dayMeals.length,
      lastMealMin: lastMeal,
      alcohol: dayMeals.some((m) => ALCOHOL.test(`${m.name} ${m.items ?? ""}`)),
      weight: bs?.weight ?? null,
      bodyFat: bs?.bodyFat ?? null,
    });
  }
  return { rows, tzOffsetMin };
}
