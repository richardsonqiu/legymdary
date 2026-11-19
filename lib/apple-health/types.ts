import { z } from "zod";

/**
 * The compact summary an Apple Health export is reduced to. Parsing happens
 * in the browser (an export is often 1 GB+), so only these daily rows,
 * nights, workouts and weigh-ins are ever sent to the server.
 */

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localTs = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
const n = z.number().finite().nullable();

export const ahDaySchema = z.object({
  date,
  steps: n,
  activeKcal: n,
  basalKcal: n,
  exerciseMin: n,
  restingHr: n,
  /** Apple's HRV is SDNN (ms), averaged over the night when there are night readings. */
  hrv: n,
  hrvWeekly: n,
});

export const ahSleepSchema = z.object({
  /** The morning you woke up (Garmin dates nights the same way). */
  date,
  startLocal: localTs,
  endLocal: localTs,
  startUtc: z.string().max(30),
  asleepSec: z.number().finite(),
  inBedSec: z.number().finite(),
  deepSec: n,
  remSec: n,
  lightSec: n,
  awakeSec: n,
  awakeCount: n,
  avgHr: n,
  respiration: n,
  spo2Avg: n,
  spo2Low: n,
});

export const ahWorkoutSchema = z.object({
  id: z.string().regex(/^apple-[\w-]{1,34}$/),
  date,
  startLocal: localTs,
  type: z.string().max(60),
  name: z.string().max(80),
  durationSec: n,
  kcal: n,
  distanceM: n,
  avgHr: n,
  maxHr: n,
  minHr: n,
  /** Seconds in each of Apple's 5 heart-rate zones, when the watch recorded them. */
  zonesSec: z.array(z.number().finite()).length(5).nullable(),
});

export const ahWeighInSchema = z.object({
  date,
  weight: n,
  bodyFat: n,
});

export const ahBatchSchema = z.object({
  days: z.array(ahDaySchema).max(400),
  sleep: z.array(ahSleepSchema).max(400),
  workouts: z.array(ahWorkoutSchema).max(400),
  body: z.array(ahWeighInSchema).max(400),
});

export type AhDay = z.infer<typeof ahDaySchema>;
export type AhSleep = z.infer<typeof ahSleepSchema>;
export type AhWorkout = z.infer<typeof ahWorkoutSchema>;
export type AhWeighIn = z.infer<typeof ahWeighInSchema>;
export type AhBatch = z.infer<typeof ahBatchSchema>;

export type AhSummary = AhBatch & {
  from: string | null;
  to: string | null;
  /** Devices and apps that wrote the data, most records first. */
  sources: string[];
  records: number;
};

/** Splits a summary into batches small enough for one server action each. */
export function batchesOf(s: AhBatch, size = 300): AhBatch[] {
  const count = Math.max(
    Math.ceil(s.days.length / size),
    Math.ceil(s.sleep.length / size),
    Math.ceil(s.workouts.length / size),
    Math.ceil(s.body.length / size),
    1,
  );
  return Array.from({ length: count }, (_, i) => ({
    days: s.days.slice(i * size, (i + 1) * size),
    sleep: s.sleep.slice(i * size, (i + 1) * size),
    workouts: s.workouts.slice(i * size, (i + 1) * size),
    body: s.body.slice(i * size, (i + 1) * size),
  }));
}
