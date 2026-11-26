import { updateWorkoutRequestSchema, type WorkoutResponse } from "@legymdary/shared";
import { getWorkout } from "@/lib/queries";
import { workoutDto } from "@/lib/services/dto";
import { body, fail, idOf, ok, route, type IdCtx } from "@/lib/services/http";
import { discardWorkout, updateWorkout } from "@/lib/services/workouts";

async function found(id: number) {
  const w = await getWorkout(id);
  return w ? ok({ workout: workoutDto(w) } satisfies WorkoutResponse) : fail("Workout not found", 404);
}

export const GET = route<IdCtx>(async (_request, _auth, ctx) => found(await idOf(ctx)));

export const PATCH = route<IdCtx>(async (request, { userId }, ctx) => {
  const id = await idOf(ctx);
  const input = await body(request, updateWorkoutRequestSchema);
  if (!(await getWorkout(id))) return fail("Workout not found", 404);
  await updateWorkout(userId, id, input);
  return found(id);
});

/** Deletes the workout with its exercises and sets. */
export const DELETE = route<IdCtx>(async (_request, { userId }, ctx) => {
  await discardWorkout(userId, await idOf(ctx));
  return ok({ ok: true });
});
