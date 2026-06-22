"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  bodyStats,
  exercises,
  sets,
  workoutExercises,
  workouts,
} from "@/db/schema";
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

/* ------------------------------------------------------------------ */
/* Workout sessions                                                    */
/* ------------------------------------------------------------------ */

export async function createWorkout(input: {
  name: string;
  date: string;
}): Promise<number> {
  const name = input.name?.trim() || "Workout";
  const date = input.date || todayStr();
  const [row] = await db
    .insert(workouts)
    .values({ name, date })
    .returning({ id: workouts.id });
  revalidateAll();
  return row.id;
}

/** Create a fresh session pre-filled with the exercises of the last one. */
export async function duplicateLastWorkout(): Promise<number | null> {
  const candidates = await db.query.workouts.findMany({
    orderBy: desc(workouts.date),
    limit: 10,
    with: {
      workoutExercises: { orderBy: (f, ops) => ops.asc(f.position) },
    },
  });
  const last =
    candidates.find((c) => c.workoutExercises.length > 0) ?? candidates[0];
  if (!last) return null;

  const [row] = await db
    .insert(workouts)
    .values({ name: last.name, date: todayStr() })
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
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim() || "Workout";
  if (input.date !== undefined && input.date) patch.date = input.date;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (Object.keys(patch).length) {
    await db.update(workouts).set(patch).where(eq(workouts.id, workoutId));
  }
  revalidateAll();
}

export async function finishWorkout(workoutId: number): Promise<void> {
  await db
    .update(workouts)
    .set({ finishedAt: new Date() })
    .where(eq(workouts.id, workoutId));
  revalidateAll();
}

/** Delete a workout and all its exercises + sets (explicit, FK-independent). */
export async function discardWorkout(workoutId: number): Promise<void> {
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
  await db.delete(workouts).where(eq(workouts.id, workoutId));
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Exercises within a workout                                          */
/* ------------------------------------------------------------------ */

export async function addExerciseToWorkout(
  workoutId: number,
  exerciseId: number,
): Promise<number> {
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
  await db.delete(sets).where(eq(sets.workoutExerciseId, workoutExerciseId));
  await db
    .delete(workoutExercises)
    .where(eq(workoutExercises.id, workoutExerciseId));
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Sets — the core logging action, with live PR detection              */
/* ------------------------------------------------------------------ */

export async function logSet(input: {
  workoutExerciseId: number;
  reps: number | string;
  weight: number | string;
  isWarmup?: boolean;
  notes?: string | null;
}): Promise<{ isPR: boolean; e1rm: number }> {
  const reps = Math.round(Number(input.reps));
  const weight = Number(input.weight);
  if (!Number.isFinite(reps) || reps <= 0) {
    throw new Error("Reps must be a positive number.");
  }
  if (!Number.isFinite(weight) || weight < 0) {
    throw new Error("Weight must be zero or more.");
  }
  const isWarmup = !!input.isWarmup;

  const we = await db.query.workoutExercises.findFirst({
    where: eq(workoutExercises.id, input.workoutExerciseId),
  });
  if (!we) throw new Error("That exercise is not part of the workout.");

  // Best estimated 1RM for this exercise so far (excludes the set we're adding).
  let prevBest = 0;
  if (!isWarmup) {
    const rows = await db
      .select({ reps: sets.reps, weight: sets.weight })
      .from(sets)
      .innerJoin(
        workoutExercises,
        eq(sets.workoutExerciseId, workoutExercises.id),
      )
      .where(
        and(
          eq(workoutExercises.exerciseId, we.exerciseId),
          eq(sets.isWarmup, false),
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
  await db.delete(sets).where(eq(sets.id, setId));
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Exercise library                                                    */
/* ------------------------------------------------------------------ */

export async function createExercise(input: {
  name: string;
  muscleGroup: string;
  equipment: string;
}): Promise<{ id: number } | { error: string }> {
  const name = input.name?.trim();
  if (!name) return { error: "Please enter a name." };
  const muscleGroup = input.muscleGroup?.trim() || "Other";
  const equipment = input.equipment?.trim() || "Other";
  try {
    const [row] = await db
      .insert(exercises)
      .values({ name, muscleGroup, equipment, isCustom: true })
      .returning({ id: exercises.id });
    revalidateAll();
    return { id: row.id };
  } catch {
    return { error: "An exercise with that name already exists." };
  }
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
  const date = input.date || todayStr();
  const vals = {
    date,
    weight: numOrNull(input.weight),
    waist: numOrNull(input.waist),
    bodyFat: numOrNull(input.bodyFat),
  };
  await db
    .insert(bodyStats)
    .values(vals)
    .onConflictDoUpdate({
      target: bodyStats.date,
      set: {
        weight: vals.weight,
        waist: vals.waist,
        bodyFat: vals.bodyFat,
      },
    });
  revalidateAll();
}

export async function deleteBodyStat(id: number): Promise<void> {
  await db.delete(bodyStats).where(eq(bodyStats.id, id));
  revalidateAll();
}
