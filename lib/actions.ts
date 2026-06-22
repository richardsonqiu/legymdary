"use server";

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  bodyStats,
  exercises,
  sets,
  workoutExercises,
  workouts,
} from "@/db/schema";
import { requireUserId } from "@/lib/session";
import { estimate1RM, todayStr } from "@/lib/utils";

function revalidateAll() {
  for (const p of ["/", "/log", "/history", "/stats", "/prs", "/exercises"]) {
    revalidatePath(p);
  }
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Throws unless the workout belongs to the user. */
async function assertOwnsWorkout(userId: string, workoutId: number) {
  const rows = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new Error("Workout not found.");
}

/** Returns the workout-exercise's exerciseId if it belongs to the user. */
async function ownedWorkoutExercise(userId: string, workoutExerciseId: number) {
  const rows = await db
    .select({
      exerciseId: workoutExercises.exerciseId,
      userId: workouts.userId,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(workoutExercises.id, workoutExerciseId))
    .limit(1);
  const row = rows[0];
  if (!row || row.userId !== userId) return null;
  return row.exerciseId;
}

/* ------------------------------------------------------------------ */
/* Workout sessions                                                    */
/* ------------------------------------------------------------------ */

export async function createWorkout(input: {
  name: string;
  date: string;
}): Promise<number> {
  const userId = await requireUserId();
  const name = input.name?.trim() || "Workout";
  const date = input.date || todayStr();
  const [row] = await db
    .insert(workouts)
    .values({ userId, name, date })
    .returning({ id: workouts.id });
  revalidateAll();
  return row.id;
}

export async function duplicateLastWorkout(): Promise<number | null> {
  const userId = await requireUserId();
  const candidates = await db.query.workouts.findMany({
    where: eq(workouts.userId, userId),
    orderBy: desc(workouts.date),
    limit: 10,
    with: { workoutExercises: { orderBy: (f, ops) => ops.asc(f.position) } },
  });
  const last =
    candidates.find((c) => c.workoutExercises.length > 0) ?? candidates[0];
  if (!last) return null;

  const [row] = await db
    .insert(workouts)
    .values({ userId, name: last.name, date: todayStr() })
    .returning({ id: workouts.id });

  if (last.workoutExercises.length) {
    await db.insert(workoutExercises).values(
      last.workoutExercises.map((we, i) => ({
        workoutId: row.id,
        exerciseId: we.exerciseId,
        position: i,
      })),
    );
  }
  revalidateAll();
  return row.id;
}

export async function updateWorkout(
  workoutId: number,
  input: { name?: string; date?: string; notes?: string | null },
): Promise<void> {
  const userId = await requireUserId();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || "Workout";
  if (input.date !== undefined && input.date) patch.date = input.date;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (Object.keys(patch).length) {
    await db
      .update(workouts)
      .set(patch)
      .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));
  }
  revalidateAll();
}

export async function finishWorkout(workoutId: number): Promise<void> {
  const userId = await requireUserId();
  await db
    .update(workouts)
    .set({ finishedAt: new Date() })
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));
  revalidateAll();
}

export async function discardWorkout(workoutId: number): Promise<void> {
  const userId = await requireUserId();
  await assertOwnsWorkout(userId, workoutId);
  const wes = await db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId));
  const ids = wes.map((w) => w.id);
  if (ids.length) {
    await db.delete(sets).where(inArray(sets.workoutExerciseId, ids));
  }
  await db
    .delete(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId));
  await db
    .delete(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Exercises within a workout                                          */
/* ------------------------------------------------------------------ */

export async function addExerciseToWorkout(
  workoutId: number,
  exerciseId: number,
): Promise<number> {
  const userId = await requireUserId();
  await assertOwnsWorkout(userId, workoutId);

  // The exercise must be a built-in or one of this user's customs.
  const ex = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        eq(exercises.id, exerciseId),
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
      ),
    )
    .limit(1);
  if (!ex[0]) throw new Error("Exercise not found.");

  const position = await db.$count(
    workoutExercises,
    eq(workoutExercises.workoutId, workoutId),
  );
  const [row] = await db
    .insert(workoutExercises)
    .values({ workoutId, exerciseId, position })
    .returning({ id: workoutExercises.id });
  revalidateAll();
  return row.id;
}

export async function removeWorkoutExercise(
  workoutExerciseId: number,
): Promise<void> {
  const userId = await requireUserId();
  const owned = await ownedWorkoutExercise(userId, workoutExerciseId);
  if (owned === null) throw new Error("Not found.");
  await db.delete(sets).where(eq(sets.workoutExerciseId, workoutExerciseId));
  await db
    .delete(workoutExercises)
    .where(eq(workoutExercises.id, workoutExerciseId));
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Sets — the core logging action, with per-user PR detection          */
/* ------------------------------------------------------------------ */

export async function logSet(input: {
  workoutExerciseId: number;
  reps: number | string;
  weight: number | string;
  isWarmup?: boolean;
  notes?: string | null;
}): Promise<{ isPR: boolean; e1rm: number }> {
  const userId = await requireUserId();
  const reps = Math.round(Number(input.reps));
  const weight = Number(input.weight);
  if (!Number.isFinite(reps) || reps <= 0) {
    throw new Error("Reps must be a positive number.");
  }
  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error("Weight must be zero or more.");
  }
  const isWarmup = !!input.isWarmup;

  const exerciseId = await ownedWorkoutExercise(userId, input.workoutExerciseId);
  if (exerciseId === null) throw new Error("That exercise is not in your workout.");

  // Best estimated 1RM for this exercise across *this user's* sets so far.
  let prevBest = 0;
  if (!isWarmup) {
    const rows = await db
      .select({ reps: sets.reps, weight: sets.weight })
      .from(sets)
      .innerJoin(
        workoutExercises,
        eq(sets.workoutExerciseId, workoutExercises.id),
      )
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .where(
        and(
          eq(workoutExercises.exerciseId, exerciseId),
          eq(sets.isWarmup, false),
          eq(workouts.userId, userId),
        ),
      );
    for (const r of rows) {
      prevBest = Math.max(prevBest, estimate1RM(r.weight, r.reps));
    }
  }

  const position = await db.$count(
    sets,
    eq(sets.workoutExerciseId, input.workoutExerciseId),
  );
  await db.insert(sets).values({
    workoutExerciseId: input.workoutExerciseId,
    reps,
    weight,
    isWarmup,
    notes: input.notes?.toString().trim() || null,
    position,
  });

  const e1rm = estimate1RM(weight, reps);
  const isPR = !isWarmup && e1rm > 0 && e1rm > prevBest;
  revalidateAll();
  return { isPR, e1rm };
}

export async function deleteSet(setId: number): Promise<void> {
  const userId = await requireUserId();
  const rows = await db
    .select({ userId: workouts.userId })
    .from(sets)
    .innerJoin(
      workoutExercises,
      eq(sets.workoutExerciseId, workoutExercises.id),
    )
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(sets.id, setId))
    .limit(1);
  if (!rows[0] || rows[0].userId !== userId) throw new Error("Not found.");
  await db.delete(sets).where(eq(sets.id, setId));
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Exercise library (custom exercises are per-user)                    */
/* ------------------------------------------------------------------ */

export async function createExercise(input: {
  name: string;
  muscleGroup: string;
  equipment: string;
}): Promise<{ id: number } | { error: string }> {
  const userId = await requireUserId();
  const name = input.name?.trim();
  if (!name) return { error: "Please enter a name." };
  const muscleGroup = input.muscleGroup?.trim() || "Other";
  const equipment = input.equipment?.trim() || "Other";

  // Reject if it clashes with a built-in or one of the user's own exercises.
  const existing = await db
    .select({ name: exercises.name })
    .from(exercises)
    .where(or(isNull(exercises.userId), eq(exercises.userId, userId)));
  if (existing.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    return { error: "You already have an exercise with that name." };
  }

  const [row] = await db
    .insert(exercises)
    .values({ name, muscleGroup, equipment, isCustom: true, userId })
    .returning({ id: exercises.id });
  revalidateAll();
  return { id: row.id };
}

/* ------------------------------------------------------------------ */
/* Body stats                                                          */
/* ------------------------------------------------------------------ */

export async function logBodyStat(input: {
  date: string;
  weight?: number | string | null;
  waist?: number | string | null;
  bodyFat?: number | string | null;
}): Promise<void> {
  const userId = await requireUserId();
  const date = input.date || todayStr();
  const vals = {
    userId,
    date,
    weight: numOrNull(input.weight),
    waist: numOrNull(input.waist),
    bodyFat: numOrNull(input.bodyFat),
  };
  await db
    .insert(bodyStats)
    .values(vals)
    .onConflictDoUpdate({
      target: [bodyStats.userId, bodyStats.date],
      set: {
        weight: vals.weight,
        waist: vals.waist,
        bodyFat: vals.bodyFat,
      },
    });
  revalidateAll();
}

export async function deleteBodyStat(id: number): Promise<void> {
  const userId = await requireUserId();
  await db
    .delete(bodyStats)
    .where(and(eq(bodyStats.id, id), eq(bodyStats.userId, userId)));
  revalidateAll();
}
