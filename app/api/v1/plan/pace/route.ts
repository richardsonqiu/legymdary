import { goalPaceRequestSchema } from "@legymdary/shared";
import { body, fromResult, route } from "@/lib/services/http";
import { setGoalPace } from "@/lib/services/plan";

/** Sets the pace (kg a week) or a date to reach the goal by. Setting one clears the other. */
export const PUT = route(async (request, { userId }) => {
  const input = await body(request, goalPaceRequestSchema);
  return fromResult(await setGoalPace(userId, input));
});
