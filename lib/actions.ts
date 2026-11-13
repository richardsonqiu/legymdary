"use server";

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  bodyStats,
  exercises,
  goals,
  meals,
  sets,
  workoutExercises,
  workouts,
} from "@/db/schema";
import { analyzeMealImage, type MealAnalysis } from "@/lib/food-ai";
import {
  ACTIVITY_LEVELS,
  MEAL_TYPES,
  sumMacros,
  type MealItem,
} from "@/lib/nutrition";
import { requireUserId } from "@/lib/session";
import { estimate1RM, todayStr } from "@/lib/utils";

function revalidateAll() {
  for (const p of [
    "/dashboard",
    "/log",
    "/history",
    "/stats",
    "/prs",
    "/exercises",
    "/food",
    "/plan",
  ]) {
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

/* ------------------------------------------------------------------ */
/* Food log — AI photo analysis + meals                                */
/* ------------------------------------------------------------------ */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IMAGE_DATA_URL_RE =
  /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

/** Sends a (client-downscaled) meal photo to the AI for a nutrition estimate. */
export async function analyzeMeal(input: {
  image: string;
  hint?: string | null;
}): Promise<MealAnalysis | { error: string }> {
  await requireUserId();
  const m = IMAGE_DATA_URL_RE.exec(input.image ?? "");
  if (!m) return { error: "Unsupported image. Please use a JPEG or PNG photo." };
  if (m[2].length > 5_000_000) return { error: "That photo is too large." };
  return analyzeMealImage({
    base64: m[2],
    mediaType: m[1] as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
    hint: input.hint?.slice(0, 500),
  });
}

function cleanItems(items: unknown): MealItem[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 40).flatMap((raw) => {
    const it = raw as Record<string, unknown>;
    const name = String(it.name ?? "").trim().slice(0, 120);
    if (!name) return [];
    const n = (v: unknown) => Math.max(0, Math.round(numOrNull(v) ?? 0));
    return [
      {
        name,
        portion: String(it.portion ?? "").trim().slice(0, 80),
        calories: n(it.calories),
        protein: n(it.protein),
        carbs: n(it.carbs),
        fat: n(it.fat),
      },
    ];
  });
}

export type MealInput = {
  date: string;
  mealType: string;
  name: string;
  items: MealItem[];
  /** Used only when there are no items (quick manual entry). */
  calories?: number | string | null;
  protein?: number | string | null;
  carbs?: number | string | null;
  fat?: number | string | null;
  notes?: string | null;
  photo?: string | null;
  aiEstimated?: boolean;
};

function mealValues(input: MealInput) {
  if (!DATE_RE.test(input.date ?? "")) throw new Error("Invalid date.");
  const items = cleanItems(input.items);
  const totals = items.length
    ? sumMacros(items)
    : {
        calories: Math.max(0, numOrNull(input.calories) ?? 0),
        protein: Math.max(0, numOrNull(input.protein) ?? 0),
        carbs: Math.max(0, numOrNull(input.carbs) ?? 0),
        fat: Math.max(0, numOrNull(input.fat) ?? 0),
      };
  const mealType = (MEAL_TYPES as readonly string[]).includes(input.mealType)
    ? input.mealType
    : "snack";
  return {
    date: input.date,
    mealType,
    name: input.name?.trim().slice(0, 120) || items[0]?.name || "Meal",
    ...totals,
    items: items.length ? JSON.stringify(items) : null,
    notes: input.notes?.trim().slice(0, 1000) || null,
    aiEstimated: !!input.aiEstimated,
  };
}

export async function saveMeal(input: MealInput): Promise<{ id: number }> {
  const userId = await requireUserId();
  const vals = mealValues(input);
  let photo: string | null = null;
  if (input.photo) {
    // Thumbnails only — keep rows small.
    if (!IMAGE_DATA_URL_RE.test(input.photo) || input.photo.length > 300_000) {
      throw new Error("Photo thumbnail is invalid or too large.");
    }
    photo = input.photo;
  }
  const [row] = await db
    .insert(meals)
    .values({ userId, ...vals, photo })
    .returning({ id: meals.id });
  revalidateAll();
  return { id: row.id };
}

export async function updateMeal(id: number, input: MealInput): Promise<void> {
  const userId = await requireUserId();
  const vals = mealValues(input);
  await db
    .update(meals)
    .set(vals)
    .where(and(eq(meals.id, id), eq(meals.userId, userId)));
  revalidateAll();
}

export async function deleteMeal(id: number): Promise<void> {
  const userId = await requireUserId();
  await db.delete(meals).where(and(eq(meals.id, id), eq(meals.userId, userId)));
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Weight / body-fat goals                                             */
/* ------------------------------------------------------------------ */

export async function saveGoals(input: {
  sex?: string | null;
  birthYear?: number | string | null;
  heightCm?: number | string | null;
  activityLevel?: string | null;
  targetWeight?: number | string | null;
  targetBodyFat?: number | string | null;
  weeklyRate?: number | string | null;
  calorieOverride?: number | string | null;
}): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const inRange = (v: number | null, lo: number, hi: number) =>
    v == null || (v >= lo && v <= hi);

  const sex = input.sex === "male" || input.sex === "female" ? input.sex : null;
  const birthYear = numOrNull(input.birthYear);
  const heightCm = numOrNull(input.heightCm);
  const activityLevel =
    input.activityLevel && input.activityLevel in ACTIVITY_LEVELS
      ? input.activityLevel
      : null;
  const targetWeight = numOrNull(input.targetWeight);
  const targetBodyFat = numOrNull(input.targetBodyFat);
  const weeklyRate = numOrNull(input.weeklyRate);
  const calorieOverride = numOrNull(input.calorieOverride);

  const thisYear = new Date().getFullYear();
  if (!inRange(birthYear, thisYear - 100, thisYear - 13))
    return { error: "Birth year looks off." };
  if (!inRange(heightCm, 100, 250)) return { error: "Height should be in cm (100–250)." };
  if (!inRange(targetWeight, 30, 300)) return { error: "Target weight should be 30–300 kg." };
  if (!inRange(targetBodyFat, 3, 60)) return { error: "Target body fat should be 3–60%." };
  if (!inRange(weeklyRate, 0, 2)) return { error: "Weekly pace should be 0–2 kg." };
  if (!inRange(calorieOverride, 800, 6000))
    return { error: "Custom calorie target should be 800–6000 kcal." };

  const vals = {
    sex,
    birthYear: birthYear != null ? Math.round(birthYear) : null,
    heightCm,
    activityLevel,
    targetWeight,
    targetBodyFat,
    weeklyRate,
    calorieOverride,
    updatedAt: new Date(),
  };
  await db
    .insert(goals)
    .values({ userId, ...vals })
    .onConflictDoUpdate({ target: goals.userId, set: vals });
  revalidateAll();
  return { ok: true };
}
