import { skipMealRequestSchema } from "@legymdary/shared";
import { skipMeal, unskipMeal } from "@/lib/services/food";
import { body, fromResult, ok, route } from "@/lib/services/http";

export const POST = route(async (request, { userId }) => {
  const input = await body(request, skipMealRequestSchema);
  return fromResult(await skipMeal(userId, input));
});

export const DELETE = route(async (request, { userId }) => {
  const input = await body(request, skipMealRequestSchema);
  await unskipMeal(userId, input);
  return ok({ ok: true });
});
