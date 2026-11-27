import { z } from "zod";

/** Request and response shapes for /api/v1/meals/* and /api/v1/today. Dates are YYYY-MM-DD, times ISO 8601. */

export const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const macros = { calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() };

/** One food in a meal. The server cleans and caps every field again on save. */
export const mealItemSchema = z.object({
  name: z.string().max(200),
  portion: z.string().max(200).optional(),
  ...macros,
  dish: z.string().nullish(),
  reference: z.string().nullish(),
  amount: z.string().nullish(),
  calculation: z.string().nullish(),
  assumptions: z.string().nullish(),
  edited: z.boolean().optional(),
  base: z.object(macros).nullish(),
  eaten: z.number().nullish(),
  drink: z.boolean().nullish(),
  fiber: z.number().nullish(),
  sugar: z.number().nullish(),
  processing: z.number().nullish(),
});
export type MealItemDto = z.infer<typeof mealItemSchema>;

export const mealDtoSchema = z.object({
  id: z.number(),
  date: ymdSchema,
  mealType: z.string(),
  name: z.string(),
  ...macros,
  items: z.array(mealItemSchema),
  notes: z.string().nullable(),
  aiEstimated: z.boolean(),
  /** Minutes after local midnight, or null for older meals. */
  eatenAt: z.number().nullable(),
  fiber: z.number().nullable(),
  sugar: z.number().nullable(),
  processing: z.number().nullable(),
  advisor: z.string().nullable(),
  /** Fetch the image from GET /api/v1/meals/{id}/photo (needs the bearer token). */
  hasPhoto: z.boolean(),
  createdAt: z.string(),
});
export type MealDto = z.infer<typeof mealDtoSchema>;

export const mealsResponseSchema = z.object({ meals: z.array(mealDtoSchema) });
export type MealsResponse = z.infer<typeof mealsResponseSchema>;
export const mealResponseSchema = z.object({ meal: mealDtoSchema });
export type MealResponse = z.infer<typeof mealResponseSchema>;

export const mealInputSchema = z.object({
  date: ymdSchema,
  mealType: z.string().max(20),
  name: z.string().max(200),
  items: z.array(mealItemSchema).max(40).default([]),
  /** Used only when there are no items (quick entry). */
  calories: z.number().nullish(),
  protein: z.number().nullish(),
  carbs: z.number().nullish(),
  fat: z.number().nullish(),
  notes: z.string().max(2000).nullish(),
  /** A small JPEG/PNG/WebP data URL (max about 300 KB). */
  photo: z.string().max(400_000).nullish(),
  aiEstimated: z.boolean().optional(),
  eatenAt: z.number().int().min(0).max(1439).nullish(),
  advisor: z.string().max(1000).nullish(),
});
export type MealInputDto = z.infer<typeof mealInputSchema>;

export const mealCreatedResponseSchema = z.object({ id: z.number() });
export type MealCreatedResponse = z.infer<typeof mealCreatedResponseSchema>;

export const analyzeMealRequestSchema = z.object({
  /** A data URL (data:image/jpeg;base64,...) of a downscaled photo. */
  image: z.string().max(7_000_000).nullish(),
  hint: z.string().max(1000).nullish(),
});
export type AnalyzeMealRequest = z.infer<typeof analyzeMealRequestSchema>;

export const mealAnalysisSchema = z.object({
  isFood: z.boolean(),
  name: z.string(),
  advisor: z.string().nullable(),
  items: z.array(mealItemSchema),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z.string(),
});
export type MealAnalysisDto = z.infer<typeof mealAnalysisSchema>;

export const relogMealRequestSchema = z.object({ date: ymdSchema, mealType: z.string().max(20).optional() });
export type RelogMealRequest = z.infer<typeof relogMealRequestSchema>;

export const skipMealRequestSchema = z.object({ date: ymdSchema, mealType: z.string().max(20) });
export type SkipMealRequest = z.infer<typeof skipMealRequestSchema>;

export const okResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof okResponseSchema>;

export const dayTotalsSchema = z.object({ date: ymdSchema, ...macros, count: z.number(), skipped: z.number() });
export type DayTotalsDto = z.infer<typeof dayTotalsSchema>;

export const readinessSchema = z.object({
  verdict: z.enum(["push", "normal", "easy"]),
  headline: z.string(),
  advice: z.string(),
  signals: z.array(z.object({ label: z.string(), value: z.string(), tone: z.enum(["good", "ok", "poor"]) })),
});
export type ReadinessDto = z.infer<typeof readinessSchema>;

export const targetsSchema = z.object({
  calories: z.number(),
  protein: z.number().nullable(),
  carbs: z.number().nullable(),
  fat: z.number().nullable(),
});
export type TargetsDto = z.infer<typeof targetsSchema>;

const nnum = z.number().nullable();

/** The rings and readiness card on Home, the same numbers as the web dashboard. */
export const homeScoresSchema = z.object({
  /** Last night's readiness (0 to 100), or null without a recorded night. */
  readiness: z
    .object({
      score: z.number(),
      band: z.enum(["push", "normal", "easy"]),
      label: z.string(),
      /** The three factors that weigh most, each 0 to 100. */
      factors: z.array(z.object({ label: z.string(), score: z.number() })),
    })
    .nullable(),
  sleepScore: nnum,
  sleepHours: nnum,
  /** Body Battery when you woke. */
  battery: nnum,
  steps: nnum,
  stepGoal: z.number(),
  /** Today's data synced without a night: the watch wasn't worn to bed. */
  noSleepLastNight: z.boolean(),
  /** What feeds recovery: a watch/ring/phone sync, an Apple Health upload, or nothing yet. */
  source: z.enum(["sync", "apple_upload", "none"]),
});
export type HomeScores = z.infer<typeof homeScoresSchema>;

/** GET /api/v1/today?date=YYYY-MM-DD (date defaults to today in the X-Timezone zone). */
export const todayResponseSchema = z.object({
  date: ymdSchema,
  eaten: dayTotalsSchema,
  /** Today's calorie and macro target, or null until the plan has enough data. */
  targets: targetsSchema.nullable(),
  /** Calories added to the target for this day by activity adjustment. */
  bonus: z.number(),
  logged: z.array(z.string()),
  skipped: z.array(z.string()),
  /** Null without a watch/ring/health data source or without enough data. */
  readiness: readinessSchema.nullable(),
  /** Whether Garmin, Oura, Apple Health or Health Connect data exists. */
  wearable: z.boolean(),
  steps: z.number().nullable(),
  activeWorkoutId: z.number().nullable(),
  /** Home rings and readiness card. Only for today; optional so older servers still parse. */
  scores: homeScoresSchema.nullable().optional(),
});
export type TodayResponse = z.infer<typeof todayResponseSchema>;
