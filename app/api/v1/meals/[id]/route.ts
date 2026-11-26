import { mealInputSchema, type MealItem, type MealResponse } from "@legymdary/shared";
import { getMeal } from "@/lib/queries";
import { mealDto } from "@/lib/services/dto";
import { deleteMeal, updateMeal } from "@/lib/services/food";
import { body, fail, idOf, ok, route, type IdCtx } from "@/lib/services/http";

async function found(id: number) {
  const m = await getMeal(id);
  return m ? ok({ meal: mealDto(m) } satisfies MealResponse) : fail("Meal not found", 404);
}

export const GET = route<IdCtx>(async (_request, _auth, ctx) => found(await idOf(ctx)));

export const PATCH = route<IdCtx>(async (request, { userId }, ctx) => {
  const id = await idOf(ctx);
  const input = await body(request, mealInputSchema);
  if (!(await getMeal(id))) return fail("Meal not found", 404);
  await updateMeal(userId, id, { ...input, items: input.items as MealItem[] });
  return found(id);
});

export const DELETE = route<IdCtx>(async (_request, { userId }, ctx) => {
  await deleteMeal(userId, await idOf(ctx));
  return ok({ ok: true });
});
