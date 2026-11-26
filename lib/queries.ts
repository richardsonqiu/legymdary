import { cache } from "react";
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
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  appleHealthImports,
  bodyScans,
  bodyStats,
  exercises,
  garminActivities,
  garminConnections,
  garminDaily,
  goals,
  meals,
  templateExercises,
  templates,
  sets,
  workoutExercises,
  workouts,
  type BodyScan,
  type BodyStat,
  type Exercise,
  type GarminActivity,
  type GarminDaily,
  type Goals,
  type Meal,
  skippedMeals,
  savedMeals,
  sheetImports,
  ouraConnections,
  garminRaw,
  dailyTargets,
  type SavedMeal,
} from "@/db/schema";
import { latestBodyValues } from "@/lib/body-values";
import { getPrefs } from "@/lib/sources";
import { requireUserId, userTimeZone, userToday } from "@/lib/session";
import { localDateMinutes, type ConsistencyDay, mealQuality, SLOT_MINUTES, type TimedMeal, addDaysStr, estimate1RM, startOfWeekStr } from "@legymdary/shared";

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
  /** Plan for this exercise (recommended session or template). */
  targetSets: number | null;
  targetReps: string | null;
  targetWeight: number | null;
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
  /** When the session was started (for the live timer). */
  startedAt: string | null;
  /** Watch activity this session's exercises belong to. */
  garminActivityId: string | null;
  planKey: string | null;
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
  createdAt?: Date | null;
  garminActivityId?: string | null;
  planKey?: string | null;
  workoutExercises: {
    id: number;
    exerciseId: number;
    targetSets?: number | null;
    targetReps?: string | null;
    targetWeight?: number | null;
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
      targetSets: we.targetSets ?? null,
      targetReps: we.targetReps ?? null,
      targetWeight: we.targetWeight ?? null,
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
    startedAt: w.createdAt ? w.createdAt.toISOString() : null,
    garminActivityId: w.garminActivityId ?? null,
    planKey: w.planKey ?? null,
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
  const weekStart = startOfWeekStr(await userToday());
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
  let cur = startOfWeekStr((await userToday()));
  for (let i = 0; i < weeks; i++) {
    out.push({ week: cur, sets: byWeek.get(cur) ?? 0 });
    cur = addDaysStr(cur, -7);
  }
  return out.reverse();
}

export type TrainingWeek = {
  week: string;
  gymSessions: number;
  gymMin: number;
  garminSessions: number;
  garminMin: number;
};
export type ActivityTypeSummary = { type: string; count: number; minutes: number; km: number; kcal: number };

/**
 * All training per week — gym sessions logged here plus Garmin activities —
 * and a by-type breakdown of the last 90 days of Garmin activities.
 */
export async function getTrainingOverview(weeks = 12): Promise<{
  weeks: TrainingWeek[];
  types: ActivityTypeSummary[];
}> {
  const userId = await requireUserId();
  const today = (await userToday());
  const from = addDaysStr(startOfWeekStr(today), -7 * (weeks - 1));
  const [gym, acts] = await Promise.all([
    db
      .select({ date: workouts.date, createdAt: workouts.createdAt, finishedAt: workouts.finishedAt })
      .from(workouts)
      .where(and(eq(workouts.userId, userId), gte(workouts.date, from), isNotNull(workouts.finishedAt))),
    db
      .select({
        date: garminActivities.date,
        type: garminActivities.type,
        durationSec: garminActivities.durationSec,
        distanceM: garminActivities.distanceM,
        calories: garminActivities.calories,
      })
      .from(garminActivities)
      .where(and(eq(garminActivities.userId, userId), eq(garminActivities.excluded, false), notLinked(userId), gte(garminActivities.date, addDaysStr(today, -90)))),
  ]);
  const byWeek = new Map<string, TrainingWeek>();
  let cur = from;
  for (let i = 0; i < weeks; i++) {
    byWeek.set(cur, { week: cur, gymSessions: 0, gymMin: 0, garminSessions: 0, garminMin: 0 });
    cur = addDaysStr(cur, 7);
  }
  for (const w of gym) {
    const row = byWeek.get(startOfWeekStr(w.date));
    if (!row) continue;
    row.gymSessions++;
    // Session length from start to finish, clamped to something plausible.
    const min = w.finishedAt && w.createdAt ? (w.finishedAt.getTime() - w.createdAt.getTime()) / 60000 : 45;
    row.gymMin += Math.round(Math.min(180, Math.max(10, min)));
  }
  const types = new Map<string, ActivityTypeSummary>();
  for (const a of acts) {
    const row = a.date >= from ? byWeek.get(startOfWeekStr(a.date)) : undefined;
    if (row) {
      row.garminSessions++;
      row.garminMin += Math.round((a.durationSec ?? 0) / 60);
    }
    const t = a.type ?? "other";
    const s = types.get(t) ?? { type: t, count: 0, minutes: 0, km: 0, kcal: 0 };
    s.count++;
    s.minutes += (a.durationSec ?? 0) / 60;
    s.km += (a.distanceM ?? 0) / 1000;
    s.kcal += a.calories ?? 0;
    types.set(t, s);
  }
  return {
    weeks: [...byWeek.values()],
    types: [...types.values()]
      .map((t) => ({ ...t, minutes: Math.round(t.minutes), km: Math.round(t.km * 10) / 10, kcal: Math.round(t.kcal) }))
      .sort((a, b) => b.minutes - a.minutes),
  };
}

/* ------------------------------------------------------------------ */
/* Body stats                                                          */
/* ------------------------------------------------------------------ */

/** Cached per request: several components on a page share it. */
export const getBodyStats = cache(async function getBodyStats(): Promise<BodyStat[]> {
  const userId = await requireUserId();
  return db
    .select()
    .from(bodyStats)
    .where(eq(bodyStats.userId, userId))
    .orderBy(asc(bodyStats.date));
});

/** Cached per request: several components on a page share it. */
export const getLatestBodyStat = cache(async function getLatestBodyStat(): Promise<BodyStat | null> {
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(bodyStats)
    .where(eq(bodyStats.userId, userId))
    .orderBy(desc(bodyStats.date))
    .limit(1);
  return rows[0] ?? null;
});

/* ------------------------------------------------------------------ */
/* Food log + goals                                                    */
/* ------------------------------------------------------------------ */

/** Meals (with thumbnails) for an inclusive range of calendar days. */
/**
 * Meal columns without the photo blob; `photo` becomes a URL to
 * /api/meal-photo/<id> (browser-cached) so page payloads stay small.
 */
const mealCols = {
  id: meals.id,
  userId: meals.userId,
  date: meals.date,
  mealType: meals.mealType,
  name: meals.name,
  calories: meals.calories,
  protein: meals.protein,
  carbs: meals.carbs,
  fat: meals.fat,
  items: meals.items,
  notes: meals.notes,
  aiEstimated: meals.aiEstimated,
  eatenAt: meals.eatenAt,
  fiber: meals.fiber,
  sugar: meals.sugar,
  processing: meals.processing,
  advisor: meals.advisor,
  createdAt: meals.createdAt,
  hasPhoto: sql<number>`${meals.photo} is not null`,
};
type MealRowLite = Omit<Meal, "photo"> & { hasPhoto: number };
const withPhotoUrl = ({ hasPhoto, ...m }: MealRowLite): Meal => ({
  ...m,
  photo: hasPhoto ? `/api/meal-photo/${m.id}` : null,
});

export async function getMeals(from: string, to: string): Promise<Meal[]> {
  const userId = await requireUserId();
  const rows = await db
    .select(mealCols)
    .from(meals)
    .where(and(eq(meals.userId, userId), between(meals.date, from, to)))
    .orderBy(asc(meals.date), asc(meals.createdAt));
  return rows.map(withPhotoUrl);
}

/** One meal (with its photo URL), or null if it isn't yours. */
export async function getMeal(id: number): Promise<Meal | null> {
  const userId = await requireUserId();
  if (!Number.isInteger(id) || id <= 0) return null;
  const [row] = await db
    .select(mealCols)
    .from(meals)
    .where(and(eq(meals.id, id), eq(meals.userId, userId)))
    .limit(1);
  return row ? withPhotoUrl(row) : null;
}

/**
 * When a meal was eaten, in minutes after midnight. Older meals have no time
 * saved: use when it was logged if that was the same day, else the slot's
 * usual time.
 */
export function mealMinutes(m: Pick<Meal, "eatenAt" | "createdAt" | "date" | "mealType">, tz: string | null): { minutes: number; estimated: boolean } {
  if (m.eatenAt != null) return { minutes: m.eatenAt, estimated: false };
  if (tz && m.createdAt) {
    const local = localDateMinutes(new Date(m.createdAt), tz);
    if (local.date === m.date) return { minutes: local.minutes, estimated: true };
  }
  return { minutes: SLOT_MINUTES[m.mealType] ?? SLOT_MINUTES.snack, estimated: true };
}

/** Meals with their time and quality band, for the timing clock and charts. */
export async function getTimedMeals(from: string, to: string): Promise<(TimedMeal & { id: number; name: string; mealType: string; estimated: boolean })[]> {
  const userId = await requireUserId();
  const tz = await userTimeZone();
  const rows = await db
    .select({
      id: meals.id,
      date: meals.date,
      name: meals.name,
      mealType: meals.mealType,
      calories: meals.calories,
      protein: meals.protein,
      carbs: meals.carbs,
      fat: meals.fat,
      fiber: meals.fiber,
      sugar: meals.sugar,
      processing: meals.processing,
      eatenAt: meals.eatenAt,
      createdAt: meals.createdAt,
    })
    .from(meals)
    .where(and(eq(meals.userId, userId), between(meals.date, from, to)))
    .orderBy(asc(meals.date), asc(meals.createdAt));
  return rows.map((r) => {
    const t = mealMinutes(r, tz);
    return { id: r.id, date: r.date, name: r.name, mealType: r.mealType, calories: r.calories, minutes: t.minutes, estimated: t.estimated, band: mealQuality(r).band };
  });
}

export type DayTotals = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  count: number;
  /** Meals marked as skipped that day. */
  skipped: number;
};

/** Meal names and calories for a range (no photos): for recaps. */
export async function getMealNames(from: string, to: string): Promise<{ date: string; name: string; calories: number }[]> {
  const userId = await requireUserId();
  return db
    .select({ date: meals.date, name: meals.name, calories: meals.calories })
    .from(meals)
    .where(and(eq(meals.userId, userId), between(meals.date, from, to)));
}

/** "My menu": pinned and custom meals, newest first. */
export async function getMenu(): Promise<SavedMeal[]> {
  const userId = await requireUserId();
  return db.select().from(savedMeals).where(eq(savedMeals.userId, userId)).orderBy(desc(savedMeals.createdAt));
}

/** Meals the user marked as skipped, for a date range. */
export async function getSkippedMeals(from: string, to: string): Promise<{ date: string; mealType: string }[]> {
  const userId = await requireUserId();
  return db
    .select({ date: skippedMeals.date, mealType: skippedMeals.mealType })
    .from(skippedMeals)
    .where(and(eq(skippedMeals.userId, userId), between(skippedMeals.date, from, to)));
}

/** Which meal slots have food logged or are skipped on a day (light: no photos). */
export async function getMealSlots(date: string): Promise<{ logged: string[]; skipped: string[] }> {
  const userId = await requireUserId();
  const [m, s] = await Promise.all([
    db.select({ t: meals.mealType }).from(meals).where(and(eq(meals.userId, userId), eq(meals.date, date))),
    db.select({ t: skippedMeals.mealType }).from(skippedMeals).where(and(eq(skippedMeals.userId, userId), eq(skippedMeals.date, date))),
  ]);
  return { logged: [...new Set(m.map((x) => x.t))], skipped: s.map((x) => x.t) };
}

/** Per-day calorie/macro totals (no photos) — light enough for dashboards. */
export async function getDailyTotals(
  from: string,
  to: string,
): Promise<DayTotals[]> {
  const userId = await requireUserId();
  const [rows, skipRows] = await Promise.all([
    db
      .select({
        date: meals.date,
        calories: meals.calories,
        protein: meals.protein,
        carbs: meals.carbs,
        fat: meals.fat,
      })
      .from(meals)
      .where(and(eq(meals.userId, userId), between(meals.date, from, to))),
    db
      .select({ date: skippedMeals.date })
      .from(skippedMeals)
      .where(and(eq(skippedMeals.userId, userId), between(skippedMeals.date, from, to))),
  ]);
  const byDate = new Map<string, DayTotals>();
  const blank = (date: string): DayTotals => ({ date, calories: 0, protein: 0, carbs: 0, fat: 0, count: 0, skipped: 0 });
  for (const s of skipRows) {
    const d = byDate.get(s.date) ?? blank(s.date);
    d.skipped += 1;
    byDate.set(s.date, d);
  }
  for (const r of rows) {
    const d = byDate.get(r.date) ?? blank(r.date);
    d.calories += r.calories;
    d.protein += r.protein;
    d.carbs += r.carbs;
    d.fat += r.fat;
    d.count += 1;
    byDate.set(r.date, d);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Cached per request: several components on a page share it. */
export const getGoals = cache(async function getGoals(): Promise<Goals | null> {
  const userId = await requireUserId();
  const rows = await db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId))
    .limit(1);
  return rows[0] ?? null;
});

/** Latest known weight and body fat, each from its most recent entry. */
/** Cached per request: several components on a page share it. */
export const getLatestBodyValues = cache(async function getLatestBodyValues(): Promise<{
  weight: number | null;
  weightDate: string | null;
  bodyFat: number | null;
  bodyFatDate: string | null;
  bodyFatSource: string | null;
}> {
  const userId = await requireUserId();
  // Pad a day so users ahead of the server's timezone still get "today".
  return latestBodyValues(userId, addDaysStr((await userToday()), 1));
});

/** Most recent distinct meals (by name) for one-tap "eat again". */
export async function getRecentMeals(limit = 6): Promise<Meal[]> {
  const userId = await requireUserId();
  const rows = (
    await db
      .select(mealCols)
      .from(meals)
      .where(eq(meals.userId, userId))
      .orderBy(desc(meals.createdAt))
      .limit(Math.max(60, limit * 10))
  ).map(withPhotoUrl);
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
  /** Garmin activities of 15+ minutes (runs, rides, classes…). */
  activities: number;
  /** Completed days (before today) with food logged. */
  daysLogged: number;
  avgCalories: number | null;
  avgProtein: number | null;
};

export type WeeklyCheckin = {
  weekStart: string;
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  /** Daily totals for this week's completed days (today excluded — it isn't over yet). */
  days: DayTotals[];
  /** Today's totals so far. */
  today: DayTotals | null;
  weightNow: number | null;
  weightWeekAgo: number | null;
};

/** This week (Mon→today) vs the full previous week. */
export async function getWeeklyCheckin(): Promise<WeeklyCheckin> {
  const userId = await requireUserId();
  const weekStart = startOfWeekStr((await userToday()));
  const lastStart = addDaysStr(weekStart, -7);
  const end = addDaysStr(weekStart, 6);

  const today = (await userToday());
  const [setRows, totals, weights, acts] = await Promise.all([
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
          gte(bodyStats.date, addDaysStr((await userToday()), -21)),
        ),
      )
      .orderBy(asc(bodyStats.date)),
    db
      .select({ date: garminActivities.date, durationSec: garminActivities.durationSec })
      .from(garminActivities)
      .where(and(eq(garminActivities.userId, userId), eq(garminActivities.excluded, false), notLinked(userId), between(garminActivities.date, lastStart, end))),
  ]);

  function stats(from: string, to: string): WeekStats {
    const rows = setRows.filter((r) => r.date >= from && r.date <= to && !r.isWarmup);
    // Nutrition is judged on finished days only; a half-eaten today would skew it.
    const days = totals.filter((t) => t.date >= from && t.date <= to && t.date < today);
    return {
      workouts: new Set(rows.map((r) => r.workoutId)).size,
      sets: rows.length,
      volume: rows.reduce((a, r) => a + r.weight * r.reps, 0),
      activities: acts.filter((a) => a.date >= from && a.date <= to && (a.durationSec ?? 0) >= 15 * 60).length,
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
    days: totals.filter((t) => t.date >= weekStart && t.date < today),
    today: totals.find((t) => t.date === today) ?? null,
    weightNow: latest?.weight ?? null,
    weightWeekAgo: weekAgo?.weight ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Garmin                                                              */
/* ------------------------------------------------------------------ */

export type GarminStatus = {
  status: string;
  lastError: string | null;
  lastSyncAt: Date | null;
  keyHint: string;
  adjustForActivity: boolean;
  connectedAt: Date;
};

/** Connection status without any secrets. */
/** Cached per request: several components on a page share it. */
export const getGarminStatus = cache(async function getGarminStatus(): Promise<GarminStatus | null> {
  const userId = await requireUserId();
  const [row] = await db
    .select({
      status: garminConnections.status,
      lastError: garminConnections.lastError,
      lastSyncAt: garminConnections.lastSyncAt,
      keyHint: garminConnections.keyHint,
      adjustForActivity: garminConnections.adjustForActivity,
      connectedAt: garminConnections.connectedAt,
    })
    .from(garminConnections)
    .where(eq(garminConnections.userId, userId))
    .limit(1);
  return row ?? null;
});

export type AppleHealthStatus = typeof appleHealthImports.$inferSelect;

/** The latest Apple Health upload, or null. Cached per request. */
export const getAppleHealthStatus = cache(async function getAppleHealthStatus(): Promise<AppleHealthStatus | null> {
  const userId = await requireUserId();
  const [row] = await db
    .select()
    .from(appleHealthImports)
    .where(eq(appleHealthImports.userId, userId))
    .limit(1);
  return row ?? null;
});

export async function getGarminDaily(from: string, to: string): Promise<GarminDaily[]> {
  const userId = await requireUserId();
  return db
    .select()
    .from(garminDaily)
    .where(and(eq(garminDaily.userId, userId), between(garminDaily.date, from, to)))
    .orderBy(asc(garminDaily.date));
}

/** Most recent Garmin activity, or null. */
export async function getLatestGarminActivity(): Promise<GarminActivity | null> {
  const userId = await requireUserId();
  const [row] = await db
    .select()
    .from(garminActivities)
    .where(and(eq(garminActivities.userId, userId), eq(garminActivities.excluded, false)))
    .orderBy(desc(garminActivities.date), desc(garminActivities.startTimeLocal))
    .limit(1);
  return row ?? null;
}

/**
 * Watch / ring activities in a date range. By default only those that count
 * under the user's "workouts" device choice; `all` includes hidden ones (for a
 * device's own page).
 */
export async function getGarminActivities(from: string, to: string, opts?: { all?: boolean }): Promise<GarminActivity[]> {
  const userId = await requireUserId();
  return db
    .select()
    .from(garminActivities)
    .where(
      and(
        eq(garminActivities.userId, userId),
        between(garminActivities.date, from, to),
        opts?.all ? undefined : eq(garminActivities.excluded, false),
      ),
    )
    .orderBy(desc(garminActivities.date), desc(garminActivities.startTimeLocal));
}

/** All body-composition scans, oldest first. */
export const getBodyScans = cache(async function getBodyScans(): Promise<BodyScan[]> {
  const userId = await requireUserId();
  return db.select().from(bodyScans).where(eq(bodyScans.userId, userId)).orderBy(asc(bodyScans.date));
});

/** Per-day exercise + food logging counts (grouped in SQL, tiny payload). */
export const getConsistencyDays = cache(async function getConsistencyDays(
  from: string,
  to: string,
): Promise<ConsistencyDay[]> {
  const userId = await requireUserId();
  const [setRows, actRows, mealRows, skipRows] = await Promise.all([
    db
      .select({ date: workouts.date, n: sql<number>`count(${sets.id})` })
      .from(sets)
      .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .where(and(eq(workouts.userId, userId), eq(sets.isWarmup, false), between(workouts.date, from, to)))
      .groupBy(workouts.date),
    db
      .select({
        date: garminActivities.date,
        n: sql<number>`count(*)`,
        sec: sql<number>`coalesce(sum(${garminActivities.durationSec}), 0)`,
      })
      .from(garminActivities)
      .where(and(eq(garminActivities.userId, userId), eq(garminActivities.excluded, false), notLinked(userId), between(garminActivities.date, from, to)))
      .groupBy(garminActivities.date),
    db
      .select({ date: meals.date, n: sql<number>`count(*)`, kcal: sql<number>`coalesce(sum(${meals.calories}), 0)` })
      .from(meals)
      .where(and(eq(meals.userId, userId), between(meals.date, from, to)))
      .groupBy(meals.date),
    db
      .select({ date: skippedMeals.date, n: sql<number>`count(*)` })
      .from(skippedMeals)
      .where(and(eq(skippedMeals.userId, userId), between(skippedMeals.date, from, to)))
      .groupBy(skippedMeals.date),
  ]);
  const byDate = new Map<string, ConsistencyDay>();
  const day = (d: string) => {
    let v = byDate.get(d);
    if (!v) byDate.set(d, (v = { date: d, sets: 0, garmin: 0, garminMin: 0, meals: 0, skipped: 0, kcal: 0 }));
    return v;
  };
  for (const r of setRows) day(r.date).sets = Number(r.n);
  for (const r of actRows) Object.assign(day(r.date), { garmin: Number(r.n), garminMin: Math.round(Number(r.sec) / 60) });
  for (const r of mealRows) Object.assign(day(r.date), { meals: Number(r.n), kcal: Math.round(Number(r.kcal)) });
  for (const r of skipRows) day(r.date).skipped = Number(r.n);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
});

/** Names of every exercise the user can pick (built-in and their own). */
export async function getExerciseNames(): Promise<string[]> {
  const userId = await requireUserId();
  const rows = await db
    .select({ name: exercises.name })
    .from(exercises)
    .where(or(isNull(exercises.userId), eq(exercises.userId, userId)));
  return rows.map((r) => r.name);
}

/** Spreadsheet imports, newest first. */
export async function getSheetImports() {
  const userId = await requireUserId();
  return db
    .select({
      id: sheetImports.id,
      fileName: sheetImports.fileName,
      workouts: sheetImports.workouts,
      sets: sheetImports.sets,
      activities: sheetImports.activities,
      createdAt: sheetImports.createdAt,
    })
    .from(sheetImports)
    .where(eq(sheetImports.userId, userId))
    .orderBy(desc(sheetImports.createdAt))
    .limit(50);
}

export type OuraStatus = {
  status: string;
  lastError: string | null;
  lastSyncAt: Date | null;
  connectedAt: Date;
  backfilledFrom: string | null;
  scopes: string;
};

/** Oura connection status without tokens. Cached per request. */
export const getOuraStatus = cache(async function getOuraStatus(): Promise<OuraStatus | null> {
  const userId = await requireUserId();
  const [row] = await db
    .select({
      status: ouraConnections.status,
      lastError: ouraConnections.lastError,
      lastSyncAt: ouraConnections.lastSyncAt,
      connectedAt: ouraConnections.connectedAt,
      backfilledFrom: ouraConnections.backfilledFrom,
      scopes: ouraConnections.scopes,
    })
    .from(ouraConnections)
    .where(eq(ouraConnections.userId, userId))
    .limit(1);
  return row ?? null;
});

export type OuraExtras = {
  date: string;
  readinessScore: number | null;
  temperatureDeviation: number | null;
  temperatureTrendDeviation: number | null;
  sleepScore: number | null;
  activityScore: number | null;
  spo2Avg: number | null;
  breathingDisturbanceIndex: number | null;
  stressHighMin: number | null;
  recoveryHighMin: number | null;
  stressSummary: string | null;
  resilienceLevel: string | null;
  vo2Max: number | null;
  vascularAge: number | null;
};

/** Oura-only measures (readiness, temperature, SpO2, stress, resilience…) per day. */
export async function getOuraExtras(from: string, to: string): Promise<OuraExtras[]> {
  const userId = await requireUserId();
  const rows = await db
    .select({ date: garminRaw.date, payload: garminRaw.payload })
    .from(garminRaw)
    .where(and(eq(garminRaw.userId, userId), eq(garminRaw.dataset, "oura_daily"), between(garminRaw.date, from, to)))
    .orderBy(asc(garminRaw.date));
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const t = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 40) : null);
  return rows.flatMap((r) => {
    try {
      const p = JSON.parse(r.payload) as Record<string, unknown>;
      return [
        {
          date: r.date ?? "",
          readinessScore: n(p.readinessScore),
          temperatureDeviation: n(p.temperatureDeviation),
          temperatureTrendDeviation: n(p.temperatureTrendDeviation),
          sleepScore: n(p.sleepScore),
          activityScore: n(p.activityScore),
          spo2Avg: n(p.spo2Avg),
          breathingDisturbanceIndex: n(p.breathingDisturbanceIndex),
          stressHighMin: n(p.stressHighMin),
          recoveryHighMin: n(p.recoveryHighMin),
          stressSummary: t(p.stressSummary),
          resilienceLevel: t(p.resilienceLevel),
          vo2Max: n(p.vo2Max),
          vascularAge: n(p.vascularAge),
        },
      ];
    } catch {
      return [];
    }
  });
}

/** The user's "which device for what" choices. */
export async function getSourcePrefs() {
  return getPrefs(await requireUserId());
}

/** Each day's saved calorie target (with its activity bonus), for a date range. */
export async function getTargetHistory(from: string, to: string): Promise<Record<string, number>> {
  const userId = await requireUserId();
  const rows = await db
    .select({ date: dailyTargets.date, calories: dailyTargets.calories, bonus: dailyTargets.bonus })
    .from(dailyTargets)
    .where(and(eq(dailyTargets.userId, userId), between(dailyTargets.date, from, to)));
  return Object.fromEntries(rows.map((r) => [r.date, r.calories + (r.bonus ?? 0)]));
}

/** The logged workout (exercises and sets) linked to a watch activity, if any. */
export async function getWorkoutForActivity(activityId: string): Promise<WorkoutDetail | null> {
  const userId = await requireUserId();
  const w = await db.query.workouts.findFirst({
    where: and(eq(workouts.userId, userId), eq(workouts.garminActivityId, activityId)),
    with: {
      workoutExercises: {
        orderBy: (f, ops) => ops.asc(f.position),
        with: { exercise: true, sets: { orderBy: (f, ops) => ops.asc(f.position) } },
      },
    },
  });
  return w ? toDetail(w as RawWorkout) : null;
}

/** Watch activities whose exercises were logged as a workout count once (as the workout). */
function notLinked(userId: string) {
  return sql`not exists (select 1 from ${workouts} lw where lw.user_id = ${userId} and lw.garmin_activity_id = ${garminActivities.activityId})`;
}
