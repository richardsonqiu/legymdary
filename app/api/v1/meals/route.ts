import { mealInputSchema, type MealItem, type MealsResponse } from "@legymdary/shared";
import { getMeals } from "@/lib/queries";
import { userToday } from "@/lib/session";
import { dateParam, body, fail, ok, route } from "@/lib/services/http";
import { mealDto } from "@/lib/services/dto";
import { saveMeal } from "@/lib/services/food";

/** GET ?date=YYYY-MM-DD (default today), or ?from=&to= for a range of up to 62 days. */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const today = await userToday();
  const single = dateParam(url, "date", today);
  const from = dateParam(url, "from", single);
  const to = dateParam(url, "to", url.searchParams.has("from") ? today : single);
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86_400_000 > 62) {
    return fail("Invalid range");
  }
  const res: MealsResponse = { meals: (await getMeals(from, to)).map(mealDto) };
  return ok(res);
});

export const POST = route(async (request, { userId }) => {
  const input = await body(request, mealInputSchema);
  const { id } = await saveMeal(userId, { ...input, items: input.items as MealItem[] });
  return ok({ id }, 201);
});
