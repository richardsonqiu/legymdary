import { logSetRequestSchema, type LogSetResponse } from "@legymdary/shared";
import { body, idOf, ok, route, type IdCtx } from "@/lib/services/http";
import { logSet } from "@/lib/services/workouts";

/** Logs a set and says whether it is a new personal record. */
export const POST = route<IdCtx>(async (request, { userId }, ctx) => {
  const workoutExerciseId = await idOf(ctx);
  const input = await body(request, logSetRequestSchema);
  const res: LogSetResponse = await logSet(userId, { workoutExerciseId, ...input });
  return ok(res, 201);
});
