import { z } from "zod";
import { ahBatchSchema, ahWorkoutSchema } from "../apple-health/types";

/**
 * POST /api/v1/health/batch. The same daily rows, nights, workouts and weigh-ins as an
 * Apple Health export batch, plus where they came from. Workout ids start with "apple-"
 * (iPhone HealthKit) or "hc-" (Android Health Connect).
 */
export const HEALTH_SOURCES = ["apple", "health_connect"] as const;
export type HealthSource = (typeof HEALTH_SOURCES)[number];

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date");

/** Longest workoutRange, in days (the same as the 400 days a batch may hold). */
const MAX_RANGE_DAYS = 400;

export const healthBatchRequestSchema = ahBatchSchema
  .extend({
    source: z.enum(HEALTH_SOURCES),
    workouts: z.array(ahWorkoutSchema.extend({ id: z.string().regex(/^(?:apple|hc)-[\w-]{1,34}$/) })).max(400),
    /**
     * Set when this batch holds EVERY workout of these dates: stored workouts of the same
     * source in this range that are not in the batch are removed (same workout, new id).
     */
    workoutRange: z
      .object({ from: ymd, to: ymd })
      .refine((r) => r.from <= r.to, { message: "workoutRange.from must not be after to" })
      .refine((r) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 < MAX_RANGE_DAYS, {
        message: "workoutRange is too long",
      })
      .optional(),
  })
  .refine((b) => b.workouts.every((w) => w.id.startsWith(b.source === "apple" ? "apple-" : "hc-")), {
    message: "Workout ids must start with apple- (apple) or hc- (health_connect)",
  });
export type HealthBatchRequest = z.infer<typeof healthBatchRequestSchema>;

export const disconnectHealthRequestSchema = z.object({ source: z.enum(HEALTH_SOURCES) });
export type DisconnectHealthRequest = z.infer<typeof disconnectHealthRequestSchema>;
