import { saveGoalsRequestSchema } from "@legymdary/shared";
import { body, fromResult, route } from "@/lib/services/http";
import { saveGoals } from "@/lib/services/plan";

export const PUT = route(async (request, { userId }) => {
  const input = await body(request, saveGoalsRequestSchema);
  return fromResult(await saveGoals(userId, input));
});
