/**
 * Pure energy-balance analysis (no DB). Combines the food log, weigh-ins and
 * Garmin's daily burn.
 */
import { KCAL_PER_KG, weightTrendPerWeek, type MaintenanceSource } from "@/lib/nutrition";
import { addDaysStr, daysBetween } from "@/lib/utils";

export type IntakeDay = { date: string; calories: number; count: number };
export type BurnDay = {
  date: string;
  totalKcal: number | null;
  activeKcal: number | null;
};
export type WeighIn = { date: string; weight: number };

/** A day counts as "fully logged" if it has ≥2 meals or ≥1,000 kcal. */
export const isFullyLogged = (d: IntakeDay) => d.count >= 2 || d.calories >= 1000;

export type MeasuredMaintenance = {
  kcal: number;
  avgIntake: number;
  trendKgPerWeek: number;
  loggedDays: number;
  weighIns: number;
  windowDays: number;
};

/**
 * "Adaptive TDEE": what you actually ate minus what your weight did.
 * maintenance ≈ avg daily intake − (kg/day trend × 7,700 kcal/kg).
 * Needs ≥10 fully-logged days and ≥4 weigh-ins spanning ≥14 days.
 */
export function measuredMaintenance(
  intake: IntakeDay[],
  weights: WeighIn[],
  today: string,
  windowDays = 28,
): MeasuredMaintenance | null {
  const from = addDaysStr(today, -windowDays);
  const days = intake.filter((d) => d.date >= from && d.date < today && isFullyLogged(d));
  const ws = weights.filter((w) => w.date >= from && w.date <= today);
  if (days.length < 10 || ws.length < 4) return null;
  if (daysBetween(ws[0].date, ws[ws.length - 1].date) < 14) return null;
  const trend = weightTrendPerWeek(
    ws.map((w) => ({ day: daysBetween(ws[0].date, w.date), weight: w.weight })),
  );
  if (trend == null) return null;
  const avgIntake = days.reduce((a, d) => a + d.calories, 0) / days.length;
  const kcal = avgIntake - (trend / 7) * KCAL_PER_KG;
  if (kcal < 1200 || kcal > 5000) return null; // implausible → logging gaps
  return {
    kcal: Math.round(kcal / 10) * 10,
    avgIntake,
    trendKgPerWeek: trend,
    loggedDays: days.length,
    weighIns: ws.length,
    windowDays,
  };
}

/** Average Garmin total burn over recent complete days (≥5 needed). */
export function garminMaintenance(burn: BurnDay[], today: string, windowDays = 14) {
  const from = addDaysStr(today, -windowDays);
  const days = burn.filter((d) => d.date >= from && d.date < today && (d.totalKcal ?? 0) > 800);
  if (days.length < 5) return null;
  const avg = days.reduce((a, d) => a + (d.totalKcal ?? 0), 0) / days.length;
  const avgActive = days.reduce((a, d) => a + (d.activeKcal ?? 0), 0) / days.length;
  return { kcal: Math.round(avg / 10) * 10, avgActive, days: days.length };
}

export function chooseMaintenance(
  measured: MeasuredMaintenance | null,
  garmin: { kcal: number } | null,
): { kcal: number; source: MaintenanceSource } | null {
  if (measured) return { kcal: measured.kcal, source: "measured" };
  if (garmin) return { kcal: garmin.kcal, source: "garmin" };
  return null;
}

/**
 * Extra calories to add to a day's target when that day's Garmin active burn
 * is above your recent average. Only half is given back (watch estimates run
 * high), never negative (the day's burn keeps rising until midnight), capped.
 */
export function activityBonus(activeKcal: number | null, avgActive: number | null): number {
  if (activeKcal == null || avgActive == null) return 0;
  const extra = activeKcal - avgActive;
  if (extra <= 50) return 0;
  return Math.min(600, Math.round((extra * 0.5) / 10) * 10);
}

/* ------------------------------------------------------------------ */
/* Readiness                                                           */
/* ------------------------------------------------------------------ */

export type ReadinessInput = {
  sleepScore: number | null;
  sleepSeconds: number | null;
  hrvStatus: string | null;
  bodyBatteryHigh: number | null;
  restingHr: number | null;
  restingHrBaseline: number | null;
};

export type Signal = { label: string; value: string; tone: "good" | "ok" | "poor" };

export type Readiness = {
  verdict: "push" | "normal" | "easy";
  headline: string;
  advice: string;
  signals: Signal[];
};

export function readiness(r: ReadinessInput): Readiness | null {
  const signals: Signal[] = [];
  let score = 0;
  let count = 0;
  const add = (s: Signal) => {
    signals.push(s);
    count++;
    score += s.tone === "good" ? 1 : s.tone === "poor" ? -1 : 0;
  };

  if (r.sleepScore != null) {
    const h = r.sleepSeconds ? ` · ${(r.sleepSeconds / 3600).toFixed(1)}h` : "";
    add({
      label: "Sleep",
      value: `${r.sleepScore}${h}`,
      tone: r.sleepScore >= 80 ? "good" : r.sleepScore < 60 ? "poor" : "ok",
    });
  } else if (r.sleepSeconds) {
    const hrs = r.sleepSeconds / 3600;
    add({ label: "Sleep", value: `${hrs.toFixed(1)}h`, tone: hrs >= 7 ? "good" : hrs < 6 ? "poor" : "ok" });
  }
  if (r.hrvStatus) {
    const s = r.hrvStatus.toUpperCase();
    add({
      label: "HRV",
      value: s.charAt(0) + s.slice(1).toLowerCase(),
      tone: s === "BALANCED" ? "good" : s === "UNBALANCED" || s === "LOW" || s === "POOR" ? "poor" : "ok",
    });
  }
  if (r.bodyBatteryHigh != null) {
    add({
      label: "Body Battery",
      value: String(r.bodyBatteryHigh),
      tone: r.bodyBatteryHigh >= 70 ? "good" : r.bodyBatteryHigh < 40 ? "poor" : "ok",
    });
  }
  if (r.restingHr != null && r.restingHrBaseline != null) {
    const diff = r.restingHr - r.restingHrBaseline;
    add({
      label: "Resting HR",
      value: `${r.restingHr} (${diff >= 0 ? "+" : ""}${Math.round(diff)})`,
      tone: diff >= 5 ? "poor" : diff <= 1 ? "good" : "ok",
    });
  }
  if (count === 0) return null;

  const ratio = score / count;
  if (ratio >= 0.5) {
    return {
      verdict: "push",
      headline: "Ready to push",
      advice: "Well recovered — a good day for heavy sets or a PR attempt.",
      signals,
    };
  }
  if (ratio <= -0.34) {
    return {
      verdict: "easy",
      headline: "Take it easy",
      advice: "Recovery is low — keep intensity moderate, prioritise technique, sleep and food.",
      signals,
    };
  }
  return {
    verdict: "normal",
    headline: "Train as planned",
    advice: "Recovery looks normal — stick to your planned session.",
    signals,
  };
}
