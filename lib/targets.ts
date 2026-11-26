/**
 * Server-only. Locks each day's calorie / macro target and explains changes.
 *
 * The plan is recalculated from live inputs (latest weight, average burn,
 * days left to a goal date), so the number would move a little every day and
 * past days would be judged against today's target. Instead:
 *
 * - Each day's target is saved in daily_targets. Once the day is over it is
 *   never changed, so past days keep the target they had.
 * - Today's target only moves when the new calculation differs by 50 kcal or
 *   more (or 10 g protein) from the last one, or when you change your goal,
 *   so small daily wobbles don't show.
 * - When it moves, the reasons (weight, burn, goal date, goal change) are
 *   worked out from the saved inputs and shown on the Food page.
 */
import { and, asc, between, eq } from "drizzle-orm";
import { db } from "@/db";
import { dailyTargets, type DailyTarget } from "@/db/schema";
import { latestBodyValues } from "@/lib/body-values";
import { chooseMaintenance, garminMaintenance, measuredMaintenance } from "@/lib/energy";
import { computePlan, planInputFrom, targetsFromPlan, type DailyTargets, type Plan } from "@/lib/nutrition";
import { addDaysStr } from "@/lib/utils";

export const CAL_STEP = 50;
const PROTEIN_STEP = 10;
const BACKFILL_DAYS = 35;

type GoalRow = Parameters<typeof planInputFrom>[0];

/** Fingerprint of the settings a user changes on purpose. */
export function goalKey(g: GoalRow): string {
  if (!g) return "none";
  return JSON.stringify([
    g.sex,
    g.birthYear,
    g.heightCm,
    g.activityLevel,
    g.targetWeight,
    g.targetBodyFat,
    g.weeklyRate,
    g.targetDate ?? null,
    g.calorieOverride,
  ]);
}

export type TargetChange = {
  from: number;
  to: number;
  /** The day the previous target belongs to. */
  since: string;
  reasons: string[];
};

export type LockedTargets = {
  /** Today's target (locked rules applied). */
  today: DailyTargets;
  /** Past days' saved targets (without the activity bonus), by date. */
  byDate: Record<string, NonNullable<DailyTargets>>;
  /** Saved activity bonus by date. */
  bonusByDate: Record<string, number>;
  change: TargetChange | null;
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function reasonsFor(prev: DailyTarget, cur: { maintenance: number | null; maintenanceSource: string | null; weight: number | null; weeklyRate: number | null; goalKey: string; targetDate: string | null }): string[] {
  const out: string[] = [];
  if (prev.goalKey && prev.goalKey !== cur.goalKey) out.push("You changed your goal, pace or profile.");
  if (prev.maintenanceSource !== cur.maintenanceSource && cur.maintenanceSource) {
    out.push(
      cur.maintenanceSource === "measured"
        ? "Your plan now uses your measured burn (from what you ate and your weight trend) instead of an estimate."
        : cur.maintenanceSource === "garmin"
          ? "Your plan now uses your watch's average daily burn instead of the formula."
          : "Your plan went back to the formula estimate (not enough recent watch or food data).",
    );
  } else if (prev.maintenance != null && cur.maintenance != null && Math.abs(cur.maintenance - prev.maintenance) >= 20) {
    const how =
      cur.maintenanceSource === "measured"
        ? "worked out from the last 4 weeks of food and weigh-ins"
        : cur.maintenanceSource === "garmin"
          ? "your watch's average over the last 14 days"
          : "estimated from your profile and weight";
    out.push(`Your daily burn went from ${fmt(prev.maintenance)} to ${fmt(cur.maintenance)} kcal (${how}).`);
  }
  if (prev.weight != null && cur.weight != null && Math.abs(cur.weight - prev.weight) >= 0.3) {
    out.push(`Your weight went from ${prev.weight.toFixed(1)} to ${cur.weight.toFixed(1)} kg, which changes your burn and protein.`);
  }
  if (cur.targetDate && prev.weeklyRate != null && cur.weeklyRate != null && Math.abs(cur.weeklyRate - prev.weeklyRate) >= 0.02) {
    out.push(
      cur.weeklyRate > prev.weeklyRate
        ? `Fewer days are left until your goal date, so the weekly pace went up (${prev.weeklyRate.toFixed(2)} to ${cur.weeklyRate.toFixed(2)} kg).`
        : `The weekly pace to your goal date went down (${prev.weeklyRate.toFixed(2)} to ${cur.weeklyRate.toFixed(2)} kg).`,
    );
  }
  if (!out.length) out.push("Recalculated from your latest weight and burn.");
  return out;
}

type Inputs = {
  userId: string;
  today: string;
  goals: GoalRow;
  plan: Plan;
  maintenance: { kcal: number; source: string } | null;
  weight: number | null;
  bonusToday: number;
  /** Data for back-filling past days (only used the first time). */
  history: {
    intake: Parameters<typeof measuredMaintenance>[0];
    weights: Parameters<typeof measuredMaintenance>[1];
    burn: Parameters<typeof garminMaintenance>[0];
  };
};

/** Back-fills the last few weeks from history, once, so past days don't jump to today's target. */
async function backfill(i: Inputs, existing: DailyTarget[]) {
  if (!i.goals) return;
  const have = new Set(existing.map((e) => e.date));
  const rows: (typeof dailyTargets.$inferInsert)[] = [];
  const key = goalKey(i.goals);
  for (let k = BACKFILL_DAYS; k >= 1; k--) {
    const d = addDaysStr(i.today, -k);
    if (have.has(d)) continue;
    const body = await latestBodyValues(i.userId, d);
    if (body.weight == null) continue;
    const m = chooseMaintenance(measuredMaintenance(i.history.intake, i.history.weights, d), garminMaintenance(i.history.burn, d));
    const plan = computePlan(planInputFrom(i.goals, body, Number(d.slice(0, 4)), m, d));
    const t = targetsFromPlan(plan);
    if (!t) continue;
    rows.push({
      userId: i.userId,
      date: d,
      calories: Math.round(t.calories),
      protein: t.protein,
      carbs: t.carbs,
      fat: t.fat,
      maintenance: plan.tdee,
      maintenanceSource: plan.maintenanceSource,
      weight: body.weight,
      weeklyRate: plan.effectiveWeeklyRate ?? plan.weeklyRate,
      goalKey: key,
      backfilled: true,
    });
  }
  // Smooth like the live rule, so the history doesn't wobble either.
  let last: (typeof rows)[number] | null = null;
  for (const r of rows) {
    if (last && Math.abs(r.calories - last.calories) < CAL_STEP && Math.abs((r.protein ?? 0) - (last.protein ?? 0)) < PROTEIN_STEP) {
      r.calories = last.calories;
      r.protein = last.protein;
      r.carbs = last.carbs;
      r.fat = last.fat;
    }
    last = r;
  }
  for (let k = 0; k < rows.length; k += 50) {
    await db.insert(dailyTargets).values(rows.slice(k, k + 50)).onConflictDoNothing();
  }
}

export async function lockTargets(i: Inputs): Promise<LockedTargets> {
  const computed = targetsFromPlan(i.plan);
  const from = addDaysStr(i.today, -120);
  let saved = await db
    .select()
    .from(dailyTargets)
    .where(and(eq(dailyTargets.userId, i.userId), between(dailyTargets.date, from, i.today)))
    .orderBy(asc(dailyTargets.date));

  if (!saved.some((s) => s.date < i.today) && computed) {
    await backfill(i, saved);
    saved = await db
      .select()
      .from(dailyTargets)
      .where(and(eq(dailyTargets.userId, i.userId), between(dailyTargets.date, from, i.today)))
      .orderBy(asc(dailyTargets.date));
  }

  const past = saved.filter((s) => s.date < i.today);
  const prev = past[past.length - 1] ?? null;
  const todayRow = saved.find((s) => s.date === i.today) ?? null;
  const key = goalKey(i.goals);

  let today: DailyTargets = computed;
  if (computed) {
    // Keep the last target unless the goal changed or the new one moved enough.
    const base = todayRow ?? prev;
    const goalChanged = !base || base.goalKey !== key;
    const small =
      base &&
      Math.abs(computed.calories - base.calories) < CAL_STEP &&
      Math.abs((computed.protein ?? 0) - (base.protein ?? 0)) < PROTEIN_STEP;
    if (!goalChanged && small && base) {
      today = { calories: base.calories, protein: base.protein, carbs: base.carbs, fat: base.fat };
    }
    const vals = {
      calories: Math.round(today!.calories),
      protein: today!.protein,
      carbs: today!.carbs,
      fat: today!.fat,
      bonus: i.bonusToday,
      maintenance: i.maintenance?.kcal ?? i.plan.tdee,
      maintenanceSource: i.plan.maintenanceSource,
      weight: i.weight,
      weeklyRate: i.plan.effectiveWeeklyRate ?? i.plan.weeklyRate,
      goalKey: key,
      updatedAt: new Date(),
    };
    const changed =
      !todayRow ||
      todayRow.calories !== vals.calories ||
      todayRow.protein !== vals.protein ||
      todayRow.bonus !== vals.bonus ||
      todayRow.goalKey !== vals.goalKey ||
      todayRow.maintenance !== vals.maintenance ||
      todayRow.weight !== vals.weight;
    if (changed) {
      await db
        .insert(dailyTargets)
        .values({ userId: i.userId, date: i.today, ...vals })
        .onConflictDoUpdate({ target: [dailyTargets.userId, dailyTargets.date], set: vals });
    }
  }

  const byDate: LockedTargets["byDate"] = {};
  const bonusByDate: Record<string, number> = {};
  for (const s of past) {
    byDate[s.date] = { calories: s.calories, protein: s.protein, carbs: s.carbs, fat: s.fat };
    if (s.bonus) bonusByDate[s.date] = s.bonus;
  }

  let change: TargetChange | null = null;
  if (today && prev && prev.calories !== Math.round(today.calories)) {
    change = {
      from: prev.calories,
      to: Math.round(today.calories),
      since: prev.date,
      reasons: reasonsFor(prev, {
        maintenance: i.maintenance?.kcal ?? i.plan.tdee,
        maintenanceSource: i.plan.maintenanceSource,
        weight: i.weight,
        weeklyRate: i.plan.effectiveWeeklyRate ?? i.plan.weeklyRate,
        goalKey: key,
        targetDate: i.goals?.targetDate ?? null,
      }),
    };
  }
  return { today, byDate, bonusByDate, change };
}

/** The target a past date had: its saved one, else the oldest saved one after it, else today's. */
export function targetFor(date: string, today: string, locked: Pick<LockedTargets, "today" | "byDate">): DailyTargets {
  if (date >= today) return locked.today;
  if (locked.byDate[date]) return locked.byDate[date];
  const later = Object.keys(locked.byDate)
    .filter((d) => d > date)
    .sort()[0];
  return later ? locked.byDate[later] : locked.today;
}
