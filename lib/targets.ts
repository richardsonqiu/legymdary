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
import { and, asc, between, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bodyStats, dailyTargets, garminDaily, meals, skippedMeals, type DailyTarget } from "@/db/schema";
import { bodyValuesAsOf } from "@/lib/body-values";
import { chooseMaintenance, garminMaintenance, measuredMaintenance } from "@/lib/energy";
import { computePlan, planInputFrom, targetsFromPlan, type DailyTargets, type Plan } from "@/lib/nutrition";
import { addDaysStr } from "@/lib/utils";

export const CAL_STEP = 50;
const PROTEIN_STEP = 10;
const HISTORY_DAYS = 3 * 365;

type GoalRow = (NonNullable<Parameters<typeof planInputFrom>[0]> & { targetMode?: string | null; relockedAt?: Date | null }) | null;

/** "steady" (default): only changes when you change your goal or update it. "adaptive": follows burn and weight. */
export const targetModeOf = (g: GoalRow): "steady" | "adaptive" => (g?.targetMode === "adaptive" ? "adaptive" : "steady");

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
    g.relockedAt ? new Date(g.relockedAt).getTime() : null,
  ]);
}

export type TargetChange = {
  from: number;
  to: number;
  /** The day the previous target belongs to. */
  since: string;
  reasons: Reason[];
};

export type LockedTargets = {
  /** Today's target (locked rules applied). */
  today: DailyTargets;
  /** Past days' saved targets (without the activity bonus), by date. */
  byDate: Record<string, NonNullable<DailyTargets>>;
  /** Saved activity bonus by date. */
  bonusByDate: Record<string, number>;
  change: TargetChange | null;
  /** Calories added to today's target (activity bonus, or eaten back after a big burn). */
  todayBonus: number;
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export type ReasonKind = "goal" | "source" | "burn" | "weight" | "pace" | "other";
export type Reason = { kind: ReasonKind; text: string; from?: number; to?: number };

function reasonsFor(prev: DailyTarget, cur: { maintenance: number | null; maintenanceSource: string | null; weight: number | null; weeklyRate: number | null; goalKey: string; targetDate: string | null }): Reason[] {
  const out: Reason[] = [];
  if (prev.goalKey && prev.goalKey !== cur.goalKey) out.push({ kind: "goal", text: "Goal, pace or profile changed, or you updated the target." });
  if (prev.maintenanceSource !== cur.maintenanceSource && cur.maintenanceSource) {
    out.push({
      kind: "source",
      text:
        cur.maintenanceSource === "measured"
          ? "Burn now measured from your food and weigh-ins."
          : cur.maintenanceSource === "garmin"
            ? "Burn now from your watch."
            : "Burn back to the formula estimate.",
    });
  } else if (prev.maintenance != null && cur.maintenance != null && Math.abs(cur.maintenance - prev.maintenance) >= 20) {
    out.push({ kind: "burn", text: `Daily burn ${fmt(prev.maintenance)} → ${fmt(cur.maintenance)} kcal.`, from: prev.maintenance, to: cur.maintenance });
  }
  if (prev.weight != null && cur.weight != null && Math.abs(cur.weight - prev.weight) >= 0.3) {
    out.push({ kind: "weight", text: `Weight ${prev.weight.toFixed(1)} → ${cur.weight.toFixed(1)} kg.`, from: prev.weight, to: cur.weight });
  }
  if (cur.targetDate && prev.weeklyRate != null && cur.weeklyRate != null && Math.abs(cur.weeklyRate - prev.weeklyRate) >= 0.02) {
    out.push({
      kind: "pace",
      text: `Pace to your goal date ${prev.weeklyRate.toFixed(2)} → ${cur.weeklyRate.toFixed(2)} kg a week.`,
      from: prev.weeklyRate,
      to: cur.weeklyRate,
    });
  }
  if (!out.length) out.push({ kind: "other", text: "Recalculated from your latest weight and burn." });
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

/**
 * Rebuilds the targets of days before the first saved one, as far back as
 * the user's data goes (up to 3 years), the way the app calculated them on
 * each day: that day's latest weight and body fat, and the burn measured
 * from the weeks before it. Goal settings have no history, so today's are
 * used. Runs once per user (later calls find nothing to fill).
 */
export async function backfillHistory(userId: string, today: string, goals: GoalRow): Promise<number> {
  if (!goals) return 0;
  const [first] = await db
    .select({ d: sql<string | null>`min(${dailyTargets.date})` })
    .from(dailyTargets)
    .where(eq(dailyTargets.userId, userId));
  const [dataStart] = await db
    .select({
      meal: sql<string | null>`(select min(${meals.date}) from ${meals} where ${meals.userId} = ${userId})`,
      body: sql<string | null>`(select min(${bodyStats.date}) from ${bodyStats} where ${bodyStats.userId} = ${userId} and ${bodyStats.weight} is not null)`,
    })
    .from(sql`(select 1)`);
  const starts = [dataStart?.meal, dataStart?.body].filter((x): x is string => !!x).sort();
  if (!starts.length) return 0;
  const start = starts[0] > addDaysStr(today, -HISTORY_DAYS) ? starts[0] : addDaysStr(today, -HISTORY_DAYS);
  const end = first?.d ? addDaysStr(first.d, -1) : addDaysStr(today, -1);
  if (start > end) return 0;

  const lookback = addDaysStr(start, -35);
  const [mealRows, skipRows, bodyRows, burnRows] = await Promise.all([
    db
      .select({ date: meals.date, calories: sql<number>`sum(${meals.calories})`, count: sql<number>`count(*)` })
      .from(meals)
      .where(and(eq(meals.userId, userId), between(meals.date, lookback, end)))
      .groupBy(meals.date),
    db
      .select({ date: skippedMeals.date, n: sql<number>`count(*)` })
      .from(skippedMeals)
      .where(and(eq(skippedMeals.userId, userId), between(skippedMeals.date, lookback, end)))
      .groupBy(skippedMeals.date),
    db
      .select({ date: bodyStats.date, weight: bodyStats.weight, bodyFat: bodyStats.bodyFat, source: bodyStats.source })
      .from(bodyStats)
      .where(and(eq(bodyStats.userId, userId), lte(bodyStats.date, end)))
      .orderBy(asc(bodyStats.date)),
    db
      .select({ date: garminDaily.date, totalKcal: garminDaily.totalKcal, activeKcal: garminDaily.activeKcal })
      .from(garminDaily)
      .where(and(eq(garminDaily.userId, userId), between(garminDaily.date, lookback, end))),
  ]);
  const skips = new Map(skipRows.map((r) => [r.date, Number(r.n)]));
  const intake = mealRows.map((m) => ({
    date: m.date,
    calories: Number(m.calories),
    protein: 0,
    carbs: 0,
    fat: 0,
    count: Number(m.count),
    skipped: skips.get(m.date) ?? 0,
  }));
  const weights = bodyRows.filter((b) => b.weight != null).map((b) => ({ date: b.date, weight: b.weight as number }));
  const key = goalKey(goals);
  const rows: (typeof dailyTargets.$inferInsert)[] = [];
  for (let d = start; d <= end; d = addDaysStr(d, 1)) {
    const body = bodyValuesAsOf(bodyRows, d);
    if (body.weight == null) continue;
    const m = chooseMaintenance(measuredMaintenance(intake, weights, d), garminMaintenance(burnRows, d));
    const plan = computePlan(planInputFrom(goals, body, Number(d.slice(0, 4)), m, d));
    const t = targetsFromPlan(plan);
    if (!t) continue;
    rows.push({
      userId,
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
  for (let k = 0; k < rows.length; k += 100) {
    await db.insert(dailyTargets).values(rows.slice(k, k + 100)).onConflictDoNothing();
  }
  return rows.length;
}

/** Days between the last saved target and today that nobody opened: they had the same target. */
async function fillGaps(userId: string, prev: DailyTarget, today: string) {
  const rows: (typeof dailyTargets.$inferInsert)[] = [];
  for (let d = addDaysStr(prev.date, 1); d < today && rows.length < HISTORY_DAYS; d = addDaysStr(d, 1)) {
    const { id: _id, date: _date, updatedAt: _u, ...rest } = prev;
    void _id;
    void _date;
    void _u;
    rows.push({ ...rest, userId, date: d, bonus: 0, backfilled: true });
  }
  for (let k = 0; k < rows.length; k += 100) {
    await db.insert(dailyTargets).values(rows.slice(k, k + 100)).onConflictDoNothing();
  }
  return rows.length;
}

export async function lockTargets(i: Inputs): Promise<LockedTargets> {
  const computed = targetsFromPlan(i.plan);
  const from = addDaysStr(i.today, -120);
  let saved = await db
    .select()
    .from(dailyTargets)
    .where(and(eq(dailyTargets.userId, i.userId), between(dailyTargets.date, from, i.today)))
    .orderBy(asc(dailyTargets.date));

  // Existing users: rebuild the days before the first saved target, once.
  // Days skipped since the last visit keep the last target.
  const lastPast = [...saved].reverse().find((s) => s.date < i.today) ?? null;
  const filled =
    (!saved.some((s) => s.date < i.today) && computed ? await backfillHistory(i.userId, i.today, i.goals) : 0) +
    (lastPast && lastPast.date < addDaysStr(i.today, -1) ? await fillGaps(i.userId, lastPast, i.today) : 0);
  if (filled) {
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
    // Steady: keep the number until the goal changes. Adaptive: ignore small wobbles only.
    const keep =
      targetModeOf(i.goals) === "steady" ||
      (base &&
        Math.abs(computed.calories - base.calories) < CAL_STEP &&
        Math.abs((computed.protein ?? 0) - (base.protein ?? 0)) < PROTEIN_STEP);
    if (!goalChanged && keep && base) {
      today = { calories: base.calories, protein: base.protein, carbs: base.carbs, fat: base.fat };
    }
    const vals = {
      calories: Math.round(today!.calories),
      protein: today!.protein,
      carbs: today!.carbs,
      fat: today!.fat,
      // Steady: no automatic bonus, but keep calories the user chose to eat back today.
      bonus: targetModeOf(i.goals) === "steady" ? (todayRow?.bonus ?? 0) : i.bonusToday,
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
  const todayBonus = targetModeOf(i.goals) === "steady" ? (todayRow?.bonus ?? 0) : i.bonusToday;
  return { today, byDate, bonusByDate, change, todayBonus };
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
