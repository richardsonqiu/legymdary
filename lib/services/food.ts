import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, meals, skippedMeals } from "@/db/schema";
import { analyzeMealImage, type MealAnalysis } from "@/lib/food-ai";
import { MEAL_TYPES, qualityFromItems, SKIPPABLE_MEALS, SLOT_MINUTES, sumMacros, type MealItem } from "@legymdary/shared";
import { cleanText } from "@/lib/sheet-import/format";
import { rateLimit } from "@/lib/rate-limit";
import { userNowMinutes, userToday } from "@/lib/session";
import { DATE_RE, DAY, IMAGE_DATA_URL_RE, clockMinutes, numOrNull, UserError } from "./util";

export function cleanBase(v: unknown): MealItem["base"] {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const n = (x: unknown) => Math.max(0, Math.min(20000, Math.round((numOrNull(x) ?? 0) * 10) / 10));
  return { calories: n(b.calories), protein: n(b.protein), carbs: n(b.carbs), fat: n(b.fat) };
}

export function cleanEaten(v: unknown): number | null {
  const n = numOrNull(v);
  if (n == null || !Number.isFinite(n) || n === 1) return null;
  return Math.max(0, Math.min(10, Math.round(n * 100) / 100));
}

/** Optional grams, 0 to 500, one decimal. */
export function grams(v: unknown): number | null {
  const n = numOrNull(v);
  return n == null || !Number.isFinite(n) ? null : Math.max(0, Math.min(500, Math.round(n * 10) / 10));
}

export function proc(v: unknown): number | null {
  const n = numOrNull(v);
  return n != null && [1, 2, 3, 4].includes(Math.round(n)) ? Math.round(n) : null;
}

/** When a meal was eaten if not given: now for today, else the slot's usual time. */
export async function defaultEatenAt(date: string, mealType: string): Promise<number> {
  if (date === (await userToday())) {
    const now = await userNowMinutes();
    if (now != null) return now;
  }
  return SLOT_MINUTES[mealType] ?? SLOT_MINUTES.snack;
}

export function cleanItems(items: unknown): MealItem[] {
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
        fiber: grams(it.fiber),
        sugar: grams(it.sugar),
        processing: proc(it.processing),
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
  /** Minutes after local midnight. Omitted: now (today) or the slot's usual time. */
  eatenAt?: number | null;
  /** AI note on the meal; undefined keeps the current one when editing. */
  advisor?: string | null;
};

export function mealValues(input: MealInput) {
  if (!DATE_RE.test(input.date ?? "")) throw new UserError("Invalid date.");
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
    ...qualityFromItems(items),
    ...(input.advisor !== undefined ? { advisor: cleanText(input.advisor, 400) || null } : {}),
  };
}

/** Logging food in a slot you had marked as skipped cancels the skip. */
export async function clearSkip(userId: string, date: string, mealType: string) {
  await db
    .delete(skippedMeals)
    .where(and(eq(skippedMeals.userId, userId), eq(skippedMeals.date, date), eq(skippedMeals.mealType, mealType)));
}

/**
 * AI nutrition estimate: from a (client-downscaled) meal photo with an
 * optional description, or from a description alone (no photo).
 */
export async function analyzeMeal(userId: string, input: {
  image?: string | null;
  hint?: string | null;
}): Promise<MealAnalysis | { error: string }> {  const hint = cleanText(input.hint, 500);
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

export async function saveMeal(userId: string, input: MealInput): Promise<{ id: number }> {  const vals = mealValues(input);
  let photo: string | null = null;
  if (input.photo) {
    // Thumbnails only — keep rows small.
    if (!IMAGE_DATA_URL_RE.test(input.photo) || input.photo.length > 300_000) {
      throw new UserError("Photo thumbnail is invalid or too large.");
    }
    photo = input.photo;
  }
  const eatenAt = clockMinutes(input.eatenAt) ?? (await defaultEatenAt(vals.date, vals.mealType));
  const [row] = await db
    .insert(meals)
    .values({ userId, ...vals, photo, eatenAt })
    .returning({ id: meals.id });
  await clearSkip(userId, vals.date, vals.mealType);  return { id: row.id };
}

export async function updateMeal(userId: string, id: number, input: MealInput): Promise<void> {  const vals = mealValues(input);
  const eatenAt = clockMinutes(input.eatenAt);
  await db
    .update(meals)
    .set(eatenAt != null ? { ...vals, eatenAt } : vals)
    .where(and(eq(meals.id, id), eq(meals.userId, userId)));
  await clearSkip(userId, vals.date, vals.mealType);}

/** "Eat again": copies an earlier meal (incl. photo) onto another day — no AI call. */
export async function relogMeal(userId: string, input: {
  mealId: number;
  date: string;
  mealType?: string;
}): Promise<void> {  if (!DATE_RE.test(input.date ?? "")) throw new UserError("Invalid date.");
  const [src] = await db
    .select()
    .from(meals)
    .where(and(eq(meals.id, input.mealId), eq(meals.userId, userId)))
    .limit(1);
  if (!src) throw new UserError("Meal not found.");
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
    fiber: src.fiber,
    sugar: src.sugar,
    processing: src.processing,
    advisor: src.advisor,
    eatenAt: await defaultEatenAt(input.date, mealType),
  });
  await clearSkip(userId, input.date, mealType);}

const SKIPPABLE = SKIPPABLE_MEALS as readonly string[];

/** Marks a meal as skipped for a day (e.g. no breakfast). Its calories stay free for your other meals. */
export async function skipMeal(userId: string, input: { date: string; mealType: string }): Promise<{ ok: true } | { error: string }> {  if (!DATE_RE.test(input.date ?? "") || !SKIPPABLE.includes(input.mealType)) return { error: "That meal can't be skipped." };
  const existing = await db
    .select({ id: meals.id })
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.date, input.date), eq(meals.mealType, input.mealType)))
    .limit(1);
  if (existing.length) return { error: "You already logged food for this meal." };
  await db.insert(skippedMeals).values({ userId, date: input.date, mealType: input.mealType }).onConflictDoNothing();  return { ok: true };
}

export async function unskipMeal(userId: string, input: { date: string; mealType: string }): Promise<void> {  if (!DATE_RE.test(input.date ?? "")) return;
  await db
    .delete(skippedMeals)
    .where(and(eq(skippedMeals.userId, userId), eq(skippedMeals.date, input.date), eq(skippedMeals.mealType, input.mealType)));}

export async function deleteMeal(userId: string, id: number): Promise<void> {  await db.delete(meals).where(and(eq(meals.id, id), eq(meals.userId, userId)));}
