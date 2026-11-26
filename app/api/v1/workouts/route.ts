import { createWorkoutRequestSchema, type WorkoutsResponse } from "@legymdary/shared";
import { getWorkoutDetails } from "@/lib/queries";
import { workoutDto } from "@/lib/services/dto";
import { body, ok, route } from "@/lib/services/http";
import { createWorkout } from "@/lib/services/workouts";

/** Newest first. ?limit=1..100 (default 30). */
export const GET = route(async (request) => {
  const n = Number(new URL(request.url).searchParams.get("limit") ?? 30);
  const limit = Number.isInteger(n) ? Math.min(100, Math.max(1, n)) : 30;
  const res: WorkoutsResponse = { workouts: (await getWorkoutDetails(limit)).map(workoutDto) };
  return ok(res);
});

export const POST = route(async (request, { userId }) => {
  const input = await body(request, createWorkoutRequestSchema);
  return ok({ id: await createWorkout(userId, input) }, 201);
});
