"use server";

import { cleanPrefs } from "@legymdary/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  bodyScans,
  bodyStats,
  garminActivities,
  garminConnections,
  garminDatasets,
  garminRaw,
  goals,
  meals,
  templateExercises,
  templates,
  workoutExercises,
  workouts,
  savedMeals,
  sheetImports,
  sourceDaily,
  ouraConnections,
  dailyTargets,
  targetReviews,
} from "@/db/schema";
import type { MealAnalysis } from "@/lib/food-ai";
import { exchangeKey, GarminError } from "@/lib/garmin/client";
import { decryptSecret, encryptSecret } from "@/lib/garmin/crypto";
import { askAboutDay, generateDailyReport, type Report } from "@/lib/analysis/report";
import { extractBodyScans, type ExtractedScan } from "@/lib/body-scan-ai";
import { runGarminImport, type ImportStatus } from "@/lib/garmin/raw-import";
import { ahBatchSchema, MEAL_TYPES, parseItems, qualityFromItems } from "@legymdary/shared";
import {
  deleteAppleHealthData,
  recordAppleHealthImport,
  storeAppleHealthBatch,
} from "@/lib/apple-health/store";
import { z } from "zod";
import { cleanText } from "@/lib/sheet-import/format";
import { batchSchema, ImportError, storeBatch, undoImport, type BatchResult } from "@/lib/sheet-import/store";
import { syncGarminForUser, type SyncResult } from "@/lib/garmin/sync";
import { resolveDays, savePrefs } from "@/lib/sources";
import { revokeToken } from "@/lib/oura/client";
import { deleteOuraData, syncOuraForUser } from "@/lib/oura/sync";
import { requireUserId, userToday } from "@/lib/session";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import * as bodySvc from "@/lib/services/body";
import * as foodSvc from "@/lib/services/food";
import * as planSvc from "@/lib/services/plan";
import * as workoutsSvc from "@/lib/services/workouts";
import { DATE_RE, DAY, HOUR, IMAGE_DATA_URL_RE, clip, clockMinutes, numOrNull, safeDate } from "@/lib/services/util";
import { clearSkip, defaultEatenAt, mealValues, type MealInput } from "@/lib/services/food";
import { assertOwnsWorkout } from "@/lib/services/workouts";

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






/* ------------------------------------------------------------------ */
/* Workout sessions                                                    */
/* ------------------------------------------------------------------ */

export async function createWorkout(input: {
  name: string;
  date: string;
}): Promise<number> {
  const userId = await requireUserId();
  const r = await workoutsSvc.createWorkout(userId, input);
  revalidateAll();
  return r;
}

export async function duplicateLastWorkout(): Promise<number | null> {
  const userId = await requireUserId();
  const r = await workoutsSvc.duplicateLastWorkout(userId);
  revalidateAll();
  return r;
}

export async function updateWorkout(
  workoutId: number,
  input: { name?: string; date?: string; notes?: string | null },
): Promise<void> {
  const userId = await requireUserId();
  await workoutsSvc.updateWorkout(userId, workoutId, input);
  revalidateAll();
}

export async function finishWorkout(workoutId: number): Promise<void> {
  const userId = await requireUserId();
  await workoutsSvc.finishWorkout(userId, workoutId);
  revalidateAll();
}


/**
 * "Add exercises" on a watch activity: opens (or reopens) the workout linked
 * to it in the logger, during the session or afterwards.
 */
export async function startWorkoutForActivity(activityId: string): Promise<{ id: number } | { error: string }> {
  const userId = await requireUserId();
  if (!/^[\w-]{1,40}$/.test(activityId)) return { error: "Activity not found." };
  const [act] = await db
    .select()
    .from(garminActivities)
    .where(and(eq(garminActivities.userId, userId), eq(garminActivities.activityId, activityId)))
    .limit(1);
  if (!act) return { error: "Activity not found." };
  const [open] = await db
    .select({ id: workouts.id, linked: workouts.garminActivityId })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), isNull(workouts.finishedAt)))
    .limit(1);
  const [linked] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), eq(workouts.garminActivityId, activityId)))
    .limit(1);
  if (open && open.id !== linked?.id) {
    // A session already running with nothing linked: attach it to this activity.
    if (!open.linked && !linked) {
      await db.update(workouts).set({ garminActivityId: activityId }).where(eq(workouts.id, open.id));
      revalidateAll();
      return { id: open.id };
    }
    return { error: "Finish or discard the workout in progress first." };
  }
  if (linked) {
    await db.update(workouts).set({ finishedAt: null }).where(eq(workouts.id, linked.id));
    revalidateAll();
    return { id: linked.id };
  }
  const [w] = await db
    .insert(workouts)
    .values({
      userId,
      name: act.name.slice(0, 80) || "Workout",
      date: act.date,
      garminActivityId: activityId,
    })
    .returning({ id: workouts.id });
  revalidateAll();
  return { id: w.id };
}

export async function discardWorkout(workoutId: number): Promise<void> {
  const userId = await requireUserId();
  await workoutsSvc.discardWorkout(userId, workoutId);
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
  const r = await workoutsSvc.addExerciseToWorkout(userId, workoutId, exerciseId);
  revalidateAll();
  return r;
}

export async function removeWorkoutExercise(
  workoutExerciseId: number,
): Promise<void> {
  const userId = await requireUserId();
  await workoutsSvc.removeWorkoutExercise(userId, workoutExerciseId);
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
  const r = await workoutsSvc.logSet(userId, input);
  revalidateAll();
  return r;
}

export async function deleteSet(setId: number): Promise<void> {
  const userId = await requireUserId();
  await workoutsSvc.deleteSet(userId, setId);
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
  const r = await workoutsSvc.createExercise(userId, input);
  if (!("error" in r)) revalidateAll();
  return r;
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
  const r = await bodySvc.logBodyStat(userId, input);
  if (!("error" in r)) revalidateAll();
  return r;
}

export async function deleteBodyStat(id: number): Promise<void> {
  const userId = await requireUserId();
  await bodySvc.deleteBodyStat(userId, id);
  revalidateAll();
}

/* ------------------------------------------------------------------ */
/* Food log — AI photo analysis + meals                                */
/* ------------------------------------------------------------------ */


/**
 * AI nutrition estimate: from a (client-downscaled) meal photo with an
 * optional description, or from a description alone (no photo).
 */
export async function analyzeMeal(input: {
  image?: string | null;
  hint?: string | null;
}): Promise<MealAnalysis | { error: string }> {
  const userId = await requireUserId();
  return foodSvc.analyzeMeal(userId, input);
}









export async function saveMeal(input: MealInput): Promise<{ id: number }> {
  const userId = await requireUserId();
  const r = await foodSvc.saveMeal(userId, input);
  revalidateAll();
  return r;
}

export async function updateMeal(id: number, input: MealInput): Promise<void> {
  const userId = await requireUserId();
  await foodSvc.updateMeal(userId, id, input);
  revalidateAll();
}

/** "Eat again": copies an earlier meal (incl. photo) onto another day — no AI call. */
export async function relogMeal(input: {
  mealId: number;
  date: string;
  mealType?: string;
}): Promise<void> {
  const userId = await requireUserId();
  await foodSvc.relogMeal(userId, input);
  revalidateAll();
}


/** Marks a meal as skipped for a day (e.g. no breakfast). Its calories stay free for your other meals. */
export async function skipMeal(input: { date: string; mealType: string }): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const r = await foodSvc.skipMeal(userId, input);
  if (!("error" in r)) revalidateAll();
  return r;
}

export async function unskipMeal(input: { date: string; mealType: string }): Promise<void> {
  const userId = await requireUserId();
  await foodSvc.unskipMeal(userId, input);
  revalidateAll();
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
    ...qualityFromItems(parseItems(src.items)),
    eatenAt: await defaultEatenAt(input.date, mealType),
  });
  await clearSkip(userId, input.date, mealType);
  revalidateAll();
}

export async function deleteMeal(id: number): Promise<void> {
  const userId = await requireUserId();
  await foodSvc.deleteMeal(userId, id);
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
  const r = await planSvc.saveGoals(userId, input);
  if (!("error" in r)) revalidateAll();
  return r;
}

/**
 * Sets how fast to reach the goal: either a weekly pace (one of the suggested
 * options) or a date to reach it by. Setting one clears the other.
 */
export async function setGoalPace(
  input: { weeklyRate: number } | { targetDate: string },
): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const r = await planSvc.setGoalPace(userId, input);
  if (!("error" in r)) revalidateAll();
  return r;
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
  const r = await workoutsSvc.startWorkoutFromTemplate(userId, templateId, date);
  revalidateAll();
  return r;
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

/* ------------------------------------------------------------------ */
/* Daily target mode                                                   */
/* ------------------------------------------------------------------ */

/** "steady": the daily target stays put (extra exercise = extra deficit). "adaptive": it follows burn and weight. */
export async function setTargetMode(mode: string): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const r = await planSvc.setTargetMode(userId, mode);
  if (!("error" in r)) revalidateAll();
  return r;
}

/** Steady mode: take the plan's current number as the new target (from today). */
export async function relockTarget(): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const res = await db.update(goals).set({ relockedAt: new Date(), updatedAt: new Date() }).where(eq(goals.userId, userId));
  if (!res.rowsAffected) return { error: "Set your goal first." };
  revalidateAll();
  return { ok: true };
}

/** Steady target: after a big-burn day, eat part of it back (added to today's target only). */
export async function claimBurnBonus(amount: number): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Nothing to add." };
  const bonus = Math.min(600, Math.round(amount / 10) * 10);
  const today = await userToday();
  const res = await db
    .update(dailyTargets)
    .set({ bonus, updatedAt: new Date() })
    .where(and(eq(dailyTargets.userId, userId), eq(dailyTargets.date, today)));
  if (!res.rowsAffected) return { error: "Open the Food page once today first." };
  revalidateAll();
  return { ok: true };
}

/** Weekly or monthly target review. */
export async function setReviewCadence(cadence: string): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  if (cadence !== "weekly" && cadence !== "monthly") return { error: "Unknown option." };
  const res = await db.update(goals).set({ reviewCadence: cadence, updatedAt: new Date() }).where(eq(goals.userId, userId));
  if (!res.rowsAffected) return { error: "Set your goal first." };
  revalidateAll();
  return { ok: true };
}

/** Answer a pending review: take the suggested target, or keep the current one. */
export async function decideReview(id: number, choice: string): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  if (!Number.isInteger(id) || (choice !== "updated" && choice !== "kept")) return { error: "Unknown option." };
  const [r] = await db
    .select()
    .from(targetReviews)
    .where(and(eq(targetReviews.id, id), eq(targetReviews.userId, userId)))
    .limit(1);
  if (!r || r.decision !== "pending" || r.suggested == null) return { error: "This review was already answered." };
  await db
    .update(targetReviews)
    .set({ decision: choice, applied: choice === "updated" ? r.suggested : null, decidedAt: new Date() })
    .where(eq(targetReviews.id, id));
  revalidateAll();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Recommended workouts                                                */
/* ------------------------------------------------------------------ */

/** Gym days a week for the recommended plan (2–6), or null to work it out from history. */
export async function setTrainingDays(days: number | null): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const v = days == null ? null : Math.round(days);
  if (v != null && (v < 2 || v > 6)) return { error: "Pick 2 to 6 days." };
  const res = await db.update(goals).set({ trainingDays: v, updatedAt: new Date() }).where(eq(goals.userId, userId));
  if (!res.rowsAffected) await db.insert(goals).values({ userId, trainingDays: v }).onConflictDoNothing();
  revalidatePath("/log");
  return { ok: true };
}

/** Starts today's recommended session with its exercises and targets. */
export async function startRecommendedWorkout(): Promise<{ id: number } | { error: string }> {
  const userId = await requireUserId();
  const r = await workoutsSvc.startRecommendedWorkout(userId);
  if (!("error" in r)) revalidateAll();
  return r;
}

/** Changes when a meal was eaten (and its meal type). */
export async function setMealTime(input: { id: number; minutes: number; mealType?: string }): Promise<{ ok: true } | { error: string }> {
  const userId = await requireUserId();
  const minutes = clockMinutes(input.minutes);
  if (!Number.isInteger(input.id) || minutes == null) return { error: "Pick a valid time." };
  const mealType = input.mealType && (MEAL_TYPES as readonly string[]).includes(input.mealType) ? input.mealType : undefined;
  await db
    .update(meals)
    .set(mealType ? { eatenAt: minutes, mealType } : { eatenAt: minutes })
    .where(and(eq(meals.id, input.id), eq(meals.userId, userId)));
  revalidateAll();
  return { ok: true };
}
