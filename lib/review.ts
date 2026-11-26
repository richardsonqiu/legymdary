/**
 * Server-only. Target reviews: the daily target only moves at a weekly
 * (Monday) or monthly (1st) review, not day by day.
 *
 * The suggestion uses averages so one odd day can't move it: the weight
 * trend line (not the last weigh-in), the burn averaged over weeks, and
 * the intake on fully logged days.
 *
 * - Not enough data (fewer than 4 logged days in the week, 14 in the month)
 *   or a goal younger than 14 days: no change.
 * - Within 50 kcal of the current target: no change.
 * - Steady targets: the review waits for you (Keep or Update).
 * - Adaptive targets: applied automatically, at most 100 kcal per review.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { targetReviews, type TargetReview } from "@/db/schema";
import { isFullyLogged } from "@/lib/energy";
import { computePlan, planInputFrom, targetsFromPlan, type PlanInput } from "@/lib/nutrition";
import { addDaysStr } from "@/lib/utils";

export type Cadence = "weekly" | "monthly";
export const cadenceOf = (g: { reviewCadence?: string | null } | null): Cadence => (g?.reviewCadence === "monthly" ? "monthly" : "weekly");

export function periodStartFor(today: string, cadence: Cadence): string {
  if (cadence === "monthly") return `${today.slice(0, 8)}01`;
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  return addDaysStr(today, -dow);
}

export function nextReviewDate(today: string, cadence: Cadence): string {
  if (cadence === "monthly") {
    const [y, m] = today.split("-").map(Number);
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }
  return addDaysStr(periodStartFor(today, "weekly"), 7);
}

function trend(weights: { date: string; weight: number }[], today: string) {
  if (weights.length < 3) return { weight: weights.at(-1)?.weight ?? null, perWeek: null as number | null };
  const x = weights.map((w) => (Date.parse(`${w.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = weights.reduce((a, w) => a + w.weight, 0) / weights.length;
  const den = x.reduce((a, v) => a + (v - mx) ** 2, 0);
  if (!den) return { weight: my, perWeek: null };
  const slope = x.reduce((a, v, i) => a + (v - mx) * (weights[i].weight - my), 0) / den;
  // Trend value today (x = 0).
  return { weight: Math.round((my - slope * mx) * 10) / 10, perWeek: Math.round(slope * 7 * 100) / 100 };
}

type Goals = Parameters<typeof planInputFrom>[0];

export async function ensureReview(i: {
  userId: string;
  today: string;
  goals: (NonNullable<Goals> & { reviewCadence?: string | null; targetMode?: string | null }) | null;
  current: { calories: number; protein: number | null; carbs: number | null; fat: number | null };
  /** First day of the current goal settings. */
  goalSince: string;
  bodyFat: number | null;
  maintenance: PlanInput["maintenance"];
  intake: { date: string; calories: number; count: number; skipped?: number }[];
  weights: { date: string; weight: number }[];
  burn: { date: string; totalKcal: number | null }[];
}): Promise<TargetReview | null> {
  if (!i.goals) return null;
  const cadence = cadenceOf(i.goals);
  const periodStart = periodStartFor(i.today, cadence);
  const [existing] = await db
    .select()
    .from(targetReviews)
    .where(and(eq(targetReviews.userId, i.userId), eq(targetReviews.periodStart, periodStart)))
    .limit(1);
  if (existing) return existing;

  const windowDays = cadence === "monthly" ? 28 : 14;
  const needDays = cadence === "monthly" ? 14 : 4;
  const countFrom = addDaysStr(i.today, cadence === "monthly" ? -28 : -7);
  const logged = i.intake.filter((d) => d.date >= countFrom && d.date < i.today && isFullyLogged({ ...d, skipped: d.skipped ?? 0 }));
  const avgIntake = logged.length ? Math.round(logged.reduce((a, d) => a + d.calories, 0) / logged.length) : null;
  const burns = i.burn.filter((b) => b.date >= addDaysStr(i.today, -windowDays) && b.date < i.today && (b.totalKcal ?? 0) > 800);
  const avgBurn = burns.length >= 3 ? Math.round(burns.reduce((a, b) => a + (b.totalKcal ?? 0), 0) / burns.length) : (i.maintenance?.kcal ?? null);
  const tr = trend(
    i.weights.filter((w) => w.date >= addDaysStr(i.today, -(windowDays + 7)) && w.date <= i.today),
    i.today,
  );

  let suggested: { calories: number; protein: number | null; carbs: number | null; fat: number | null } | null = null;
  if (tr.weight != null) {
    const plan = computePlan(planInputFrom(i.goals, { weight: tr.weight, bodyFat: i.bodyFat }, Number(i.today.slice(0, 4)), i.maintenance, i.today));
    const t = targetsFromPlan(plan);
    if (t) suggested = { calories: Math.round(t.calories), protein: t.protein, carbs: t.carbs, fat: t.fat };
  }

  let decision: string;
  let applied: number | null = null;
  const diff = suggested ? suggested.calories - i.current.calories : 0;
  if (i.goalSince > addDaysStr(i.today, -14)) decision = "too_early";
  else if (logged.length < needDays || !suggested) decision = "not_enough_data";
  else if (Math.abs(diff) < 50) decision = "no_change";
  else if (i.goals.targetMode === "adaptive") {
    decision = "auto";
    applied = i.current.calories + Math.max(-100, Math.min(100, diff));
  } else decision = "pending";

  const row = {
    userId: i.userId,
    periodStart,
    cadence,
    current: i.current.calories,
    suggested: suggested?.calories ?? null,
    suggestedProtein: suggested?.protein ?? null,
    suggestedCarbs: suggested?.carbs ?? null,
    suggestedFat: suggested?.fat ?? null,
    applied,
    decision,
    trendKgWeek: tr.perWeek,
    loggedDays: logged.length,
    avgIntake,
    avgBurn,
    decidedAt: decision === "auto" ? new Date() : null,
  };
  await db.insert(targetReviews).values(row).onConflictDoNothing();
  const [saved] = await db
    .select()
    .from(targetReviews)
    .where(and(eq(targetReviews.userId, i.userId), eq(targetReviews.periodStart, periodStart)))
    .limit(1);
  return saved ?? null;
}

/** Targets to use when a review was applied (carbs absorb a capped step). */
export function reviewTargets(r: TargetReview, base: { protein: number | null; carbs: number | null; fat: number | null }) {
  const cal = r.applied!;
  const step = r.suggested != null ? cal - r.suggested : 0;
  return {
    calories: cal,
    protein: r.suggestedProtein ?? base.protein,
    fat: r.suggestedFat ?? base.fat,
    carbs: r.suggestedCarbs != null ? Math.max(0, Math.round((r.suggestedCarbs * 4 + step) / 4 / 5) * 5) : base.carbs,
  };
}

export async function recentReviews(userId: string, limit = 8): Promise<TargetReview[]> {
  return db.select().from(targetReviews).where(eq(targetReviews.userId, userId)).orderBy(desc(targetReviews.periodStart)).limit(limit);
}
