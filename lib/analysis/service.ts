import { userToday } from "@/lib/session";
import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { bodyScans, garminDaily, garminRaw, goals } from "@/db/schema";
import { extractDays, type DayRow } from "@/lib/analysis/extract";
import {
  baselineAt,
  dailyLoad,
  flagsAt,
  loadBalance,
  mean,
  personalPatterns,
  readinessAt,
  sleepConsistency,
  sleepDebtHours,
  sleepNeedMin,
  strain,
  zScore,
  type Flag,
  type Pattern,
  type Readiness,
} from "@/lib/analysis/metrics";
import { compareScans, leanMass, parseSegments, segmentBalance } from "@/lib/body-scan";
import { latestBodyValues } from "@/lib/body-values";
import { isFullyLogged } from "@/lib/energy";
import { computePlan, planInputFrom } from "@/lib/nutrition";
import { addDaysStr } from "@/lib/utils";

/**
 * Server-only, session-free (usable from cron). Builds the analysis for one
 * user and day: per-metric results, chart series, and the compact "day card"
 * that the AI narrates.
 */

const r1 = (v: number | null | undefined, p = 0) => (v == null ? null : Math.round(v * 10 ** p) / 10 ** p);
const hm = (min: number | null) => {
  if (min == null) return null;
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export type Trend = { now: number | null; usual: number | null; dir: "up" | "down" | "flat" | null };

function trend(rows: DayRow[], i: number, key: keyof DayRow, p = 0): Trend {
  const vals = (from: number, to: number) =>
    rows.slice(Math.max(0, from), to).map((r) => r[key]).filter((v): v is number => typeof v === "number");
  const recent = vals(i - 6, i + 1);
  const prior = vals(i - 34, i - 6);
  const now = recent.length >= 3 ? mean(recent) : null;
  const usual = prior.length >= 7 ? mean(prior) : null;
  let dir: Trend["dir"] = null;
  if (now != null && usual != null) {
    const d = (now - usual) / (Math.abs(usual) || 1);
    dir = Math.abs(d) < 0.03 ? "flat" : d > 0 ? "up" : "down";
  }
  return { now: r1(now, p), usual: r1(usual, p), dir };
}

export type DayCard = {
  date: string;
  readiness: Readiness | null;
  lastNight: {
    sleepHours: number | null;
    sleepNeedHours: number;
    sleepScore: number | null;
    deepPct: number | null;
    remPct: number | null;
    awakeMin: number | null;
    bedtime: string | null;
    wake: string | null;
    hrv: number | null;
    hrvUsual: number | null;
    hrvStatus: string | null;
    restingHr: number | null;
    restingHrUsual: number | null;
    respiration: number | null;
    spo2Low: number | null;
    sleepStress: number | null;
    bodyBatteryAtWake: number | null;
  };
  /** Garmin Body Battery (0 to 100): charged overnight, drained by the day. */
  bodyBattery: {
    wake: number | null;
    usualWake: number | null;
    charged: number | null;
    drainedYesterday: number | null;
    highYesterday: number | null;
    lowYesterday: number | null;
    /** Wake level for the last 7 mornings, oldest first. */
    week: (number | null)[];
  } | null;
  sleepDebtHours: number | null;
  sleepConsistency: { bedSd: number; wakeSd: number | null } | null;
  yesterday: {
    date: string;
    strain: number;
    load: number;
    activities: DayRow["activities"];
    strengthSets: number;
    strengthVolumeKg: number;
    steps: number | null;
    intensityMinutes: number | null;
    stressAvg: number | null;
    eatenKcal: number;
    burnedKcal: number | null;
    netKcal: number | null;
    protein: number;
    carbs: number;
    fat: number;
    meals: number;
    fullyLogged: boolean;
    lastMeal: string | null;
    alcohol: boolean;
  };
  load: { acute: number; chronic: number; ratio: number | null } | null;
  trends7d: Record<"hrv" | "restingHr" | "sleepHours" | "weight" | "intakeKcal" | "burnedKcal" | "steps", Trend>;
  energy7d: { fullyLoggedDays: number; avgNetKcal: number | null; impliedKgPerWeek: number | null };
  plan: {
    goal: string | null;
    calorieTarget: number | null;
    proteinTarget: number | null;
    carbsTarget: number | null;
    fatTarget: number | null;
    weeklyRateKg: number | null;
    currentWeight: number | null;
    vo2max: number | null;
  };
  /** Latest body-composition scan (InBody) on or before this day, with change vs the previous scan. */
  bodyComposition: {
    date: string;
    daysAgo: number;
    weightKg: number | null;
    skeletalMuscleKg: number | null;
    fatMassKg: number | null;
    bodyFatPct: number | null;
    leanMassKg: number | null;
    visceralFatLevel: number | null;
    waistHipRatio: number | null;
    bmrKcal: number | null;
    sincePrevious: {
      days: number;
      weightKg: number | null;
      muscleKg: number | null;
      fatKg: number | null;
      bodyFatPct: number | null;
      verdict: string | null;
    } | null;
    segmental: { armsPctOfIdeal: number | null; legsPctOfIdeal: number | null; upperLowerGap: number | null; advice: string | null } | null;
  } | null;
  patterns: Pattern[];
  flags: Flag[];
  coverage: { garminDays: number; loggedDays: number; hrvDays: number; sleepDays: number };
};

export type SeriesPoint = {
  date: string;
  readiness: number | null;
  hrv: number | null;
  rhr: number | null;
  sleepHours: number | null;
  sleepScore: number | null;
  battery: number | null;
  strain: number | null;
  eaten: number | null;
  burned: number | null;
};

export type Analysis = { date: string; card: DayCard; series: SeriesPoint[] };

/** Latest day with Garmin sleep/HRV/daily data, else today. */
export async function latestDataDate(userId: string): Promise<string> {
  const cap = addDaysStr((await userToday()), 1);
  const [[raw], [typed]] = await Promise.all([
    db
      .select({ date: garminRaw.date })
      .from(garminRaw)
      .where(and(eq(garminRaw.userId, userId), eq(garminRaw.dataset, "sleep_summary"), lte(garminRaw.date, cap)))
      .orderBy(desc(garminRaw.date))
      .limit(1),
    db
      .select({ date: garminDaily.date })
      .from(garminDaily)
      .where(and(eq(garminDaily.userId, userId), lte(garminDaily.date, cap)))
      .orderBy(desc(garminDaily.date))
      .limit(1),
  ]);
  return raw?.date ?? typed?.date ?? (await userToday());
}

export async function buildAnalysis(userId: string, date: string): Promise<Analysis> {
  const from = addDaysStr(date, -120);
  // All independent reads in one round trip.
  const [{ rows }, [g], [w], scans] = await Promise.all([
    extractDays(userId, from, date),
    db.select().from(goals).where(eq(goals.userId, userId)).limit(1),
    latestBodyValues(userId, date).then((b) => [b] as const),
    db
      .select()
      .from(bodyScans)
      .where(and(eq(bodyScans.userId, userId), lte(bodyScans.date, date)))
      .orderBy(desc(bodyScans.date))
      .limit(2),
  ]);
  const i = rows.length - 1;
  const today = rows[i];
  const yIdx = i - 1;
  const y = rows[yIdx];
  const plan = computePlan(planInputFrom(g ?? null, { weight: w?.weight ?? null, bodyFat: w?.bodyFat ?? null }));
  // (weight = newest reading; body fat prefers recent manual/InBody values — see lib/body-values.ts)

  const hrvB = baselineAt(rows, i, "hrv");
  const rhrKey = today.sleepAvgHr != null ? "sleepAvgHr" : "rhr";
  const rhrB = baselineAt(rows, i, rhrKey);
  const sleepTotal = today.sleepSec;
  const stagesKnown = sleepTotal && (today.deepSec != null || today.remSec != null);

  const week = rows.slice(Math.max(0, i - 7), i);
  const logged = week.filter((d) => d.totalKcal != null && isFullyLogged({ date: d.date, calories: d.intakeKcal, count: d.mealCount }));
  const avgNet = logged.length ? mean(logged.map((d) => d.intakeKcal - (d.totalKcal ?? 0))) : null;

  const vo2 = [...rows].reverse().find((r) => r.vo2max != null)?.vo2max ?? null;

  const card: DayCard = {
    date,
    readiness: readinessAt(rows, i),
    lastNight: {
      sleepHours: r1(sleepTotal != null ? sleepTotal / 3600 : null, 1),
      sleepNeedHours: r1(sleepNeedMin(today) / 60, 1)!,
      sleepScore: today.sleepScore,
      deepPct: stagesKnown && today.deepSec != null ? r1((today.deepSec / sleepTotal!) * 100) : null,
      remPct: stagesKnown && today.remSec != null ? r1((today.remSec / sleepTotal!) * 100) : null,
      awakeMin: r1(today.awakeSec != null ? today.awakeSec / 60 : null),
      bedtime: hm(today.bedtimeMin),
      wake: hm(today.wakeMin),
      hrv: today.hrv,
      hrvUsual: r1(hrvB?.mean),
      hrvStatus: today.hrvStatus,
      restingHr: r1(today[rhrKey] as number | null),
      restingHrUsual: r1(rhrB?.mean),
      respiration: r1(today.sleepRespiration, 1),
      spo2Low: today.sleepSpo2Low,
      sleepStress: r1(today.sleepStress),
      bodyBatteryAtWake: today.bbWake,
    },
    bodyBattery:
      today.bbWake != null || today.bbCharged != null || y?.bbLow != null
        ? {
            wake: today.bbWake,
            usualWake: r1(baselineAt(rows, i, "bbWake")?.mean),
            charged: today.bbCharged,
            drainedYesterday: y?.bbDrained ?? null,
            highYesterday: y?.bbHigh ?? null,
            lowYesterday: y?.bbLow ?? null,
            week: rows.slice(Math.max(0, i - 6), i + 1).map((d) => d.bbWake),
          }
        : null,
    sleepDebtHours: r1(sleepDebtHours(rows, i), 1),
    sleepConsistency: sleepConsistency(rows, i),
    yesterday: {
      date: y?.date ?? addDaysStr(date, -1),
      strain: y ? strain(rows, yIdx) : 0,
      load: y ? Math.round(dailyLoad(y)) : 0,
      activities: y?.activities ?? [],
      strengthSets: y?.strengthSets ?? 0,
      strengthVolumeKg: Math.round(y?.strengthVolume ?? 0),
      steps: y?.steps ?? null,
      intensityMinutes: y?.intensityMin ?? null,
      stressAvg: y?.stressAvg ?? null,
      eatenKcal: Math.round(y?.intakeKcal ?? 0),
      burnedKcal: r1(y?.totalKcal),
      netKcal: y?.totalKcal != null ? Math.round(y.intakeKcal - y.totalKcal) : null,
      protein: Math.round(y?.protein ?? 0),
      carbs: Math.round(y?.carbs ?? 0),
      fat: Math.round(y?.fat ?? 0),
      meals: y?.mealCount ?? 0,
      fullyLogged: !!y && isFullyLogged({ date: y.date, calories: y.intakeKcal, count: y.mealCount }),
      lastMeal: hm(y?.lastMealMin ?? null),
      alcohol: !!y?.alcohol,
    },
    load: loadBalance(rows, Math.max(0, yIdx)),
    trends7d: {
      hrv: trend(rows, i, "hrv"),
      restingHr: trend(rows, i, rhrKey),
      sleepHours: (() => {
        const t = trend(rows, i, "sleepSec");
        return { now: r1(t.now != null ? t.now / 3600 : null, 1), usual: r1(t.usual != null ? t.usual / 3600 : null, 1), dir: t.dir };
      })(),
      weight: trend(rows, i, "weight", 1),
      intakeKcal: trend(
        rows.map((r) => ({ ...r, intakeKcal: isFullyLogged({ date: r.date, calories: r.intakeKcal, count: r.mealCount }) ? r.intakeKcal : (null as unknown as number) })),
        i,
        "intakeKcal",
      ),
      burnedKcal: trend(rows, i, "totalKcal"),
      steps: trend(rows, i, "steps"),
    },
    energy7d: {
      fullyLoggedDays: logged.length,
      avgNetKcal: r1(avgNet),
      impliedKgPerWeek: avgNet != null ? r1((avgNet * 7) / 7700, 2) : null,
    },
    plan: {
      goal:
        plan.goalWeight != null
          ? `${plan.direction === "lose" ? "Lose" : plan.direction === "gain" ? "Gain" : "Maintain"} to ${r1(plan.goalWeight, 1)} kg${g?.targetBodyFat ? ` / ${g.targetBodyFat}% body fat` : ""}`
          : null,
      calorieTarget: plan.calorieTarget,
      proteinTarget: plan.protein,
      carbsTarget: plan.carbs,
      fatTarget: plan.fat,
      weeklyRateKg: plan.direction === "maintain" ? null : r1(plan.weeklyRate, 2),
      currentWeight: w?.weight ?? null,
      vo2max: vo2,
    },
    bodyComposition: (() => {
      const [cur, prev] = scans;
      if (!cur) return null;
      const ch = prev ? compareScans(prev, cur) : null;
      const bal = segmentBalance(parseSegments(cur.segmentalLean));
      return {
        date: cur.date,
        daysAgo: Math.round((Date.parse(date) - Date.parse(cur.date)) / 86_400_000),
        weightKg: cur.weight,
        skeletalMuscleKg: cur.skeletalMuscle,
        fatMassKg: cur.fatMass,
        bodyFatPct: cur.bodyFatPct,
        leanMassKg: leanMass(cur),
        visceralFatLevel: cur.visceralFat,
        waistHipRatio: cur.waistHip,
        bmrKcal: cur.bmr,
        sincePrevious: ch
          ? { days: ch.days, weightKg: ch.weight, muscleKg: ch.muscle, fatKg: ch.fat, bodyFatPct: ch.bodyFatPct, verdict: ch.verdict?.text ?? null }
          : null,
        segmental: bal
          ? { armsPctOfIdeal: bal.armsPct, legsPctOfIdeal: bal.legsPct, upperLowerGap: bal.upperLowerGap, advice: bal.advice }
          : null,
      };
    })(),
    patterns: personalPatterns(rows.slice(0, i + 1)),
    flags: [
      ...flagsAt(rows, i, { proteinTarget: plan.protein }),
      ...(() => {
        const out: Flag[] = [];
        const [cur] = scans;
        if (!cur) return out;
        if (cur.visceralFat != null && cur.visceralFat >= 10) {
          out.push({ level: "warn", text: `Visceral fat level ${cur.visceralFat} is in the high range (10+).` });
        }
        return out;
      })(),
    ],
    coverage: {
      garminDays: rows.filter((r) => r.totalKcal != null).length,
      loggedDays: rows.filter((r) => isFullyLogged({ date: r.date, calories: r.intakeKcal, count: r.mealCount })).length,
      hrvDays: rows.filter((r) => r.hrv != null).length,
      sleepDays: rows.filter((r) => r.sleepSec != null).length,
    },
  };

  const series: SeriesPoint[] = rows.slice(-30).map((r, k) => {
    const idx = rows.length - 30 + k;
    return {
      date: r.date,
      readiness: idx >= 0 ? (readinessAt(rows, idx)?.score ?? null) : null,
      hrv: r.hrv,
      rhr: r1(r.sleepAvgHr ?? r.rhr),
      sleepHours: r1(r.sleepSec != null ? r.sleepSec / 3600 : null, 1),
      sleepScore: r.sleepScore,
      battery: r.bbWake,
      strain: idx >= 0 && (r.cardioLoad != null || r.strengthSets > 0) ? strain(rows, idx) : null,
      eaten: r.mealCount ? Math.round(r.intakeKcal) : null,
      burned: r1(r.totalKcal),
    };
  });

  return { date, card, series };
}

/** z-score helper re-export for UI badges. */
export { zScore };
