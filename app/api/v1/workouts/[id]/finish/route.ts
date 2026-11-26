import { getWorkout } from "@/lib/queries";
import { workoutDto } from "@/lib/services/dto";
import { fail, idOf, ok, route, type IdCtx } from "@/lib/services/http";
import { finishWorkout } from "@/lib/services/workouts";

export const POST = route<IdCtx>(async (_request, { userId }, ctx) => {
  const id = await idOf(ctx);
  if (!(await getWorkout(id))) return fail("Workout not found", 404);
  await finishWorkout(userId, id);
  const w = await getWorkout(id);
  return ok({ workout: w ? workoutDto(w) : null });
});
