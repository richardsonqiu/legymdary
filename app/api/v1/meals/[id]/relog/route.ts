import { relogMealRequestSchema } from "@legymdary/shared";
import { relogMeal } from "@/lib/services/food";
import { body, idOf, ok, route, type IdCtx } from "@/lib/services/http";

/** "Eat again": copies this meal onto another day. No AI call. */
export const POST = route<IdCtx>(async (request, { userId }, ctx) => {
  const id = await idOf(ctx);
  const input = await body(request, relogMealRequestSchema);
  await relogMeal(userId, { mealId: id, ...input });
  return ok({ ok: true }, 201);
});
