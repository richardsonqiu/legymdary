import { userToday } from "@/lib/session";
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
  type Plan, type PlanInput } from "@/lib/nutrition";
import {
  getBodyStats,
  getDailyTotals,
  getGarminDaily,
  getAppleHealthStatus,
  getGarminStatus,
  getGoals,
  getLatestBodyValues,
  type AppleHealthStatus,
  type DayTotals,
  type GarminStatus,
  getOuraStatus,
  type OuraStatus,
} from "@/lib/queries";
import { addDaysStr } from "@/lib/utils";
import { requireUserId } from "@/lib/session";
import { lockTargets, targetModeOf, type TargetChange } from "@/lib/targets";
import type { TargetReview } from "@/db/schema";

/**
 * Everything the dashboard / Food / Plan pages need about energy: the plan
 * (with measured maintenance when available), Garmin burn and readiness.
 * "Today" is the user's local day, which the server doesn't know, so per-day
 * values are returned for a small window and the client picks its date.
 */
export type EnergyContext = {
  garmin: GarminStatus | null;
  /** Latest Apple Health upload (watch data without Garmin). */
  appleHealth: AppleHealthStatus | null;
  /** Oura Ring connection. */
  oura: OuraStatus | null;
  /** Any watch / ring data source: Garmin, Oura or an Apple Health upload. */
  wearable: boolean;
  goals: Goals | null;
  body: Awaited<ReturnType<typeof getLatestBodyValues>>;
  plan: Plan;
  /** Today's target (see lib/targets.ts: past days are locked, small changes ignored). */
  targets: DailyTargets;
  /** The plan from today's numbers before locking (for "how we got your number"). */
  livePlan: Plan;
  /** This week's (or month's) target review. */
  review: TargetReview | null;
  /** Weigh-ins of the last 5 weeks. */
  weights: { date: string; weight: number }[];
  /** "steady" (fixed until you change it) or "adaptive" (follows burn and weight). */
  targetMode: "steady" | "adaptive";
  /** What the plan would say right now from live inputs (to offer an update in steady mode). */
  liveTarget: number | null;
  /** The target each past day had. */
  targetsByDate: Record<string, NonNullable<DailyTargets>>;
  /** Why today's target differs from the previous day's, if it does. */
  targetChange: TargetChange | null;
  measured: MeasuredMaintenance | null;
  garminMaint: { kcal: number; avgActive: number; days: number } | null;
  intake: DayTotals[];
  garminDays: GarminDaily[];
  /** Calories added to the target per date when activity adjustment is on. */
  bonusByDate: Record<string, number>;
  readinessByDate: Record<string, Readiness | null>;
  /** The inputs behind `plan`, for "what if" variations such as pace options. */
  planInput: PlanInput;
};

export const getEnergyContext = cache(async (): Promise<EnergyContext> => {
  const today = (await userToday());
  const from = addDaysStr(today, -35);
  const to = addDaysStr(today, 1);
  const [garmin, appleHealth, oura, goals, body, stats, intake, garminDays] = await Promise.all([
    getGarminStatus(),
    getAppleHealthStatus(),
    getOuraStatus(),
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
  const planInput = planInputFrom(goals, body, undefined, maintenance, today);
  const livePlan = computePlan(planInput);
  const liveTargets = targetsFromPlan(livePlan);

  const bonusByDate: Record<string, number> = {};
  const readinessByDate: Record<string, Readiness | null> = {};
  const byDate = new Map(garminDays.map((d) => [d.date, d]));
  for (let i = -2; i <= 1; i++) {
    const date = addDaysStr(today, i);
    const d = byDate.get(date);
    // Steady targets never grow with exercise: extra burn is extra deficit.
    if (garmin?.adjustForActivity && liveTargets && !livePlan.usingOverride && targetModeOf(goals) === "adaptive") {
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

  // Lock the day's target: past days keep theirs; today ignores small wobbles.
  const userId = await requireUserId();
  const locked = await lockTargets({
    userId,
    today,
    goals,
    plan: livePlan,
    maintenance,
    weight: body.weight,
    bonusToday: bonusByDate[today] ?? 0,
    bodyFat: body.bodyFat,
    history: { intake, weights, burn: garminDays.map((d) => ({ date: d.date, totalKcal: d.totalKcal, activeKcal: d.activeKcal })) },
  });
  const targets = locked.today;
  const plan: Plan =
    targets && livePlan.calorieTarget != null
      ? {
          ...livePlan,
          calorieTarget: Math.round(targets.calories),
          protein: targets.protein,
          carbs: targets.carbs,
          fat: targets.fat,
          dailyDelta: livePlan.tdee != null ? Math.round(targets.calories) - livePlan.tdee : livePlan.dailyDelta,
        }
      : livePlan;
  // Past days use the activity bonus they had.
  for (const [d, b] of Object.entries(locked.bonusByDate)) if (d < today) bonusByDate[d] = b;
  if (locked.todayBonus) bonusByDate[today] = locked.todayBonus;
  else if (targetModeOf(goals) === "steady") delete bonusByDate[today];

  return {
    livePlan,
    targetMode: targetModeOf(goals),
    review: locked.review,
    weights,
    liveTarget: liveTargets ? Math.round(liveTargets.calories) : null,
    targetsByDate: locked.byDate,
    targetChange: locked.change,
    garmin,
    appleHealth,
    oura,
    wearable: !!garmin || !!appleHealth || !!oura,
    goals,
    body,
    plan,
    planInput,
    targets,
    measured,
    garminMaint,
    intake,
    garminDays,
    bonusByDate,
    readinessByDate,
  };
});
