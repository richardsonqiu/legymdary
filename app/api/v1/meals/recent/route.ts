import type { MealsResponse } from "@legymdary/shared";
import { getRecentMeals } from "@/lib/queries";
import { mealDto } from "@/lib/services/dto";
import { ok, route } from "@/lib/services/http";

/** Recent distinct meals for one-tap "eat again". ?limit=1..30 (default 6). */
export const GET = route(async (request) => {
  const n = Number(new URL(request.url).searchParams.get("limit") ?? 6);
  const limit = Number.isInteger(n) ? Math.min(30, Math.max(1, n)) : 6;
  const res: MealsResponse = { meals: (await getRecentMeals(limit)).map(mealDto) };
  return ok(res);
});
