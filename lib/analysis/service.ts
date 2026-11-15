import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { bodyStats, garminDaily, garminRaw, goals } from "@/db/schema";
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
import { isFullyLogged } from "@/lib/energy";
import { computePlan, planInputFrom } from "@/lib/nutrition";
import { addDaysStr, todayStr } from "@/lib/utils";

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
  strain: number | null;
  eaten: number | null;
  burned: number | null;
};

export type Analysis = { date: string; card: DayCard; series: SeriesPoint[] };

/** Latest day with Garmin sleep/HRV/daily data, else today. */
export async function latestDataDate(userId: string): Promise<string> {
  const cap = addDaysStr(todayStr(), 1);
  const [raw] = await db
    .select({ date: garminRaw.date })
    .from(garminRaw)
    .where(and(eq(garminRaw.userId, userId), eq(garminRaw.dataset, "sleep_summary"), lte(garminRaw.date, cap)))
    .orderBy(desc(garminRaw.date))
    .limit(1);
  if (raw?.date) return raw.date;
  const [typed] = await db
    .select({ date: garminDaily.date })
    .from(garminDaily)
    .where(and(eq(garminDaily.userId, userId), lte(garminDaily.date, cap)))
    .orderBy(desc(garminDaily.date))
    .limit(1);
  return typed?.date ?? todayStr();
}

export async function buildAnalysis(userId: string, date: string): Promise<Analysis> {
  const from = addDaysStr(date, -120);
  const { rows } = await extractDays(userId, from, date);
  const i = rows.length - 1;
  const today = rows[i];
  const yIdx = i - 1;
  const y = rows[yIdx];

  const [g] = await db.select().from(goals).where(eq(goals.userId, userId)).limit(1);
  const [w] = await db
    .select({ weight: bodyStats.weight, bodyFat: bodyStats.bodyFat })
    .from(bodyStats)
    .where(and(eq(bodyStats.userId, userId), isNotNull(bodyStats.weight), lte(bodyStats.date, date)))
    .orderBy(desc(bodyStats.date))
    .limit(1);
  const plan = computePlan(planInputFrom(g ?? null, { weight: w?.weight ?? null, bodyFat: w?.bodyFat ?? null }));

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
    patterns: personalPatterns(rows.slice(0, i + 1)),
    flags: flagsAt(rows, i, { proteinTarget: plan.protein }),
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
      strain: idx >= 0 && (r.cardioLoad != null || r.strengthSets > 0) ? strain(rows, idx) : null,
      eaten: r.mealCount ? Math.round(r.intakeKcal) : null,
      burned: r1(r.totalKcal),
    };
  });

  return { date, card, series };
}

/** z-score helper re-export for UI badges. */
export { zScore };
