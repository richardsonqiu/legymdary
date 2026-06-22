import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  bodyStats,
  exercises,
  sets,
  workoutExercises,
  workouts,
  type BodyStat,
  type Exercise,
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

export async function getLastFinishedWorkout(): Promise<WorkoutDetail | null> {
  const ws = await getWorkoutDetails();
  return ws.find((w) => w.finished) ?? null;
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
