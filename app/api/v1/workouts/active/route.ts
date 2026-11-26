import type { WorkoutResponse } from "@legymdary/shared";
import { getActiveWorkout } from "@/lib/queries";
import { workoutDto } from "@/lib/services/dto";
import { ok, route } from "@/lib/services/http";

/** The unfinished workout, or `{ workout: null }`. */
export const GET = route(async () => {
  const w = await getActiveWorkout();
  const res: WorkoutResponse = { workout: w ? workoutDto(w) : null };
  return ok(res);
});
