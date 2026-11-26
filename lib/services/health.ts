import type { HealthBatchRequest, HealthSource } from "@legymdary/shared";
import { deleteHealthData, refreshAppleHealthStatus, storeAppleHealthBatch } from "@/lib/apple-health/store";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { UserError } from "./util";

const HOUR = 60 * 60 * 1000;

/** One batch from the phone (HealthKit or Health Connect). Same 300/hour limit as the web upload. */
export async function syncHealthBatch(userId: string, input: HealthBatchRequest): Promise<{ ok: true }> {
  const limit = await rateLimit(`apple:import:${userId}`, 300, HOUR);
  if (!limit.ok) throw new UserError(tooMany(limit.retryAfterSec));
  const { source, workoutRange, ...batch } = input;
  await storeAppleHealthBatch(userId, batch, { source, workoutRange });
  if (source === "apple") await refreshAppleHealthStatus(userId);
  return { ok: true };
}

/** Deletes only the chosen source's data. */
export async function disconnectHealth(userId: string, source: HealthSource): Promise<{ ok: true }> {
  await deleteHealthData(userId, source);
  return { ok: true };
}
