"use server";

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  aiUsage,
  bodyScans,
  bodyStats,
  garminActivities,
  garminConnections,
  garminDatasets,
  garminRaw,
  exercises,
  goals,
  meals,
  templateExercises,
  templates,
  sets,
  workoutExercises,
  workouts,
  skippedMeals,
  savedMeals,
  sheetImports,
  sourceDaily,
  ouraConnections,
} from "@/db/schema";
import { analyzeMealImage, type MealAnalysis } from "@/lib/food-ai";
import { exchangeKey, GarminError } from "@/lib/garmin/client";
import { decryptSecret, encryptSecret } from "@/lib/garmin/crypto";
import { askAboutDay, generateDailyReport, type Report } from "@/lib/analysis/report";
import { extractBodyScans, type ExtractedScan } from "@/lib/body-scan-ai";
import { runGarminImport, type ImportStatus } from "@/lib/garmin/raw-import";
import { ahBatchSchema } from "@/lib/apple-health/types";
import {
  deleteAppleHealthData,
  recordAppleHealthImport,
  storeAppleHealthBatch,
} from "@/lib/apple-health/store";
import { z } from "zod";
import { cleanText } from "@/lib/sheet-import/format";
import { batchSchema, ImportError, storeBatch, undoImport, type BatchResult } from "@/lib/sheet-import/store";
import { syncGarminForUser, type SyncResult } from "@/lib/garmin/sync";
import { cleanPrefs, resolveDays, savePrefs } from "@/lib/sources";
import { revokeToken } from "@/lib/oura/client";
import { deleteOuraData, syncOuraForUser } from "@/lib/oura/sync";
import {
  ACTIVITY_LEVELS,
  MEAL_TYPES,
  sumMacros,
  type MealItem,
  SKIPPABLE_MEALS,
} from "@/lib/nutrition";
import { requireUserId, userToday } from "@/lib/session";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { addDaysStr, estimate1RM, todayStr } from "@/lib/utils";

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
    "/garmin",
    "/apple-health",
    "/insights",
    "/connect",
    "/oura",
  ]) {
    revalidatePath(p);
  }
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** A YYYY-MM-DD string that is a real calendar date, else the fallback. */
function safeDate(v: unknown, fallback = todayStr()): string {
  if (typeof v !== "string" || !DATE_ONLY.test(v)) return fallback;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? fallback : v;
}
const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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
  const name = clip(input.name, 80) || "Workout";
  const date = safeDate(input.date);
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
    .values({ userId, name: last.name, date: await userToday() })
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
  if (input.name !== undefined) patch.name = clip(input.name, 80) || "Workout";
  if (input.date !== undefined && input.date) patch.date = safeDate(input.date);
  if (input.notes !== undefined) patch.notes = clip(input.notes, 2000) || null;
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
  if (!Number.isFinite(reps) || reps <= 0 || reps > 1000) {
    throw new Error("Reps must be between 1 and 1000.");
  }
  if (!Number.isFinite(weight) || weight < 0 || weight > 2000) {
    throw new Error("Weight must be between 0 and 2000 kg.");
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
    notes: clip(input.notes, 500) || null,
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
  const name = clip(input.name, 80);
  if (!name) return { error: "Please enter a name." };
  const muscleGroup = clip(input.muscleGroup, 40) || "Other";
  const equipment = clip(input.equipment, 40) || "Other";

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
}): Promise<{ error?: string }> {
  const userId = await requireUserId();
  const date = safeDate(input.date);
  const bad = (v: number | null, lo: number, hi: number) => v != null && (v < lo || v > hi);
  const weight = numOrNull(input.weight);
  const waist = numOrNull(input.waist);
  const bodyFat = numOrNull(input.bodyFat);
  if (bad(weight, 20, 400)) return { error: "Weight should be between 20 and 400 kg." };
  if (bad(waist, 30, 250)) return { error: "Waist should be between 30 and 250 cm." };
  if (bad(bodyFat, 2, 75)) return { error: "Body fat should be between 2 and 75%." };
  const vals = {
    userId,
    date,
    weight,
    waist,
    bodyFat,
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
        source: "manual", // a manual edit takes ownership from a Garmin import
      },
    });
  revalidateAll();
  return {};
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

/**
 * AI nutrition estimate: from a (client-downscaled) meal photo with an
 * optional description, or from a description alone (no photo).
 */
export async function analyzeMeal(input: {
  image?: string | null;
  hint?: string | null;
}): Promise<MealAnalysis | { error: string }> {
  const userId = await requireUserId();
  const hint = cleanText(input.hint, 500);
  const hasImage = !!input.image;
  const m = hasImage ? IMAGE_DATA_URL_RE.exec(input.image ?? "") : null;
  if (hasImage && !m) return { error: "Unsupported image. Please use a JPEG or PNG photo." };
  if (m && m[2].length > 5_000_000) return { error: "That photo is too large." };
  if (!hasImage && hint.length < 3) return { error: "Describe what you ate first, e.g. 1 plate chicken rice with soup." };
  // Cost guard: burst + daily caps per user (tunable via MEAL_AI_DAILY_LIMIT).
  const daily = Math.max(1, Number(process.env.MEAL_AI_DAILY_LIMIT) || 60);
  const [burst, perDay] = await Promise.all([
    rateLimit(`ai:min:${userId}`, 8, 60 * 1000),
    rateLimit(`ai:day:${userId}`, daily, DAY),
  ]);
  if (!burst.ok) return { error: "Too many estimates at once. Wait a moment and try again." };
  if (!perDay.ok) {
    return { error: `Daily AI estimate limit reached (${daily}). You can still enter meals yourself.` };
  }
  const res = await analyzeMealImage({
    base64: m?.[2] ?? null,
    mediaType: (m?.[1] as "image/jpeg" | "image/png" | "image/webp" | "image/gif" | undefined) ?? null,
    hint: hint || null,
  });
  if (res.usage.length) {
    try {
      await db.insert(aiUsage).values(
        res.usage.map((u) => ({
          userId,
          feature: hasImage ? "meal_photo" : "meal_text",
          model: u.model,
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          costUsd: u.costUsd,
        })),
      );
    } catch (err) {
      console.error("Failed to record AI usage:", err); // never block the user
    }
  }
  return res.ok ? res.analysis : { error: res.error };
}

function cleanBase(v: unknown): MealItem["base"] {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const n = (x: unknown) => Math.max(0, Math.min(20000, Math.round((numOrNull(x) ?? 0) * 10) / 10));
  return { calories: n(b.calories), protein: n(b.protein), carbs: n(b.carbs), fat: n(b.fat) };
}

function cleanEaten(v: unknown): number | null {
  const n = numOrNull(v);
  if (n == null || !Number.isFinite(n) || n === 1) return null;
  return Math.max(0, Math.min(10, Math.round(n * 100) / 100));
}

function cleanItems(items: unknown): MealItem[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 40).flatMap((raw) => {
    const it = raw as Record<string, unknown>;
    const name = String(it.name ?? "").trim().slice(0, 120);
    if (!name) return [];
    const n = (v: unknown) => Math.max(0, Math.round(numOrNull(v) ?? 0));
    const t = (v: unknown, max: number) => {
      const x = String(v ?? "").trim().slice(0, max);
      return x || null;
    };
    return [
      {
        name,
        portion: String(it.portion ?? "").trim().slice(0, 80),
        calories: n(it.calories),
        protein: n(it.protein),
        carbs: n(it.carbs),
        fat: n(it.fat),
        dish: t(it.dish, 80),
        reference: t(it.reference, 200),
        amount: t(it.amount, 160),
        calculation: t(it.calculation, 160),
        assumptions: t(it.assumptions, 200),
        edited: it.edited === true,
        base: cleanBase(it.base),
        eaten: cleanEaten(it.eaten),
        drink: typeof it.drink === "boolean" ? it.drink : null,
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
  await clearSkip(userId, vals.date, vals.mealType);
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
  await clearSkip(userId, vals.date, vals.mealType);
  revalidateAll();
}

/** "Eat again": copies an earlier meal (incl. photo) onto another day — no AI call. */
export async function relogMeal(input: {
  mealId: number;
  date: string;
  mealType?: string;
}): Promise<void> {
  const userId = await requireUserId();
  if (!DATE_RE.test(input.date ?? "")) throw new Error("Invalid date.");
  const [src] = await db
    .select()
    .from(meals)
    .where(and(eq(meals.id, input.mealId), eq(meals.userId, userId)))
    .limit(1);
  if (!src) throw new Error("Meal not found.");
  const mealType = (MEAL_TYPES as readonly string[]).includes(input.mealType ?? "")
    ? input.mealType!
    : src.mealType;
  await db.insert(meals).values({
    userId,
    date: input.date,
    mealType,
    name: src.name,
    calories: src.calories,
    protein: src.protein,
    carbs: src.carbs,
    fat: src.fat,
    items: src.items,
    notes: src.notes,
    photo: src.photo,
    aiEstimated: src.aiEstimated,
  });
  await clearSkip(userId, input.date, mealType);
  revalidateAll();
}

const SKIPPABLE = SKIPPABLE_MEALS as readonly string[];

/** Marks a meal as skipped for a day (e.g. no breakfast). Its calories stay free for your other meals. */
export async function skipMeal(input: { date: string; mealType: string }): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  if (!DATE_RE.test(input.date ?? "") || !SKIPPABLE.includes(input.mealType)) return { error: "That meal can't be skipped." };
  const existing = await db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.date, input.date), eq(meals.mealType, input.mealType)))
    .limit(1);
  if (existing.length) return { error: "You already logged food for this meal." };
  await db.insert(skippedMeals).values({ userId, date: input.date, mealType: input.mealType }).onConflictDoNothing();
  revalidateAll();
  return { ok: true };
}

export async function unskipMeal(input: { date: string; mealType: string }): Promise<void> {
  const userId = await requireUserId();
  if (!DATE_RE.test(input.date ?? "")) return;
  await db
    .delete(skippedMeals)
    .where(and(eq(skippedMeals.userId, userId), eq(skippedMeals.date, input.date), eq(skippedMeals.mealType, input.mealType)));
  revalidateAll();
}

/** Logging food in a slot you had marked as skipped cancels the skip. */
async function clearSkip(userId: string, date: string, mealType: string) {
  await db
    .delete(skippedMeals)
    .where(and(eq(skippedMeals.userId, userId), eq(skippedMeals.date, date), eq(skippedMeals.mealType, mealType)));
}

/* ---------------- My menu (pinned meals) ---------------- */

const MENU_LIMIT = 40;

async function menuIsFull(userId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(savedMeals)
    .where(eq(savedMeals.userId, userId));
  return Number(n) >= MENU_LIMIT;
}

/** Pins a logged meal to My menu (skips it if the same meal is already there). */
export async function pinMeal(mealId: number): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const [src] = await db
    .select()
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .limit(1);
  if (!src) return { error: "Meal not found." };
  const [dupe] = await db
    .select({ id: savedMeals.id })
    .from(savedMeals)
    .where(and(eq(savedMeals.userId, userId), eq(savedMeals.name, src.name), eq(savedMeals.calories, src.calories)))
    .limit(1);
  if (dupe) return { ok: true };
  if (await menuIsFull(userId)) return { error: `My menu holds up to ${MENU_LIMIT} items. Remove one first.` };
  await db.insert(savedMeals).values({
    userId,
    name: src.name,
    calories: src.calories,
    protein: src.protein,
    carbs: src.carbs,
    fat: src.fat,
    items: src.items,
    photo: src.photo,
    aiEstimated: src.aiEstimated,
  });
  revalidateAll();
  return { ok: true };
}

/** Creates a My menu item from scratch (name, items and numbers). */
export async function saveMenuItem(input: Omit<MealInput, "date" | "mealType"> & { photo?: string | null }): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const vals = mealValues({ ...input, date: "2000-01-01", mealType: "snack" });
  if (await menuIsFull(userId)) return { error: `My menu holds up to ${MENU_LIMIT} items. Remove one first.` };
  const photo = input.photo && IMAGE_DATA_URL_RE.test(input.photo) && input.photo.length <= 300_000 ? input.photo : null;
  await db.insert(savedMeals).values({
    userId,
    name: vals.name,
    calories: vals.calories,
    protein: vals.protein,
    carbs: vals.carbs,
    fat: vals.fat,
    items: vals.items,
    photo,
    aiEstimated: vals.aiEstimated,
  });
  revalidateAll();
  return { ok: true };
}

export async function removeMenuItem(id: number): Promise<void> {
  const userId = await requireUserId();
  await db.delete(savedMeals).where(and(eq(savedMeals.id, id), eq(savedMeals.userId, userId)));
  revalidateAll();
}

/** Logs a My menu item as a meal on a day. No AI call. */
export async function logMenuItem(input: { id: number; date: string; mealType: string }): Promise<void> {
  const userId = await requireUserId();
  if (!DATE_RE.test(input.date ?? "")) throw new Error("Invalid date.");
  const [src] = await db
    .select()
    .from(savedMeals)
    .where(and(eq(savedMeals.id, input.id), eq(savedMeals.userId, userId)))
    .limit(1);
  if (!src) throw new Error("Menu item not found.");
  const mealType = (MEAL_TYPES as readonly string[]).includes(input.mealType) ? input.mealType : "snack";
  await db.insert(meals).values({
    userId,
    date: input.date,
    mealType,
    name: src.name,
    calories: src.calories,
    protein: src.protein,
    carbs: src.carbs,
    fat: src.fat,
    items: src.items,
    photo: src.photo,
    aiEstimated: src.aiEstimated,
  });
  await clearSkip(userId, input.date, mealType);
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
    // Pace and goal date are set by the pace chooser; only change them when sent.
    ...("weeklyRate" in input ? { weeklyRate } : {}),
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

/**
 * Sets how fast to reach the goal: either a weekly pace (one of the suggested
 * options) or a date to reach it by. Setting one clears the other.
 */
export async function setGoalPace(
  input: { weeklyRate: number } | { targetDate: string },
): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  // Choosing a pace or date means "use the plan", so it also clears custom calories.
  let vals: { weeklyRate: number | null; targetDate: string | null; calorieOverride: null };
  if ("targetDate" in input) {
    const today = await userToday();
    if (!DATE_RE.test(input.targetDate ?? "")) return { error: "Pick a date." };
    if (input.targetDate <= today) return { error: "Pick a date in the future." };
    if (input.targetDate > addDaysStr(today, 3 * 365)) return { error: "Pick a date within 3 years." };
    vals = { weeklyRate: null, targetDate: input.targetDate, calorieOverride: null };
  } else {
    const r = numOrNull(input.weeklyRate);
    if (r == null || r <= 0 || r > 2) return { error: "That pace looks off." };
    vals = { weeklyRate: Math.round(r * 100) / 100, targetDate: null, calorieOverride: null };
  }
  await db
    .insert(goals)
    .values({ userId, ...vals, updatedAt: new Date() })
    .onConflictDoUpdate({ target: goals.userId, set: { ...vals, updatedAt: new Date() } });
  revalidateAll();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Workout templates (routines)                                        */
/* ------------------------------------------------------------------ */

/** Saves a workout's exercise list (and working-set counts) as a template. */
export async function saveWorkoutAsTemplate(
  workoutId: number,
  name: string,
): Promise<{ id: number } | { error: string }> {
  const userId = await requireUserId();
  await assertOwnsWorkout(userId, workoutId);
  const clean = name?.trim().slice(0, 80);
  if (!clean) return { error: "Give the template a name." };

  const wes = await db.query.workoutExercises.findMany({
    where: eq(workoutExercises.workoutId, workoutId),
    orderBy: (f, ops) => ops.asc(f.position),
    with: { sets: true },
  });
  if (!wes.length) return { error: "Add at least one exercise first." };

  const [row] = await db
    .insert(templates)
    .values({ userId, name: clean })
    .returning({ id: templates.id });
  await db.insert(templateExercises).values(
    wes.map((we, i) => {
      const working = we.sets.filter((s) => !s.isWarmup).length;
      return {
        templateId: row.id,
        exerciseId: we.exerciseId,
        position: i,
        targetSets: working || null,
      };
    }),
  );
  revalidateAll();
  return { id: row.id };
}

export async function startWorkoutFromTemplate(
  templateId: number,
  date: string,
): Promise<number> {
  const userId = await requireUserId();
  const [tpl] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)))
    .limit(1);
  if (!tpl) throw new Error("Template not found.");
  const items = await db
    .select()
    .from(templateExercises)
    .where(eq(templateExercises.templateId, templateId))
    .orderBy(templateExercises.position);

  const [row] = await db
    .insert(workouts)
    .values({ userId, name: tpl.name, date: DATE_RE.test(date) ? date : await userToday() })
    .returning({ id: workouts.id });
  if (items.length) {
    await db.insert(workoutExercises).values(
      items.map((it, i) => ({ workoutId: row.id, exerciseId: it.exerciseId, position: i })),
    );
  }
  await db
    .update(templates)
    .set({ lastUsedAt: new Date() })
    .where(eq(templates.id, templateId));
  revalidateAll();
  return row.id;
}

export async function deleteTemplate(id: number): Promise<void> {
  const userId = await requireUserId();
  const [tpl] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .limit(1);
  if (!tpl) return;
  await db.delete(templateExercises).where(eq(templateExercises.templateId, id));
  await db.delete(templates).where(eq(templates.id, id));
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Garmin Connect (Personal API)                                       */
/* ------------------------------------------------------------------ */

/** Validates a personal API key with Garmin, stores it encrypted, then backfills 30 days. */
export async function connectGarmin(
  apiKey: string,
): Promise<{ ok: true; sync: SyncResult } | { error: string }> {
  const userId = await requireUserId();
  const limit = await rateLimit(`garmin:connect:${userId}`, 10, HOUR);
  if (!limit.ok) return { error: tooMany(limit.retryAfterSec) };
  const key = apiKey?.trim();
  if (!key || key.length < 16 || key.length > 4096 || /\s/.test(key)) {
    return { error: "That doesn't look like a Garmin API key. Copy it exactly as shown." };
  }
  let token: { token: string; expiresAt: Date };
  try {
    token = await exchangeKey(key);
  } catch (err) {
    return {
      error:
        err instanceof GarminError
          ? err.message
          : "Couldn't reach Garmin right now. Please try again.",
    };
  }
  const vals = {
    apiKeyEnc: encryptSecret(key),
    keyHint: key.slice(-4),
    tokenEnc: encryptSecret(token.token),
    tokenExpiresAt: token.expiresAt,
    status: "ok",
    lastError: null,
    connectedAt: new Date(),
  };
  await db
    .insert(garminConnections)
    .values({ userId, ...vals })
    .onConflictDoUpdate({ target: garminConnections.userId, set: vals });
  const sync = await syncGarminForUser(userId, { days: 30 });
  revalidateAll();
  return { ok: true, sync };
}

export async function syncGarminNow(): Promise<SyncResult> {
  const userId = await requireUserId();
  const limit = await rateLimit(`garmin:sync:${userId}`, 20, HOUR);
  if (!limit.ok) {
    return { ok: false, days: 0, activities: 0, weighIns: 0, warnings: [], error: tooMany(limit.retryAfterSec) };
  }
  const res = await syncGarminForUser(userId, { days: 7 });
  revalidateAll();
  return res;
}

export async function setGarminActivityAdjust(on: boolean): Promise<void> {
  const userId = await requireUserId();
  await db
    .update(garminConnections)
    .set({ adjustForActivity: !!on })
    .where(eq(garminConnections.userId, userId));
  revalidateAll();
}

/** Removes the stored key and, optionally, all imported Garmin data. */
export async function disconnectGarmin(deleteData: boolean): Promise<void> {
  const userId = await requireUserId();
  await db.delete(garminConnections).where(eq(garminConnections.userId, userId));
  if (deleteData) {
    // Other devices (Apple, Oura) and spreadsheet imports share these tables; keep them.
    await db.delete(sourceDaily).where(and(eq(sourceDaily.userId, userId), eq(sourceDaily.source, "garmin")));
    await db
      .delete(garminActivities)
      .where(and(eq(garminActivities.userId, userId), sql`${garminActivities.activityId} not like 'apple-%' and ${garminActivities.activityId} not like 'sheet-%' and ${garminActivities.activityId} not like 'oura-%'`));
    await db.delete(garminRaw).where(and(eq(garminRaw.userId, userId), sql`${garminRaw.key} not like 'apple-%' and ${garminRaw.key} not like 'sheet-%' and ${garminRaw.key} not like 'oura-%'`));
    await db.delete(garminDatasets).where(eq(garminDatasets.userId, userId));
    await db
      .delete(bodyStats)
      .where(and(eq(bodyStats.userId, userId), eq(bodyStats.source, "garmin")));
    await resolveDays(userId);
  }
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Garmin full-data import (raw store)                                 */
/* ------------------------------------------------------------------ */

/** Runs one time-boxed step of the "import everything" job. Call repeatedly until done. */
export async function runGarminImportStep(): Promise<ImportStatus | { error: string }> {
  const userId = await requireUserId();
  const limit = await rateLimit(`garmin:import:${userId}`, 120, HOUR);
  if (!limit.ok) return { error: tooMany(limit.retryAfterSec) };
  try {
    const res = await runGarminImport(userId, { budgetMs: 40_000 });
    revalidatePath("/garmin/data");
    return res;
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** How many days of detailed (per-day) Garmin data to import: 30–730. */
export async function setGarminHistoryDays(days: number): Promise<void> {
  const userId = await requireUserId();
  const allowed = [30, 90, 180, 365, 730];
  const d = allowed.includes(Number(days)) ? Number(days) : 90;
  await db.update(garminConnections).set({ historyDays: d }).where(eq(garminConnections.userId, userId));
  revalidatePath("/garmin/data");
}

/** Retry a dataset previously marked unavailable (e.g. after a new device). */
export async function retryGarminDataset(dataset: string): Promise<void> {
  const userId = await requireUserId();
  await db
    .update(garminDatasets)
    .set({ status: "ok", emptyStreak: 0, lastError: null, backfilledTo: null, latestDate: null })
    .where(and(eq(garminDatasets.userId, userId), eq(garminDatasets.dataset, clip(dataset, 60))));
  revalidatePath("/garmin/data");
}

/* ------------------------------------------------------------------ */
/* Apple Health (export upload, parsed in the browser)                 */
/* ------------------------------------------------------------------ */

/** Stores one batch of a parsed Apple Health export. Call once per batch, then finish. */
export async function importAppleHealthBatch(batch: unknown): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const limit = await rateLimit(`apple:import:${userId}`, 300, HOUR);
  if (!limit.ok) return { error: tooMany(limit.retryAfterSec) };
  const parsed = ahBatchSchema.safeParse(batch);
  if (!parsed.success) return { error: "That export didn't look right. Try exporting from the Health app again." };
  try {
    await storeAppleHealthBatch(userId, parsed.data);
    return { ok: true };
  } catch (err) {
    console.error(`[apple-health] batch failed for ${userId}:`, (err as Error).message);
    return { error: "Couldn't save that part of the import. Please try again." };
  }
}

const ahFinishSchema = z.object({
  firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  lastDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  days: z.number().int().min(0).max(100_000),
  nights: z.number().int().min(0).max(100_000),
  workouts: z.number().int().min(0).max(100_000),
  weighIns: z.number().int().min(0).max(100_000),
});

export async function finishAppleHealthImport(meta: unknown): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const parsed = ahFinishSchema.safeParse(meta);
  if (!parsed.success) return { error: "Invalid import summary." };
  await recordAppleHealthImport(userId, parsed.data);
  revalidateAll();
  return { ok: true };
}

/** Deletes everything an Apple Health upload added (Garmin and manual data stay). */
export async function removeAppleHealthData(): Promise<void> {
  const userId = await requireUserId();
  await deleteAppleHealthData(userId);
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Insights: AI daily report + questions                               */
/* ------------------------------------------------------------------ */

export async function generateReportAction(
  date: string,
): Promise<{ ok: true; report: Report; model: string } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const d = safeDate(date);
  const limit = await rateLimit(`ai:report:${userId}`, 12, DAY);
  if (!limit.ok) return { ok: false, error: "Daily report limit reached. Try again tomorrow." };
  const res = await generateDailyReport(userId, d);
  revalidatePath("/insights");
  return res;
}

export async function askAboutDayAction(
  date: string,
  question: string,
): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const q = clip(question, 500);
  if (q.length < 3) return { ok: false, error: "Type a question first." };
  const limit = await rateLimit(`ai:qa:${userId}`, 30, DAY);
  if (!limit.ok) return { ok: false, error: "Question limit reached for today." };
  return askAboutDay(userId, safeDate(date), q);
}

/* ------------------------------------------------------------------ */
/* Body-composition scans (InBody)                                     */
/* ------------------------------------------------------------------ */

/** Reads scans from screenshot tiles; nothing is saved until the user confirms. */
export async function extractBodyScansAction(
  images: string[],
): Promise<{ ok: true; scans: ExtractedScan[]; notes: string } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const limit = await rateLimit(`ai:scan:${userId}`, 20, DAY);
  if (!limit.ok) return { ok: false, error: "Daily scan limit reached. Try again tomorrow." };
  const list = (Array.isArray(images) ? images : []).slice(0, 20);
  const parsed = list.flatMap((img) => {
    const m = IMAGE_DATA_URL_RE.exec(img ?? "");
    return m && m[2].length < 3_000_000
      ? [{ mediaType: m[1] as "image/jpeg" | "image/png" | "image/webp", base64: m[2] }]
      : [];
  });
  if (!parsed.length) return { ok: false, error: "Add at least one screenshot." };
  return extractBodyScans(userId, parsed);
}

const SEG_KEYS = ["leftArm", "rightArm", "trunk", "leftLeg", "rightLeg"] as const;
function cleanSegments(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const out: Record<string, { kg: number | null; pct: number | null }> = {};
  for (const k of SEG_KEYS) {
    const s = (v as Record<string, unknown>)[k] as Record<string, unknown> | null | undefined;
    const kg = numOrNull(s?.kg);
    const pct = numOrNull(s?.pct);
    if (kg != null || pct != null) {
      out[k] = { kg: kg != null && kg > 0 && kg < 100 ? kg : null, pct: pct != null && pct > 0 && pct < 400 ? pct : null };
    }
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

/** Saves reviewed scans (upsert per date) and mirrors weight/body fat into body stats. */
export async function saveBodyScans(scans: ExtractedScan[]): Promise<{ saved: number } | { error: string }> {
  const userId = await requireUserId();
  if (!Array.isArray(scans) || !scans.length) return { error: "Nothing to save." };
  const range = (v: unknown, lo: number, hi: number) => {
    const n = numOrNull(v);
    return n != null && n >= lo && n <= hi ? n : null;
  };
  let saved = 0;
  for (const s of scans.slice(0, 50)) {
    const date = safeDate(s?.date, "");
    if (!date) continue;
    const vals = {
      time: /^\d{1,2}:\d{2}$/.test(String(s.time ?? "")) ? String(s.time) : null,
      device: "InBody",
      score: range(s.score, 0, 120),
      weight: range(s.weight, 20, 400),
      skeletalMuscle: range(s.skeletalMuscle, 5, 100),
      fatMass: range(s.fatMass, 0.5, 250),
      bodyFatPct: range(s.bodyFatPct, 2, 75),
      bmi: range(s.bmi, 10, 80),
      visceralFat: range(s.visceralFat, 1, 30),
      waistHip: range(s.waistHip, 0.5, 1.6),
      totalBodyWater: range(s.totalBodyWater, 10, 120),
      protein: range(s.protein, 2, 40),
      mineral: range(s.mineral, 0.5, 10),
      bmr: range(s.bmr, 600, 4000),
      smi: range(s.smi, 3, 20),
      segmentalLean: cleanSegments(s.segmentalLean),
      segmentalFat: cleanSegments(s.segmentalFat),
      bodyType: clip(s.bodyType, 80) || null,
      balance: s.balance
        ? JSON.stringify({
            upper: clip(s.balance.upper, 40) || null,
            lower: clip(s.balance.lower, 40) || null,
            upperLower: clip(s.balance.upperLower, 40) || null,
          })
        : null,
    };
    await db
      .insert(bodyScans)
      .values({ userId, date, ...vals })
      .onConflictDoUpdate({ target: [bodyScans.userId, bodyScans.date], set: vals });
    // Mirror into body stats so the plan uses measured weight + body fat.
    // A manual entry for that day wins; scans override Garmin / Apple Health scale imports.
    if (vals.weight != null || vals.bodyFatPct != null) {
      const bs = { weight: vals.weight, bodyFat: vals.bodyFatPct };
      await db
        .insert(bodyStats)
        .values({ userId, date, ...bs, source: "inbody" })
        .onConflictDoUpdate({
          target: [bodyStats.userId, bodyStats.date],
          set: { ...bs, source: "inbody" },
          setWhere: sql`${bodyStats.source} in ('inbody', 'garmin', 'apple')`,
        });
    }
    saved++;
  }
  revalidateAll();
  revalidatePath("/stats");
  return { saved };
}

export async function deleteBodyScan(id: number): Promise<void> {
  const userId = await requireUserId();
  const [scan] = await db
    .select({ date: bodyScans.date })
    .from(bodyScans)
    .where(and(eq(bodyScans.id, id), eq(bodyScans.userId, userId)))
    .limit(1);
  if (!scan) return;
  await db.delete(bodyScans).where(eq(bodyScans.id, id));
  await db
    .delete(bodyStats)
    .where(and(eq(bodyStats.userId, userId), eq(bodyStats.date, scan.date), eq(bodyStats.source, "inbody")));
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Spreadsheet import (Connections › Import file)                      */
/* ------------------------------------------------------------------ */

/** Opens an import record; batches are then sent with importSheetBatch. */
export async function startSheetImport(fileName: string): Promise<{ importId: number } | { error: string }> {
  const userId = await requireUserId();
  const limit = await rateLimit(`sheet:import:${userId}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return { error: tooMany(limit.retryAfterSec) };
  const [open] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sheetImports)
    .where(eq(sheetImports.userId, userId));
  if ((open?.n ?? 0) >= 200) return { error: "You have 200 imports listed. Remove an old one first." };
  const name = cleanText(fileName, 120).replace(/[^\p{L}\p{N} ._()-]/gu, "") || "spreadsheet";
  const [row] = await db.insert(sheetImports).values({ userId, fileName: name }).returning({ id: sheetImports.id });
  return { importId: row.id };
}

export async function importSheetBatch(importId: number, batch: unknown): Promise<BatchResult | { error: string }> {
  const userId = await requireUserId();
  if (!Number.isInteger(importId)) return { error: "Import not found." };
  const [rec] = await db
    .select({ id: sheetImports.id, createdAt: sheetImports.createdAt })
    .from(sheetImports)
    .where(and(eq(sheetImports.id, importId), eq(sheetImports.userId, userId)))
    .limit(1);
  if (!rec) return { error: "Import not found." };
  if (Date.now() - rec.createdAt.getTime() > 60 * 60 * 1000) return { error: "This import has expired. Start again." };
  const limit = await rateLimit(`sheet:batch:${userId}`, 300, 60 * 60 * 1000);
  if (!limit.ok) return { error: tooMany(limit.retryAfterSec) };
  const parsed = batchSchema.safeParse(batch);
  if (!parsed.success) return { error: "Some rows didn't pass the checks. Re-open the file and try again." };
  try {
    return await storeBatch(userId, importId, parsed.data, await userToday());
  } catch (e) {
    if (e instanceof ImportError) return { error: e.message };
    throw e;
  }
}

/** Closes an import: drops the record when nothing was added, refreshes pages. */
export async function finishSheetImport(importId: number): Promise<void> {
  const userId = await requireUserId();
  if (!Number.isInteger(importId)) return;
  await db
    .delete(sheetImports)
    .where(
      and(
        eq(sheetImports.id, importId),
        eq(sheetImports.userId, userId),
        eq(sheetImports.workouts, 0),
        eq(sheetImports.activities, 0),
      ),
    );
  revalidateAll();
  revalidatePath("/connect");
  revalidatePath("/connect/import");
}

/** Removes everything one import added. */
export async function removeSheetImport(importId: number): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  if (!Number.isInteger(importId)) return { error: "Import not found." };
  const ok = await undoImport(userId, importId);
  if (!ok) return { error: "Import not found." };
  revalidateAll();
  revalidatePath("/connect");
  revalidatePath("/connect/import");
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Oura Ring + "which device for what"                                 */
/* ------------------------------------------------------------------ */

export async function syncOuraNow(): Promise<{ ok: true; days: number; nights: number; workouts: number } | { error: string }> {
  const userId = await requireUserId();
  const limit = await rateLimit(`oura:manual:${userId}`, 6, HOUR);
  if (!limit.ok) return { error: tooMany(limit.retryAfterSec) };
  const r = await syncOuraForUser(userId, { days: 10 });
  revalidateAll();
  return r.ok ? { ok: true, days: r.days, nights: r.nights, workouts: r.workouts } : { error: r.error ?? "Oura sync failed." };
}

/** Disconnects Oura (revoking the token) and optionally removes its data. */
export async function disconnectOura(deleteData: boolean): Promise<void> {
  const userId = await requireUserId();
  const [c] = await db.select().from(ouraConnections).where(eq(ouraConnections.userId, userId)).limit(1);
  if (c) {
    try {
      await revokeToken(decryptSecret(c.accessTokenEnc));
    } catch {
      /* best effort */
    }
  }
  await db.delete(ouraConnections).where(eq(ouraConnections.userId, userId));
  if (deleteData) await deleteOuraData(userId);
  revalidateAll();
}

/** Saves which device to use for sleep, recovery, daily activity and workouts, and re-applies it. */
export async function setSourcePrefs(input: unknown): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const limit = await rateLimit(`sources:prefs:${userId}`, 30, HOUR);
  if (!limit.ok) return { error: tooMany(limit.retryAfterSec) };
  await savePrefs(userId, cleanPrefs(input));
  await resolveDays(userId);
  revalidateAll();
  return { ok: true };
}
