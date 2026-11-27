import { orderFor, pickActivities, pickBySource, type Category } from "@legymdary/shared";
import { and, between, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bodyStats,
  garminDaily,
  garminRaw,
  meals,
  sets,
  workoutExercises,
  workouts,
  skippedMeals,
} from "@/db/schema";
import { getPrefs } from "@/lib/sources";
import { addDaysStr } from "@legymdary/shared";

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
  /** Garmin's word for the score ("EXCELLENT", "GOOD", "FAIR", "POOR"), when provided. */
  sleepQualifier: string | null;
  /** Garmin's rating of each part of the score (duration, stress, deep, REM ...), when provided. */
  sleepParts: { key: string; rating: string }[];
  restlessMoments: number | null;
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
  /** Body Battery gained overnight and spent during the day (Garmin's "charged" / "drained"). */
  bbCharged: number | null;
  bbDrained: number | null;
  steps: number | null;
  intensityMin: number | null;
  activeKcal: number | null;
  totalKcal: number | null;
  respirationAvg: number | null;
  // Training
  activities: {
    id: string | null;
    name: string;
    type: string | null;
    min: number;
    kcal: number | null;
    load: number | null;
    aerobicTE: number | null;
  }[];
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
  /** Meals the user marked as skipped. */
  skippedCount: number;
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
    let v: unknown =
      o && typeof o === "object" && p in (o as Json) ? (o as Json)[p] : o;
    if (v === o)
      for (const k of p.split("."))
        v = v && typeof v === "object" ? (v as Json)[k] : undefined;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)))
      return Number(v);
  }
  return null;
}
function str(o: unknown, ...paths: string[]): string | null {
  for (const p of paths) {
    let v: unknown =
      o && typeof o === "object" && p in (o as Json) ? (o as Json)[p] : o;
    if (v === o)
      for (const k of p.split("."))
        v = v && typeof v === "object" ? (v as Json)[k] : undefined;
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
    const m = /T?(\d{2}):(\d{2})/.exec(
      v.includes("T") ? v.split("T")[1] : (v.split(" ")[1] ?? ""),
    );
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  return null;
}
/** Local-minus-GMT offset in minutes from a pair of Garmin timestamps. */
function offsetMinutes(local: unknown, gmt: unknown): number | null {
  const toMs = (v: unknown) =>
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Date.parse(
            v.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? "" : "Z"),
          )
        : NaN;
  const a = toMs(local);
  const b = toMs(gmt);
  return Number.isFinite(a) && Number.isFinite(b)
    ? Math.round((a - b) / 60_000)
    : null;
}

const SLEEP_PARTS: [string, string][] = [
  ["duration", "totalDuration"],
  ["stress", "stress"],
  ["wakeups", "awakeCount"],
  ["deep", "deepPercentage"],
  ["rem", "remPercentage"],
  ["light", "lightPercentage"],
  ["restfulness", "restlessness"],
];

/**
 * Only these fields are pulled from each stored Garmin payload. SQLite's
 * json_extract projects them in the database, so a 120-day analysis transfers
 * ~0.5 KB per day instead of the full raw responses (~10 KB+ per day).
 */
const FIELDS: Record<string, string[]> = {
  daily_summary: [
    "calories.burnedTotal",
    "calories.burnedActive",
    "intensityMinutes.moderate",
    "intensityMinutes.vigorous",
    "heartRate.restingValue",
    "stress.avgLevel",
    "stress.highStressDurationInMillis",
    "bodyBattery.maxValue",
    "bodyBattery.minValue",
    "movement.steps.value",
    "respiration.avgValue",
  ],
  sleep_summary: [
    "sleepTimeSeconds",
    "sleepScores.overall.value",
    "sleepScores.overallScore.value",
    "sleepScores.overall.qualifierKey",
    "sleepScores.overallScore.qualifierKey",
    "sleepScores.totalDuration.qualifierKey",
    "sleepScores.stress.qualifierKey",
    "sleepScores.awakeCount.qualifierKey",
    "sleepScores.remPercentage.qualifierKey",
    "sleepScores.deepPercentage.qualifierKey",
    "sleepScores.lightPercentage.qualifierKey",
    "sleepScores.restlessness.qualifierKey",
    "restlessMomentsCount",
    "deepSleepSeconds",
    "remSleepSeconds",
    "lightSleepSeconds",
    "awakeSleepSeconds",
    "awakeCount",
    "sleepNeed",
    "sleepNeed.actual",
    "sleepNeed.baseline",
    "sleepStartTimestampLocal",
    "sleepStartTimestampGMT",
    "sleepEndTimestampLocal",
    "averageRespirationValue",
    "averageSpO2Value",
    "lowestSpO2Value",
    "avgSleepStress",
    "avgHeartRate",
  ],
  hrv_daily: [
    "lastNightAvg",
    "weeklyAvg",
    "status",
    "baseline.balancedLow",
    "baseline.balancedUpper",
  ],
  body_battery_daily: ["charged", "drained"],
  user_summary: [
    "restingHeartRate",
    "averageStressLevel",
    "highStressDuration",
    "bodyBatteryHighestValue",
    "bodyBatteryLowestValue",
    "bodyBatteryAtWakeTime",
    "totalSteps",
    "activeKilocalories",
    "totalKilocalories",
  ],
  activities: [
    "activityId",
    "activityTrainingLoad",
    "hrTimeInZone_1",
    "hrTimeInZone_2",
    "hrTimeInZone_3",
    "hrTimeInZone_4",
    "hrTimeInZone_5",
    "activityName",
    "activityType.typeKey",
    "duration",
    "calories",
    "aerobicTrainingEffect",
    "vO2MaxValue",
  ],
};
/** SQL json_object('a.b', json_extract(payload, '$.a.b'), …) — field names are constants above. */
const projection = (fields: string[]) =>
  sql.raw(
    `json_object(${fields.map((f) => `'${f}', json_extract(payload, '$.${f}')`).join(", ")})`,
  );

const ALCOHOL =
  /\b(beer|wine|whisk(e)?y|vodka|gin|rum|tequila|sake|soju|cocktail|champagne|prosecco|cider|lager|ale|spirits?|liquor|alcohol)\b/i;

export type Extracted = { rows: DayRow[]; tzOffsetMin: number | null };

export async function extractDays(
  userId: string,
  from: string,
  to: string,
): Promise<Extracted> {
  const rawQueries = Object.entries(FIELDS).map(([dataset, fields]) =>
    db
      .select({
        date: garminRaw.date,
        key: garminRaw.key,
        payload: sql<string>`${projection(fields)}`,
      })
      .from(garminRaw)
      .where(
        and(
          eq(garminRaw.userId, userId),
          eq(garminRaw.dataset, dataset),
          between(garminRaw.date, from, to),
        ),
      )
      .then((rows) => rows.map((r) => ({ ...r, dataset }))),
  );
  const [raw, typed, mealRows, setRows, body, skipRows, prefs] = await Promise.all([
    Promise.all(rawQueries).then((r) => r.flat()),
    db
      .select()
      .from(garminDaily)
      .where(
        and(
          eq(garminDaily.userId, userId),
          between(garminDaily.date, from, to),
        ),
      ),
    db
      .select({
        date: meals.date,
        name: meals.name,
        items: meals.items,
        calories: meals.calories,
        protein: meals.protein,
        carbs: meals.carbs,
        fat: meals.fat,
        createdAt: meals.createdAt,
      })
      .from(meals)
      .where(and(eq(meals.userId, userId), between(meals.date, from, to))),
    db
      .select({
        date: workouts.date,
        reps: sets.reps,
        weight: sets.weight,
        isWarmup: sets.isWarmup,
      })
      .from(sets)
      .innerJoin(
        workoutExercises,
        eq(sets.workoutExerciseId, workoutExercises.id),
      )
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .where(
        and(eq(workouts.userId, userId), between(workouts.date, from, to)),
      ),
    db
      .select()
      .from(bodyStats)
      .where(
        and(eq(bodyStats.userId, userId), between(bodyStats.date, from, to)),
      ),
    db
      .select({ date: skippedMeals.date })
      .from(skippedMeals)
      .where(and(eq(skippedMeals.userId, userId), between(skippedMeals.date, from, to))),
    getPrefs(userId),
  ]);

  const rawBy = new Map<string, { key: string | null; p: Json }[]>(); // `${dataset}|${date}` → payloads
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
    rawBy.set(k, [...(rawBy.get(k) ?? []), { key: r.key, p: p as Json }]);
  }
  // Several devices can have a payload for the same day: use the one the
  // user prefers for that kind of data (lib/sources.ts), else the next.
  const CAT: Record<string, Category> = {
    sleep_summary: "sleep",
    hrv_daily: "recovery",
    user_summary: "activity",
    daily_summary: "activity",
    body_battery_daily: "recovery",
  };
  const one = (ds: string, date: string) =>
    pickBySource(rawBy.get(`${ds}|${date}`) ?? [], orderFor(prefs, CAT[ds] ?? "activity"))?.p ?? null;
  const typedBy = new Map(typed.map((t) => [t.date, t]));

  // Timezone offset (for meal times): from the most recent sleep with both clocks.
  let tzOffsetMin: number | null = null;
  for (const r of [...raw].reverse()) {
    if (r.dataset !== "sleep_summary") continue;
    try {
      const p = JSON.parse(r.payload) as Json;
      const off = offsetMinutes(
        p.sleepStartTimestampLocal,
        p.sleepStartTimestampGMT,
      );
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
    const bb = one("body_battery_daily", d);
    const tg = typedBy.get(d);
    const acts = pickActivities(rawBy.get(`activities|${d}`) ?? [], orderFor(prefs, "workouts")).map((a) => a.p);

    // Sleep need may be an object ({actual, baseline}) or a number of minutes.
    // Sleep need may be an object ({actual, baseline}) or a plain number of minutes.
    const sleepNeedMin = num(sl, "sleepNeed.actual", "sleepNeed.baseline", "sleepNeed");

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
        trimp = zones.reduce<number>(
          (acc, sec, i) => acc + ((sec ?? 0) / 60) * (i + 1),
          0,
        );
      }
      const l = load ?? trimp;
      if (l != null) {
        cardio += l;
        haveLoad = true;
      }
      const idNum = num(a, "activityId");
      return {
        id: idNum != null ? String(idNum) : str(a, "activityId"),
        name:
          str(a, "activityName") ??
          str(a, "activityType.typeKey") ??
          "Activity",
        type: str(a, "activityType.typeKey"),
        min: Math.round((num(a, "duration") ?? 0) / 60),
        kcal: num(a, "calories"),
        load: l != null ? Math.round(l) : null,
        aerobicTE: num(a, "aerobicTrainingEffect"),
      };
    });
    const vo2 = acts
      .map((a) => num(a, "vO2MaxValue"))
      .filter((v): v is number => v != null);

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
      sleepScore:
        num(
          sl,
          "sleepScores.overall.value",
          "sleepScores.overallScore.value",
        ) ??
        tg?.sleepScore ??
        null,
      sleepQualifier: str(sl, "sleepScores.overall.qualifierKey", "sleepScores.overallScore.qualifierKey"),
      sleepParts: SLEEP_PARTS.flatMap(([key, path]) => {
        const rating = str(sl, `sleepScores.${path}.qualifierKey`);
        return rating ? [{ key, rating }] : [];
      }),
      restlessMoments: num(sl, "restlessMomentsCount"),
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
      // The merged row already follows the "recovery" device preference.
      rhr:
        tg?.restingHr ??
        num(ds, "heartRate.restingValue") ??
        num(us, "restingHeartRate") ??
        null,
      stressAvg: (() => {
        const v =
          num(ds, "stress.avgLevel") ??
          num(us, "averageStressLevel") ??
          tg?.stressAvg ??
          null;
        return v != null && v >= 0 ? v : null;
      })(),
      highStressMin: (() => {
        const ms = num(ds, "stress.highStressDurationInMillis");
        const s = num(us, "highStressDuration");
        return ms != null
          ? Math.round(ms / 60_000)
          : s != null
            ? Math.round(s / 60)
            : null;
      })(),
      bbHigh:
        num(ds, "bodyBattery.maxValue") ??
        num(us, "bodyBatteryHighestValue") ??
        tg?.bodyBatteryHigh ??
        null,
      bbLow:
        num(ds, "bodyBattery.minValue") ??
        num(us, "bodyBatteryLowestValue") ??
        tg?.bodyBatteryLow ??
        null,
      // Without the raw daily summary (import paused), the day's high is the closest
      // stand-in: Body Battery normally peaks when you wake.
      bbWake: num(us, "bodyBatteryAtWakeTime") ?? (us ? null : (tg?.bodyBatteryHigh ?? null)),
      bbCharged: num(bb, "charged") ?? tg?.bodyBatteryCharged ?? null,
      bbDrained: num(bb, "drained") ?? tg?.bodyBatteryDrained ?? null,
      steps:
        num(ds, "movement.steps.value") ??
        num(us, "totalSteps") ??
        tg?.steps ??
        null,
      intensityMin:
        im != null || iv != null
          ? (im ?? 0) + 2 * (iv ?? 0)
          : (tg?.intensityMinutes ?? null),
      activeKcal:
        num(ds, "calories.burnedActive") ??
        num(us, "activeKilocalories") ??
        tg?.activeKcal ??
        null,
      totalKcal:
        num(ds, "calories.burnedTotal") ??
        num(us, "totalKilocalories") ??
        tg?.totalKcal ??
        null,
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
      skippedCount: skipRows.filter((s) => s.date === d).length,
      lastMealMin: lastMeal,
      alcohol: dayMeals.some((m) => ALCOHOL.test(`${m.name} ${m.items ?? ""}`)),
      weight: bs?.weight ?? null,
      bodyFat: bs?.bodyFat ?? null,
    });
  }
  return { rows, tzOffsetMin };
}
