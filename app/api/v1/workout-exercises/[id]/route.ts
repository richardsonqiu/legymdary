import { idOf, ok, route, type IdCtx } from "@/lib/services/http";
import { removeWorkoutExercise } from "@/lib/services/workouts";

export const DELETE = route<IdCtx>(async (_request, { userId }, ctx) => {
  await removeWorkoutExercise(userId, await idOf(ctx));
  return ok({ ok: true });
});
