import {
  and,
  asc,
  between,
  desc,
  gte,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
} from "drizzle-orm";
import { db } from "@/db";
import {
  aiUsage,
  bodyStats,
  exercises,
  goals,
  meals,
  templateExercises,
  templates,
  sets,
  workoutExercises,
  workouts,
  type BodyStat,
  type Exercise,
  type Goals,
  type Meal,
} from "@/db/schema";
import { requireUserId } from "@/lib/session";
import {
  addDaysStr,
  estimate1RM,
  startOfWeekStr,
  todayStr,
} from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Shared shapes                                                       */
/* ------------------------------------------------------------------ */

export type LoggedSet = {
  id: number;
  reps: number;
  weight: number;
  isWarmup: boolean;
  notes: string | null;
};

export type WorkoutExerciseDetail = {
  workoutExerciseId: number;
  exerciseId: number;
  name: string;
  muscleGroup: string;
  equipment: string;
  sets: LoggedSet[];
};

export type WorkoutDetail = {
  id: number;
  name: string;
  date: string;
  notes: string | null;
  finished: boolean;
  exercises: WorkoutExerciseDetail[];
  totalSets: number;
  totalVolume: number;
  exerciseCount: number;
};

export type PRRow = {
  exerciseId: number;
  exerciseName: string;
  muscleGroup: string;
  equipment: string;
  weight: number;
  reps: number;
  e1rm: number;
  date: string;
};

type RawWorkout = {
  id: number;
  name: string;
  date: string;
  notes: string | null;
  finishedAt: Date | null;
  workoutExercises: {
    id: number;
    exerciseId: number;
    exercise: Exercise;
    sets: {
      id: number;
      reps: number;
      weight: number;
      isWarmup: boolean;
      notes: string | null;
    }[];
  }[];
};

function toDetail(w: RawWorkout): WorkoutDetail {
  let totalSets = 0;
  let totalVolume = 0;
  const exercisesOut: WorkoutExerciseDetail[] = w.workoutExercises.map((we) => {
    const setsOut: LoggedSet[] = we.sets.map((s) => {
      if (!s.isWarmup) {
        totalSets += 1;
        totalVolume += s.weight * s.reps;
      }
      return {
        id: s.id,
        reps: s.reps,
        weight: s.weight,
        isWarmup: s.isWarmup,
        notes: s.notes,
      };
    });
    return {
      workoutExerciseId: we.id,
      exerciseId: we.exerciseId,
      name: we.exercise.name,
      muscleGroup: we.exercise.muscleGroup,
      equipment: we.exercise.equipment,
      sets: setsOut,
    };
  });

  return {
    id: w.id,
    name: w.name,
    date: w.date,
    notes: w.notes,
    finished: w.finishedAt !== null,
    exercises: exercisesOut,
    totalSets,
    totalVolume,
    exerciseCount: exercisesOut.length,
  };
}

/* ------------------------------------------------------------------ */
/* Workouts (scoped to the signed-in user)                             */
/* ------------------------------------------------------------------ */

export async function getActiveWorkout(): Promise<WorkoutDetail | null> {
  const userId = await requireUserId();
  const w = await db.query.workouts.findFirst({
    where: and(isNull(workouts.finishedAt), eq(workouts.userId, userId)),
    orderBy: desc(workouts.createdAt),
    with: {
      workoutExercises: {
        orderBy: (f, ops) => ops.asc(f.position),
        with: {
          exercise: true,
          sets: { orderBy: (f, ops) => ops.asc(f.position) },
        },
      },
    },
  });
  return w ? toDetail(w as RawWorkout) : null;
}

export async function getWorkoutDetails(): Promise<WorkoutDetail[]> {
  const userId = await requireUserId();
  const ws = await db.query.workouts.findMany({
    where: eq(workouts.userId, userId),
    orderBy: desc(workouts.date),
    with: {
      workoutExercises: {
        orderBy: (f, ops) => ops.asc(f.position),
        with: {
          exercise: true,
          sets: { orderBy: (f, ops) => ops.asc(f.position) },
        },
      },
    },
  });
  return ws.map((w) => toDetail(w as RawWorkout));
}

/** Distinct calendar days on which the user logged at least one working set. */
export async function getWorkoutDates(): Promise<string[]> {
  const userId = await requireUserId();
  const rows = await db
    .selectDistinct({ date: workouts.date })
    .from(workouts)
    .innerJoin(workoutExercises, eq(workoutExercises.workoutId, workouts.id))
    .innerJoin(sets, eq(sets.workoutExerciseId, workoutExercises.id))
    .where(and(eq(workouts.userId, userId), eq(sets.isWarmup, false)));
  return rows.map((r) => r.date);
}

/** Most recent finished workout, fetched directly (not the whole history). */
export async function getLastFinishedWorkout(): Promise<WorkoutDetail | null> {
  const userId = await requireUserId();
  const w = await db.query.workouts.findFirst({
    where: and(
      eq(workouts.userId, userId),
      isNotNull(workouts.finishedAt),
    ),
    orderBy: [desc(workouts.date), desc(workouts.id)],
    with: {
      workoutExercises: {
        orderBy: (f, ops) => ops.asc(f.position),
        with: {
          exercise: true,
          sets: { orderBy: (f, ops) => ops.asc(f.position) },
        },
      },
    },
  });
  return w ? toDetail(w as RawWorkout) : null;
}

export type LastPerf = {
  date: string;
  sets: { weight: number; reps: number }[];
};

/**
 * For each of the given exercises, the working sets from the user's most recent
 * *other* workout that contained it — the "last time" reference while logging.
 */
export async function getLastPerformances(
  currentWorkoutId: number,
  exerciseIds: number[],
): Promise<Record<number, LastPerf>> {
  const userId = await requireUserId();
  if (exerciseIds.length === 0) return {};

  const rows = await db
    .select({
      exerciseId: workoutExercises.exerciseId,
      workoutId: workouts.id,
      date: workouts.date,
      reps: sets.reps,
      weight: sets.weight,
      position: sets.position,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(
      and(
        eq(workouts.userId, userId),
        eq(sets.isWarmup, false),
        ne(workouts.id, currentWorkoutId),
        inArray(workoutExercises.exerciseId, exerciseIds),
      ),
    );

  type Wk = {
    date: string;
    sets: { weight: number; reps: number; position: number }[];
  };
  const perEx = new Map<number, Map<number, Wk>>();
  for (const r of rows) {
    let byWorkout = perEx.get(r.exerciseId);
    if (!byWorkout) {
      byWorkout = new Map();
      perEx.set(r.exerciseId, byWorkout);
    }
    let wk = byWorkout.get(r.workoutId);
    if (!wk) {
      wk = { date: r.date, sets: [] };
      byWorkout.set(r.workoutId, wk);
    }
    wk.sets.push({ weight: r.weight, reps: r.reps, position: r.position });
  }

  const out: Record<number, LastPerf> = {};
  for (const [exId, byWorkout] of perEx) {
    let bestId = -1;
    let best: Wk | null = null;
    for (const [wid, wk] of byWorkout) {
      if (
        !best ||
        wk.date > best.date ||
        (wk.date === best.date && wid > bestId)
      ) {
        best = wk;
        bestId = wid;
      }
    }
    if (best) {
      out[exId] = {
        date: best.date,
        sets: best.sets
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ weight: s.weight, reps: s.reps })),
      };
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Exercises (built-in library + this user's custom ones)              */
/* ------------------------------------------------------------------ */

export async function getAllExercises(): Promise<Exercise[]> {
  const userId = await requireUserId();
  return db
    .select()
    .from(exercises)
    .where(or(isNull(exercises.userId), eq(exercises.userId, userId)))
    .orderBy(asc(exercises.name));
}

export async function getExercisesWithHistory(): Promise<
  { id: number; name: string }[]
> {
  const userId = await requireUserId();
  return db
    .selectDistinct({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .innerJoin(workoutExercises, eq(workoutExercises.exerciseId, exercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(workouts.userId, userId))
    .orderBy(asc(exercises.name));
}

/* ------------------------------------------------------------------ */
/* Personal records                                                    */
/* ------------------------------------------------------------------ */

export async function getAllPRs(): Promise<PRRow[]> {
  const userId = await requireUserId();
  const rows = await db
    .select({
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      muscleGroup: exercises.muscleGroup,
      equipment: exercises.equipment,
      reps: sets.reps,
      weight: sets.weight,
      date: workouts.date,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(eq(sets.isWarmup, false), eq(workouts.userId, userId)));

  const best = new Map<number, PRRow>();
  for (const r of rows) {
    const e1rm = estimate1RM(r.weight, r.reps);
    if (e1rm <= 0) continue;
    const cur = best.get(r.exerciseId);
    if (!cur || e1rm > cur.e1rm) best.set(r.exerciseId, { ...r, e1rm });
  }
  return [...best.values()].sort((a, b) => b.e1rm - a.e1rm);
}

export async function getPRsThisWeek(): Promise<PRRow[]> {
  const prs = await getAllPRs();
  const weekStart = startOfWeekStr();
  return prs.filter((p) => p.date >= weekStart);
}

/* ------------------------------------------------------------------ */
/* Progress + volume                                                   */
/* ------------------------------------------------------------------ */

export type ProgressPoint = {
  date: string;
  topWeight: number;
  volume: number;
  bestE1rm: number;
};

export async function getAllExerciseProgress(): Promise<{
  exercises: { id: number; name: string }[];
  byExercise: Record<number, ProgressPoint[]>;
}> {
  const userId = await requireUserId();
  const rows = await db
    .select({
      exerciseId: exercises.id,
      name: exercises.name,
      date: workouts.date,
      reps: sets.reps,
      weight: sets.weight,
    })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(eq(sets.isWarmup, false), eq(workouts.userId, userId)));

  const names = new Map<number, string>();
  const tmp = new Map<number, Map<string, ProgressPoint>>();
  for (const r of rows) {
    names.set(r.exerciseId, r.name);
    let m = tmp.get(r.exerciseId);
    if (!m) {
      m = new Map();
      tmp.set(r.exerciseId, m);
    }
    const e =
      m.get(r.date) ??
      ({ date: r.date, topWeight: 0, volume: 0, bestE1rm: 0 } as ProgressPoint);
    e.topWeight = Math.max(e.topWeight, r.weight);
    e.volume += r.weight * r.reps;
    e.bestE1rm = Math.max(e.bestE1rm, estimate1RM(r.weight, r.reps));
    m.set(r.date, e);
  }

  const byExercise: Record<number, ProgressPoint[]> = {};
  for (const [id, m] of tmp) {
    byExercise[id] = [...m.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }
  const exList = [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { exercises: exList, byExercise };
}

export async function getWeeklyVolume(
  weeks = 12,
): Promise<{ week: string; sets: number }[]> {
  const userId = await requireUserId();
  const rows = await db
    .select({ date: workouts.date })
    .from(sets)
    .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(and(eq(sets.isWarmup, false), eq(workouts.userId, userId)));

  const byWeek = new Map<string, number>();
  for (const r of rows) {
    const wk = startOfWeekStr(r.date);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + 1);
  }

  const out: { week: string; sets: number }[] = [];
  let cur = startOfWeekStr(todayStr());
  for (let i = 0; i < weeks; i++) {
    out.push({ week: cur, sets: byWeek.get(cur) ?? 0 });
    cur = addDaysStr(cur, -7);
  }
  return out.reverse();
}

/* ------------------------------------------------------------------ */
/* Body stats                                                          */
/* ------------------------------------------------------------------ */

export async function getBodyStats(): Promise<BodyStat[]> {
  const userId = await requireUserId();
  return db
    .select()
    .from(bodyStats)
    .where(eq(bodyStats.userId, userId))
    .orderBy(asc(bodyStats.date));
}

export async function getLatestBodyStat(): Promise<BodyStat | null> {
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(bodyStats)
    .where(eq(bodyStats.userId, userId))
    .orderBy(desc(bodyStats.date))
    .limit(1);
  return rows[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Food log + goals                                                    */
/* ------------------------------------------------------------------ */

/** Meals (with thumbnails) for an inclusive range of calendar days. */
export async function getMeals(from: string, to: string): Promise<Meal[]> {
  const userId = await requireUserId();
  return db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), between(meals.date, from, to)))
    .orderBy(asc(meals.date), asc(meals.createdAt));
}

export type DayTotals = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  count: number;
};

/** Per-day calorie/macro totals (no photos) — light enough for dashboards. */
export async function getDailyTotals(
  from: string,
  to: string,
): Promise<DayTotals[]> {
  const userId = await requireUserId();
  const rows = await db
    .select({
      date: meals.date,
      calories: meals.calories,
      protein: meals.protein,
      carbs: meals.carbs,
      fat: meals.fat,
    })
    .from(meals)
    .where(and(eq(meals.userId, userId), between(meals.date, from, to)));
  const byDate = new Map<string, DayTotals>();
  for (const r of rows) {
    const d =
      byDate.get(r.date) ??
      { date: r.date, calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
    d.calories += r.calories;
    d.protein += r.protein;
    d.carbs += r.carbs;
    d.fat += r.fat;
    d.count += 1;
    byDate.set(r.date, d);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export async function getGoals(): Promise<Goals | null> {
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/** Latest known weight and body fat, each from its most recent entry. */
export async function getLatestBodyValues(): Promise<{
  weight: number | null;
  weightDate: string | null;
  bodyFat: number | null;
  bodyFatDate: string | null;
}> {
  const userId = await requireUserId();
  const [w] = await db
    .select({ v: bodyStats.weight, date: bodyStats.date })
    .from(bodyStats)
    .where(and(eq(bodyStats.userId, userId), isNotNull(bodyStats.weight)))
    .orderBy(desc(bodyStats.date))
    .limit(1);
  const [bf] = await db
    .select({ v: bodyStats.bodyFat, date: bodyStats.date })
    .from(bodyStats)
    .where(and(eq(bodyStats.userId, userId), isNotNull(bodyStats.bodyFat)))
    .orderBy(desc(bodyStats.date))
    .limit(1);
  return {
    weight: w?.v ?? null,
    weightDate: w?.date ?? null,
    bodyFat: bf?.v ?? null,
    bodyFatDate: bf?.date ?? null,
  };
}

/** Most recent distinct meals (by name) for one-tap "eat again". */
export async function getRecentMeals(limit = 6): Promise<Meal[]> {
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(meals)
    .where(eq(meals.userId, userId))
    .orderBy(desc(meals.createdAt))
    .limit(60);
  const seen = new Set<string>();
  const out: Meal[] = [];
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export type AiUsageSummary = {
  calls: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  byModel: { model: string; calls: number; costUsd: number }[];
};

/** AI calls + estimated spend since a given instant. */
export async function getAiUsageSince(since: Date): Promise<AiUsageSummary> {
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, since)));
  const byModel = new Map<string, { model: string; calls: number; costUsd: number }>();
  let costUsd = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const r of rows) {
    costUsd += r.costUsd;
    inputTokens += r.inputTokens;
    outputTokens += r.outputTokens;
    const m = byModel.get(r.model) ?? { model: r.model, calls: 0, costUsd: 0 };
    m.calls += 1;
    m.costUsd += r.costUsd;
    byModel.set(r.model, m);
  }
  return {
    calls: rows.length,
    costUsd,
    inputTokens,
    outputTokens,
    byModel: [...byModel.values()].sort((a, b) => b.calls - a.calls),
  };
}

export type TemplateSummary = {
  id: number;
  name: string;
  lastUsedAt: Date | null;
  exercises: { name: string; targetSets: number | null }[];
};

export async function getTemplates(): Promise<TemplateSummary[]> {
  const userId = await requireUserId();
  const tpls = await db
    .select()
    .from(templates)
    .where(eq(templates.userId, userId))
    .orderBy(desc(templates.lastUsedAt), desc(templates.createdAt));
  if (!tpls.length) return [];
  const items = await db
    .select({
      templateId: templateExercises.templateId,
      position: templateExercises.position,
      targetSets: templateExercises.targetSets,
      name: exercises.name,
    })
    .from(templateExercises)
    .innerJoin(exercises, eq(templateExercises.exerciseId, exercises.id))
    .where(inArray(templateExercises.templateId, tpls.map((t) => t.id)))
    .orderBy(asc(templateExercises.position));
  return tpls.map((t) => ({
    id: t.id,
    name: t.name,
    lastUsedAt: t.lastUsedAt,
    exercises: items
      .filter((i) => i.templateId === t.id)
      .map((i) => ({ name: i.name, targetSets: i.targetSets })),
  }));
}

export type WeekStats = {
  workouts: number;
  sets: number;
  volume: number;
  daysLogged: number;
  avgCalories: number | null;
  avgProtein: number | null;
};

export type WeeklyCheckin = {
  weekStart: string;
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  /** Daily totals for this week, to count target hits against the plan. */
  days: DayTotals[];
  weightNow: number | null;
  weightWeekAgo: number | null;
};

/** This week (Mon→today) vs the full previous week. */
export async function getWeeklyCheckin(): Promise<WeeklyCheckin> {
  const userId = await requireUserId();
  const weekStart = startOfWeekStr(todayStr());
  const lastStart = addDaysStr(weekStart, -7);
  const end = addDaysStr(weekStart, 6);

  const [setRows, totals, weights] = await Promise.all([
    db
      .select({
        date: workouts.date,
        workoutId: workouts.id,
        reps: sets.reps,
        weight: sets.weight,
        isWarmup: sets.isWarmup,
      })
      .from(sets)
      .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .where(and(eq(workouts.userId, userId), between(workouts.date, lastStart, end))),
    getDailyTotals(lastStart, end),
    db
      .select({ date: bodyStats.date, weight: bodyStats.weight })
      .from(bodyStats)
      .where(
        and(
          eq(bodyStats.userId, userId),
          isNotNull(bodyStats.weight),
          gte(bodyStats.date, addDaysStr(todayStr(), -21)),
        ),
      )
      .orderBy(asc(bodyStats.date)),
  ]);

  function stats(from: string, to: string): WeekStats {
    const rows = setRows.filter((r) => r.date >= from && r.date <= to && !r.isWarmup);
    const days = totals.filter((t) => t.date >= from && t.date <= to);
    return {
      workouts: new Set(rows.map((r) => r.workoutId)).size,
      sets: rows.length,
      volume: rows.reduce((a, r) => a + r.weight * r.reps, 0),
      daysLogged: days.length,
      avgCalories: days.length
        ? days.reduce((a, d) => a + d.calories, 0) / days.length
        : null,
      avgProtein: days.length
        ? days.reduce((a, d) => a + d.protein, 0) / days.length
        : null,
    };
  }

  const latest = weights[weights.length - 1];
  const weekAgoTarget = latest ? addDaysStr(latest.date, -7) : null;
  // Closest weigh-in at or before 7 days earlier (within the 3-week window).
  const weekAgo = weekAgoTarget
    ? [...weights].reverse().find((w) => w.date <= weekAgoTarget)
    : undefined;

  return {
    weekStart,
    thisWeek: stats(weekStart, end),
    lastWeek: stats(lastStart, addDaysStr(weekStart, -1)),
    days: totals.filter((t) => t.date >= weekStart),
    weightNow: latest?.weight ?? null,
    weightWeekAgo: weekAgo?.weight ?? null,
  };
}
