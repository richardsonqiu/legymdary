import { addDaysStr, foodStreak, weekStreak, type ConsistencyResponse } from "@legymdary/shared";
import { getConsistencyDays } from "@/lib/queries";
import { userToday } from "@/lib/session";
import { dateParam, fail, ok, route } from "@/lib/services/http";

/** Per-day sets, activities and food counts plus streaks. ?from=&to= (default: last 90 days; at most 400). */
export const GET = route(async (request) => {
  const url = new URL(request.url);
  const today = await userToday();
  const from = dateParam(url, "from", addDaysStr(today, -90));
  const to = dateParam(url, "to", addDaysStr(today, 1));
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86_400_000 > 400) return fail("Invalid range");
  const days = await getConsistencyDays(from, to);
  // Streaks look back from today, so they use the last year whatever range was asked for.
  const all = from <= addDaysStr(today, -380) ? days : await getConsistencyDays(addDaysStr(today, -380), addDaysStr(today, 1));
  const byDate = new Map(all.map((d) => [d.date, d]));
  const res: ConsistencyResponse = { days, foodStreak: foodStreak(byDate, today), weekStreak: weekStreak(byDate, today) };
  return ok(res);
});
