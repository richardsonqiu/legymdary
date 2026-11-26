import { fromResult, route } from "@/lib/services/http";
import { startRecommendedWorkout } from "@/lib/services/workouts";

/** Starts today's recommended session with its exercises and targets. */
export const POST = route(async (_request, { userId }) => fromResult(await startRecommendedWorkout(userId), 201));
