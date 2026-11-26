import { analyzeMealRequestSchema } from "@legymdary/shared";
import { analyzeMeal } from "@/lib/services/food";
import { body, fromResult, route } from "@/lib/services/http";

/** AI estimate from a photo and/or a description. Same per-user burst and daily limits as the web. */
export const POST = route(async (request, { userId }) => {
  const input = await body(request, analyzeMealRequestSchema);
  return fromResult(await analyzeMeal(userId, input));
});
