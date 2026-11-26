/**
 * Meal quality: how nourishing a meal is, not just how many calories.
 * Pure and client-safe.
 *
 * Each meal gets a level (low / moderate / high) for six nutrients, then a
 * 0 to 100 score shown as Limited / Fair / Good / Nutritious.
 *
 * Levels are relative to the meal's size so a snack and a dinner compare
 * fairly:
 * - Protein: share of calories (15% and 25%), or 30 g+ is always high.
 * - Fiber: grams per 500 kcal (3 g and 7 g). About 30 g a day is the aim.
 * - Processing: 1 whole foods, 2 simply prepared, 3 processed,
 *   4 ultra-processed (NOVA groups).
 * - Added sugars: share of calories (5% and 10%, WHO guidance).
 * - Total fats: share of calories (25% and 40%).
 * - Total carbs: share of calories (35% and 55%).
 */
import type { MealItem } from "@/lib/nutrition";

export type NutrientKey = "protein" | "fiber" | "processing" | "sugar" | "fat" | "carbs";
export type Level = "low" | "moderate" | "high";
export type Band = "limited" | "fair" | "good" | "nutritious";
/** Whether this level is good news for the meal. */
export type Tone = "good" | "neutral" | "watch";

export const NUTRIENTS: { key: NutrientKey; label: string }[] = [
  { key: "protein", label: "Protein" },
  { key: "fiber", label: "Fiber" },
  { key: "processing", label: "Processing level" },
  { key: "sugar", label: "Added sugars" },
  { key: "fat", label: "Total fats" },
  { key: "carbs", label: "Total carbs" },
];

export const BANDS: { key: Band; label: string; min: number }[] = [
  { key: "limited", label: "Limited", min: 0 },
  { key: "fair", label: "Fair", min: 40 },
  { key: "good", label: "Good", min: 60 },
  { key: "nutritious", label: "Nutritious", min: 80 },
];

export const PROCESSING_LABEL: Record<number, string> = {
  1: "Whole foods",
  2: "Simply prepared",
  3: "Processed",
  4: "Ultra-processed",
};

export type MealNutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  /** 1 to 4, calorie-weighted across items. */
  processing: number | null;
};

export type NutrientResult = {
  key: NutrientKey;
  label: string;
  level: Level | null;
  /** 0 to 1 along a three-part bar (low | moderate | high). */
  position: number | null;
  tone: Tone;
  /** e.g. "32 g · 28% of calories". */
  detail: string | null;
};

export type MealQuality = {
  score: number | null;
  band: Band | null;
  nutrients: NutrientResult[];
  /** Fiber, sugar or processing unknown (older or hand-entered meals). */
  partial: boolean;
};

/** Maps a value onto a 3-part bar where a and b are the boundaries. */
function place(v: number, a: number, b: number, max: number): { level: Level; position: number } {
  if (v < a) return { level: "low", position: (v / a) / 3 };
  if (v < b) return { level: "moderate", position: 1 / 3 + ((v - a) / (b - a)) / 3 };
  return { level: "high", position: Math.min(1, 2 / 3 + ((v - b) / Math.max(1, max - b)) / 3) };
}

const pct = (part: number, kcal: number) => (kcal > 0 ? (part / kcal) * 100 : 0);

/** Fiber, added sugar and processing for a meal from its items. */
export function qualityFromItems(items: Pick<MealItem, "calories" | "fiber" | "sugar" | "processing">[]): {
  fiber: number | null;
  sugar: number | null;
  processing: number | null;
} {
  if (!items.length) return { fiber: null, sugar: null, processing: null };
  const has = (k: "fiber" | "sugar" | "processing") => items.some((i) => typeof i[k] === "number");
  const sum = (k: "fiber" | "sugar") => Math.round(items.reduce((a, i) => a + (typeof i[k] === "number" ? (i[k] as number) : 0), 0) * 10) / 10;
  let processing: number | null = null;
  if (has("processing")) {
    const rated = items.filter((i) => typeof i.processing === "number");
    const w = rated.reduce((a, i) => a + Math.max(1, i.calories), 0);
    const avg = rated.reduce((a, i) => a + (i.processing as number) * Math.max(1, i.calories), 0) / Math.max(1, w);
    // Leans toward the more processed level: 2.4 counts as processed.
    processing = Math.max(1, Math.min(4, Math.floor(avg + 0.6)));
  }
  return { fiber: has("fiber") ? sum("fiber") : null, sugar: has("sugar") ? sum("sugar") : null, processing };
}

export function mealQuality(m: MealNutrition): MealQuality {
  const kcal = Math.max(0, m.calories);
  const out: NutrientResult[] = [];
  const add = (key: NutrientKey, r: { level: Level; position: number } | null, tone: (l: Level) => Tone, detail: string | null) => {
    const label = NUTRIENTS.find((n) => n.key === key)!.label;
    out.push({ key, label, level: r?.level ?? null, position: r?.position ?? null, tone: r ? tone(r.level) : "neutral", detail });
  };
  const fmt = (g: number) => `${Math.round(g * 10) / 10} g`;

  if (kcal < 15) {
    // Water, black coffee: nothing to score.
    return { score: null, band: null, nutrients: NUTRIENTS.map((n) => ({ ...n, level: null, position: null, tone: "neutral", detail: null })), partial: false };
  }

  const pP = pct(m.protein * 4, kcal);
  const protein = m.protein >= 30 ? { level: "high" as Level, position: Math.max(0.7, place(pP, 15, 25, 50).position) } : place(pP, 15, 25, 50);
  add("protein", protein, (l) => (l === "high" ? "good" : l === "moderate" ? "neutral" : "watch"), `${fmt(m.protein)} · ${Math.round(pP)}% of calories`);

  const fiberPer500 = m.fiber != null ? (m.fiber / kcal) * 500 : null;
  add("fiber", fiberPer500 != null ? place(fiberPer500, 3, 7, 14) : null, (l) => (l === "high" ? "good" : l === "moderate" ? "neutral" : "watch"), m.fiber != null ? fmt(m.fiber) : null);

  add(
    "processing",
    m.processing != null ? { level: m.processing <= 2 ? "low" : m.processing === 3 ? "moderate" : "high", position: (m.processing - 0.5) / 4 } : null,
    (l) => (l === "low" ? "good" : l === "moderate" ? "neutral" : "watch"),
    m.processing != null ? PROCESSING_LABEL[m.processing] : null,
  );

  const sP = m.sugar != null ? pct(m.sugar * 4, kcal) : null;
  add("sugar", sP != null ? place(sP, 5, 10, 25) : null, (l) => (l === "low" ? "good" : l === "moderate" ? "neutral" : "watch"), m.sugar != null ? `${fmt(m.sugar)} · ${Math.round(sP!)}% of calories` : null);

  const fP = pct(m.fat * 9, kcal);
  add("fat", place(fP, 25, 40, 70), (l) => (l === "moderate" ? "good" : l === "low" ? "neutral" : "watch"), `${fmt(m.fat)} · ${Math.round(fP)}% of calories`);

  const cP = pct(m.carbs * 4, kcal);
  add("carbs", place(cP, 35, 55, 85), (l) => (l === "moderate" ? "good" : l === "low" ? "neutral" : "watch"), `${fmt(m.carbs)} · ${Math.round(cP)}% of calories`);

  const lv = (k: NutrientKey) => out.find((n) => n.key === k)!.level;
  let score = 55;
  score += { high: 15, moderate: 5, low: -10 }[lv("protein")!];
  const fib = lv("fiber");
  if (fib) score += { high: 15, moderate: 5, low: -5 }[fib];
  const pro = lv("processing");
  if (pro) score += { low: 15, moderate: 0, high: -20 }[pro];
  const sug = lv("sugar");
  if (sug) score += { low: 5, moderate: -5, high: -20 }[sug];
  if (lv("fat") === "high") score -= 10;
  if (lv("carbs") === "high" && fib !== "high" && fib !== "moderate") score -= 5;
  score = Math.max(0, Math.min(100, Math.round(score)));

  return { score, band: bandFor(score), nutrients: out, partial: fib == null || pro == null || sug == null };
}

export function bandFor(score: number): Band {
  return [...BANDS].reverse().find((b) => score >= b.min)!.key;
}
export const bandLabel = (b: Band) => BANDS.find((x) => x.key === b)!.label;

/** A short, plain line on the meal when there is no AI note. */
export function advisorFallback(q: MealQuality): string | null {
  if (q.score == null) return null;
  const get = (k: NutrientKey) => q.nutrients.find((n) => n.key === k)!;
  const good: string[] = [];
  const tips: string[] = [];
  if (get("protein").level === "high") good.push("plenty of protein for muscle repair");
  else if (get("protein").level === "low") tips.push("add eggs, tofu, fish or lean meat for protein");
  if (get("fiber").level === "high") good.push("good fiber to keep you full");
  else if (get("fiber").level === "low") tips.push("add vegetables, fruit or beans for fiber");
  if (get("processing").level === "low") good.push("mostly whole foods");
  else if (get("processing").level === "high") tips.push("swap packaged foods for fresh ones when you can");
  if (get("sugar").level === "high") tips.push("go for less sugar in drinks and sauces");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const a = good.length ? `${cap(good.join(", "))}.` : "";
  const b = tips.length ? `${cap(tips.slice(0, 2).join(", and "))}.` : "";
  return [a, b].filter(Boolean).join(" ") || "A balanced meal.";
}

// ---- Meal timing ----

/** Typical time for a meal slot, in minutes after midnight. */
export const SLOT_MINUTES: Record<string, number> = { breakfast: 8 * 60, lunch: 12 * 60 + 30, dinner: 19 * 60, snack: 15 * 60 + 30 };

export const fmtClock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min) % 60).padStart(2, "0")}`;

export type TimedMeal = { date: string; minutes: number; band: Band | null; calories: number };

export type Regularity = {
  /** Days with 2+ timed meals in the window. */
  days: number;
  needed: number;
  calibrating: boolean;
  score: number | null;
  label: string;
  firstAvg: number | null;
  firstSd: number | null;
  lastAvg: number | null;
  lastSd: number | null;
  windowAvg: number | null;
  lateDays: number;
};

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};

/**
 * How steady your meal times are: the spread of your first and last meal
 * times over the last 14 days. Needs 5 days with 2+ meals to calibrate.
 */
export function mealRegularity(meals: TimedMeal[], needed = 5): Regularity {
  const byDay = new Map<string, number[]>();
  for (const m of meals) if (m.calories >= 30) byDay.set(m.date, [...(byDay.get(m.date) ?? []), m.minutes]);
  const days = [...byDay.values()].filter((t) => t.length >= 2).map((t) => t.sort((a, b) => a - b));
  const lateDays = [...byDay.values()].filter((t) => Math.max(...t) >= 21 * 60).length;
  if (days.length < needed) {
    return { days: days.length, needed, calibrating: true, score: null, label: "Calibrating", firstAvg: null, firstSd: null, lastAvg: null, lastSd: null, windowAvg: null, lateDays };
  }
  const first = days.map((d) => d[0]);
  const last = days.map((d) => d[d.length - 1]);
  const spread = (sd(first) + sd(last)) / 2;
  // 0 min spread → 100, 2 h spread → 0.
  const score = Math.max(0, Math.min(100, Math.round(100 - (spread / 120) * 100)));
  return {
    days: days.length,
    needed,
    calibrating: false,
    score,
    label: score >= 75 ? "Regular" : score >= 50 ? "Fairly regular" : "Irregular",
    firstAvg: Math.round(mean(first)),
    firstSd: Math.round(sd(first)),
    lastAvg: Math.round(mean(last)),
    lastSd: Math.round(sd(last)),
    windowAvg: Math.round(mean(days.map((d) => d[d.length - 1] - d[0]))),
    lateDays,
  };
}
