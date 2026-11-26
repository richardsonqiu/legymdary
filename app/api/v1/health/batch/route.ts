import { healthBatchRequestSchema } from "@legymdary/shared";
import { body, ok, route } from "@/lib/services/http";
import { syncHealthBatch } from "@/lib/services/health";

/** Send up to 400 days / nights / workouts / weigh-ins per call and keep each body under about 4 MB. */
export const POST = route(async (request, { userId }) => {
  const input = await body(request, healthBatchRequestSchema);
  return ok(await syncHealthBatch(userId, input));
});
