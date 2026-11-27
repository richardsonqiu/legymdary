import { z } from "zod";
import { ymdSchema } from "./food";

/** GET /api/v1/insights?date=YYYY-MM-DD: the recovery and nutrition summary the web Insights page shows (no AI brief). */

const nn = z.number().nullable();

export const insightsReadinessSchema = z.object({
  score: z.number(),
  band: z.enum(["push", "normal", "easy"]),
  label: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  contributors: z.array(z.object({ label: z.string(), score: z.number(), detail: z.string() })),
});

export const insightsSleepSchema = z.object({
  hours: nn,
  needHours: z.number(),
  score: nn,
  bedtime: z.string().nullable(),
  wake: z.string().nullable(),
  hrv: nn,
  hrvUsual: nn,
  restingHr: nn,
  restingHrUsual: nn,
  bodyBatteryAtWake: nn,
  /** One-line verdict from the rules-only sleep summary. */
  headline: z.string().nullable(),
  verdict: z.enum(["excellent", "good", "fair", "poor"]).nullable(),
});

export const insightsYesterdaySchema = z.object({
  date: ymdSchema,
  strain: z.number(),
  eatenKcal: z.number(),
  burnedKcal: nn,
  netKcal: nn,
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  meals: z.number(),
  skippedMeals: z.number(),
  fullyLogged: z.boolean(),
  steps: nn,
  strengthSets: z.number(),
  activities: z.number(),
});

export const insightsSeriesPointSchema = z.object({
  date: ymdSchema,
  readiness: nn,
  hrv: nn,
  rhr: nn,
  sleepHours: nn,
  eaten: nn,
  burned: nn,
});

export const insightsResponseSchema = z.object({
  date: ymdSchema,
  /** Newest day with sleep or daily data, else today. The page opens here. */
  latest: ymdSchema,
  /** Any watch, ring or health data in the last four months. */
  hasWearableData: z.boolean(),
  readiness: insightsReadinessSchema.nullable(),
  sleep: insightsSleepSchema.nullable(),
  sleepDebtHours: nn,
  yesterday: insightsYesterdaySchema,
  /** Last seven days of fully logged food against watch burn. */
  energy7d: z.object({ fullyLoggedDays: z.number(), avgNetKcal: nn, impliedKgPerWeek: nn }),
  flags: z.array(z.object({ level: z.enum(["info", "warn"]), text: z.string() })),
  patterns: z.array(z.string()),
  coverage: z.object({ sleepDays: z.number(), hrvDays: z.number(), loggedDays: z.number() }),
  series: z.array(insightsSeriesPointSchema),
});
export type InsightsResponse = z.infer<typeof insightsResponseSchema>;
