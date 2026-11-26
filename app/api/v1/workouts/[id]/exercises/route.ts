import { addExerciseRequestSchema } from "@legymdary/shared";
import { body, idOf, ok, route, type IdCtx } from "@/lib/services/http";
import { addExerciseToWorkout } from "@/lib/services/workouts";

export const POST = route<IdCtx>(async (request, { userId }, ctx) => {
  const id = await idOf(ctx);
  const { exerciseId } = await body(request, addExerciseRequestSchema);
  return ok({ workoutExerciseId: await addExerciseToWorkout(userId, id, exerciseId) }, 201);
});
