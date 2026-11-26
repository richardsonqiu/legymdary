import { healthBatchRequestSchema } from "@legymdary/shared";
import { body, ok, route } from "@/lib/services/http";
import { syncHealthBatch } from "@/lib/services/health";

/**
 * Send up to 400 days / nights / workouts / weigh-ins per call and keep each body under about 4 MB.
 * Send `workoutRange` only on the LAST batch of a range: it removes stored workouts of the same
 * source in that range that are not in this batch, so earlier batches would be deleted by it.
 * Over the hourly limit the answer is 429 with Retry-After (seconds).
 */
export const POST = route(async (request, { userId }) => {
  const input = await body(request, healthBatchRequestSchema);
  return ok(await syncHealthBatch(userId, input));
});
