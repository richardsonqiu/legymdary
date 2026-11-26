import { z } from "zod";
import { ahBatchSchema, ahWorkoutSchema } from "../apple-health/types";

/**
 * POST /api/v1/health/batch. The same daily rows, nights, workouts and weigh-ins as an
 * Apple Health export batch, plus where they came from. Workout ids start with "apple-"
 * (iPhone HealthKit) or "hc-" (Android Health Connect).
 */
export const HEALTH_SOURCES = ["apple", "health_connect"] as const;
export type HealthSource = (typeof HEALTH_SOURCES)[number];

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const healthBatchRequestSchema = ahBatchSchema
  .extend({
    source: z.enum(HEALTH_SOURCES),
    workouts: z.array(ahWorkoutSchema.extend({ id: z.string().regex(/^(?:apple|hc)-[\w-]{1,34}$/) })).max(400),
    /**
     * Set when this batch holds EVERY workout of these dates: stored workouts of the same
     * source in this range that are not in the batch are removed (same workout, new id).
     */
    workoutRange: z.object({ from: ymd, to: ymd }).optional(),
  })
  .refine((b) => b.workouts.every((w) => w.id.startsWith(b.source === "apple" ? "apple-" : "hc-")), {
    message: "Workout ids must start with apple- (apple) or hc- (health_connect)",
  });
export type HealthBatchRequest = z.infer<typeof healthBatchRequestSchema>;

export const disconnectHealthRequestSchema = z.object({ source: z.enum(HEALTH_SOURCES) });
export type DisconnectHealthRequest = z.infer<typeof disconnectHealthRequestSchema>;
