import { cache } from "react";
import type { GarminDaily, Goals } from "@/db/schema";
import {
  activityBonus,
  chooseMaintenance,
  garminMaintenance,
  measuredMaintenance,
  readiness,
  type MeasuredMaintenance,
  type Readiness,
} from "@/lib/energy";
import {
  computePlan,
  planInputFrom,
  targetsFromPlan,
  type DailyTargets,
  type Plan,
} from "@/lib/nutrition";
import {
  getBodyStats,
  getDailyTotals,
  getGarminDaily,
  getGarminStatus,
  getGoals,
  getLatestBodyValues,
  type DayTotals,
  type GarminStatus,
} from "@/lib/queries";
import { addDaysStr, todayStr } from "@/lib/utils";

/**
 * Everything the dashboard / Food / Plan pages need about energy: the plan
 * (with measured maintenance when available), Garmin burn and readiness.
 * "Today" is the user's local day, which the server doesn't know, so per-day
 * values are returned for a small window and the client picks its date.
 */
export type EnergyContext = {
  garmin: GarminStatus | null;
  goals: Goals | null;
  body: Awaited<ReturnType<typeof getLatestBodyValues>>;
  plan: Plan;
  targets: DailyTargets;
  measured: MeasuredMaintenance | null;
  garminMaint: { kcal: number; avgActive: number; days: number } | null;
  intake: DayTotals[];
  garminDays: GarminDaily[];
  /** Calories added to the target per date when activity adjustment is on. */
  bonusByDate: Record<string, number>;
  readinessByDate: Record<string, Readiness | null>;
};

export const getEnergyContext = cache(async (): Promise<EnergyContext> => {
  const today = todayStr();
  const from = addDaysStr(today, -35);
  const to = addDaysStr(today, 1);
  const [garmin, goals, body, stats, intake, garminDays] = await Promise.all([
    getGarminStatus(),
    getGoals(),
    getLatestBodyValues(),
    getBodyStats(),
    getDailyTotals(from, to),
    getGarminDaily(from, to),
  ]);

  const weights = stats
    .filter((s) => s.weight != null && s.date >= from)
    .map((s) => ({ date: s.date, weight: s.weight as number }));
  const measured = measuredMaintenance(intake, weights, today);
  const garminMaint = garminMaintenance(
    garminDays.map((d) => ({ date: d.date, totalKcal: d.totalKcal, activeKcal: d.activeKcal })),
    today,
  );
  const maintenance = chooseMaintenance(measured, garminMaint);
  const plan = computePlan(planInputFrom(goals, body, undefined, maintenance));
  const targets = targetsFromPlan(plan);

  const bonusByDate: Record<string, number> = {};
  const readinessByDate: Record<string, Readiness | null> = {};
  const byDate = new Map(garminDays.map((d) => [d.date, d]));
  for (let i = -2; i <= 1; i++) {
    const date = addDaysStr(today, i);
    const d = byDate.get(date);
    if (garmin?.adjustForActivity && targets && !plan.usingOverride) {
      bonusByDate[date] = activityBonus(d?.activeKcal ?? null, garminMaint?.avgActive ?? null);
    }
    const prior = garminDays.filter((g) => g.date < date && g.date >= addDaysStr(date, -7) && g.restingHr);
    readinessByDate[date] = d
      ? readiness({
          sleepScore: d.sleepScore,
          sleepSeconds: d.sleepSeconds,
          hrvStatus: d.hrvStatus,
          bodyBatteryHigh: d.bodyBatteryHigh,
          restingHr: d.restingHr,
          restingHrBaseline: prior.length >= 3
            ? prior.reduce((a, g) => a + (g.restingHr ?? 0), 0) / prior.length
            : null,
        })
      : null;
  }

  return {
    garmin,
    goals,
    body,
    plan,
    targets,
    measured,
    garminMaint,
    intake,
    garminDays,
    bonusByDate,
    readinessByDate,
  };
});
