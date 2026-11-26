import { createExerciseRequestSchema, type ExercisesResponse } from "@legymdary/shared";
import { getAllExercises } from "@/lib/queries";
import { exerciseDto } from "@/lib/services/dto";
import { body, fromResult, ok, route } from "@/lib/services/http";
import { createExercise } from "@/lib/services/workouts";

/** Built-in exercises plus the user's own. */
export const GET = route(async () => {
  const res: ExercisesResponse = { exercises: (await getAllExercises()).map(exerciseDto) };
  return ok(res);
});

export const POST = route(async (request, { userId }) => {
  const input = await body(request, createExerciseRequestSchema);
  return fromResult(await createExercise(userId, input), 201);
});
