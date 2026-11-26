import { z } from "zod";
import { ymdSchema } from "./food";

/** Request and response shapes for /api/v1/workouts, /exercises, /templates, /sets. */

export const loggedSetSchema = z.object({
  id: z.number(),
  reps: z.number(),
  weight: z.number(),
  isWarmup: z.boolean(),
  notes: z.string().nullable(),
});

export const workoutExerciseSchema = z.object({
  workoutExerciseId: z.number(),
  exerciseId: z.number(),
  name: z.string(),
  muscleGroup: z.string(),
  equipment: z.string(),
  sets: z.array(loggedSetSchema),
  targetSets: z.number().nullable(),
  targetReps: z.string().nullable(),
  targetWeight: z.number().nullable(),
});

export const workoutDtoSchema = z.object({
  id: z.number(),
  name: z.string(),
  date: ymdSchema,
  notes: z.string().nullable(),
  finished: z.boolean(),
  exercises: z.array(workoutExerciseSchema),
  totalSets: z.number(),
  totalVolume: z.number(),
  exerciseCount: z.number(),
  /** ISO time the session started. */
  startedAt: z.string().nullable(),
  garminActivityId: z.string().nullable(),
  planKey: z.string().nullable(),
});
export type WorkoutDto = z.infer<typeof workoutDtoSchema>;

export const workoutsResponseSchema = z.object({ workouts: z.array(workoutDtoSchema) });
export type WorkoutsResponse = z.infer<typeof workoutsResponseSchema>;
export const workoutResponseSchema = z.object({ workout: workoutDtoSchema.nullable() });
export type WorkoutResponse = z.infer<typeof workoutResponseSchema>;

export const createWorkoutRequestSchema = z.object({ name: z.string().max(200), date: ymdSchema });
export type CreateWorkoutRequest = z.infer<typeof createWorkoutRequestSchema>;

export const updateWorkoutRequestSchema = z.object({
  name: z.string().max(200).optional(),
  date: ymdSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
});
export type UpdateWorkoutRequest = z.infer<typeof updateWorkoutRequestSchema>;

export const workoutIdResponseSchema = z.object({ id: z.number() });
export type WorkoutIdResponse = z.infer<typeof workoutIdResponseSchema>;

export const fromTemplateRequestSchema = z.object({ templateId: z.number().int(), date: ymdSchema.optional() });
export type FromTemplateRequest = z.infer<typeof fromTemplateRequestSchema>;

export const addExerciseRequestSchema = z.object({ exerciseId: z.number().int() });
export type AddExerciseRequest = z.infer<typeof addExerciseRequestSchema>;
export const workoutExerciseIdResponseSchema = z.object({ workoutExerciseId: z.number() });

export const logSetRequestSchema = z.object({
  reps: z.number().int().min(1).max(1000),
  weight: z.number().min(0).max(2000),
  isWarmup: z.boolean().optional(),
  notes: z.string().max(1000).nullish(),
});
export type LogSetRequest = z.infer<typeof logSetRequestSchema>;
export const logSetResponseSchema = z.object({ isPR: z.boolean(), e1rm: z.number() });
export type LogSetResponse = z.infer<typeof logSetResponseSchema>;

export const exerciseDtoSchema = z.object({
  id: z.number(),
  name: z.string(),
  muscleGroup: z.string(),
  equipment: z.string(),
  isCustom: z.boolean(),
});
export type ExerciseDto = z.infer<typeof exerciseDtoSchema>;
export const exercisesResponseSchema = z.object({ exercises: z.array(exerciseDtoSchema) });
export type ExercisesResponse = z.infer<typeof exercisesResponseSchema>;

export const createExerciseRequestSchema = z.object({
  name: z.string().max(200),
  muscleGroup: z.string().max(80).default("Other"),
  equipment: z.string().max(80).default("Other"),
});
export type CreateExerciseRequest = z.infer<typeof createExerciseRequestSchema>;

export const templateDtoSchema = z.object({
  id: z.number(),
  name: z.string(),
  lastUsedAt: z.string().nullable(),
  exercises: z.array(z.object({ name: z.string(), targetSets: z.number().nullable() })),
});
export type TemplateDto = z.infer<typeof templateDtoSchema>;
export const templatesResponseSchema = z.object({ templates: z.array(templateDtoSchema) });
export type TemplatesResponse = z.infer<typeof templatesResponseSchema>;
