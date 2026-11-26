import { z } from "zod";
import { targetsSchema, ymdSchema } from "./food";

/** Request and response shapes for /api/v1/body-stats, /plan and /stats. */

export const bodyStatDtoSchema = z.object({
  id: z.number(),
  date: ymdSchema,
  weight: z.number().nullable(),
  waist: z.number().nullable(),
  bodyFat: z.number().nullable(),
  /** "manual", "garmin", "apple", "health_connect", "inbody". */
  source: z.string(),
});
export type BodyStatDto = z.infer<typeof bodyStatDtoSchema>;
export const bodyStatsResponseSchema = z.object({ bodyStats: z.array(bodyStatDtoSchema) });
export type BodyStatsResponse = z.infer<typeof bodyStatsResponseSchema>;

export const logBodyStatRequestSchema = z.object({
  date: ymdSchema,
  weight: z.number().nullish(),
  waist: z.number().nullish(),
  bodyFat: z.number().nullish(),
});
export type LogBodyStatRequest = z.infer<typeof logBodyStatRequestSchema>;

export const goalsDtoSchema = z.object({
  sex: z.string().nullable(),
  birthYear: z.number().nullable(),
  heightCm: z.number().nullable(),
  activityLevel: z.string().nullable(),
  targetWeight: z.number().nullable(),
  targetBodyFat: z.number().nullable(),
  weeklyRate: z.number().nullable(),
  targetDate: ymdSchema.nullable(),
  calorieOverride: z.number().nullable(),
  targetMode: z.enum(["steady", "adaptive"]),
  trainingDays: z.number().nullable(),
});
export type GoalsDto = z.infer<typeof goalsDtoSchema>;

export const saveGoalsRequestSchema = z.object({
  sex: z.enum(["male", "female"]).nullish(),
  birthYear: z.number().nullish(),
  heightCm: z.number().nullish(),
  activityLevel: z.string().nullish(),
  targetWeight: z.number().nullish(),
  targetBodyFat: z.number().nullish(),
  /** Leave out to keep the pace chosen with PUT /plan/pace. */
  weeklyRate: z.number().nullish(),
  calorieOverride: z.number().nullish(),
});
export type SaveGoalsRequest = z.infer<typeof saveGoalsRequestSchema>;

export const goalPaceRequestSchema = z.union([
  z.object({ weeklyRate: z.number() }),
  z.object({ targetDate: ymdSchema }),
]);
export type GoalPaceRequest = z.infer<typeof goalPaceRequestSchema>;

export const targetModeRequestSchema = z.object({ mode: z.enum(["steady", "adaptive"]) });
export type TargetModeRequest = z.infer<typeof targetModeRequestSchema>;

export const planDtoSchema = z.object({
  missing: z.array(z.string()),
  maintenanceSource: z.enum(["measured", "garmin", "formula"]).nullable(),
  bmr: z.number().nullable(),
  tdee: z.number().nullable(),
  goalWeight: z.number().nullable(),
  direction: z.enum(["lose", "gain", "maintain"]),
  weeklyRate: z.number(),
  dailyDelta: z.number(),
  calorieTarget: z.number().nullable(),
  protein: z.number().nullable(),
  carbs: z.number().nullable(),
  fat: z.number().nullable(),
  weeksToGoal: z.number().nullable(),
  targetDate: ymdSchema.nullable(),
  usingOverride: z.boolean(),
});
export type PlanDto = z.infer<typeof planDtoSchema>;

/** GET /api/v1/plan */
export const planResponseSchema = z.object({
  goals: goalsDtoSchema.nullable(),
  plan: planDtoSchema,
  /** Today's locked daily target. */
  targets: targetsSchema.nullable(),
  targetMode: z.enum(["steady", "adaptive"]),
  weight: z.number().nullable(),
  bodyFat: z.number().nullable(),
});
export type PlanResponse = z.infer<typeof planResponseSchema>;

export const consistencyDaySchema = z.object({
  date: ymdSchema,
  sets: z.number(),
  garmin: z.number(),
  garminMin: z.number(),
  meals: z.number(),
  skipped: z.number(),
  kcal: z.number(),
});

/** GET /api/v1/stats/consistency?from=&to= */
export const consistencyResponseSchema = z.object({
  days: z.array(consistencyDaySchema),
  foodStreak: z.object({ current: z.number(), longest: z.number() }),
  weekStreak: z.object({ current: z.number(), longest: z.number(), thisWeek: z.number() }),
});
export type ConsistencyResponse = z.infer<typeof consistencyResponseSchema>;
