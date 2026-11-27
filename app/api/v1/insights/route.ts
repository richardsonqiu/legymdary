import { dateParam, ok, route } from "@/lib/services/http";
import { insightsDto } from "@/lib/services/insights";

/** Recovery and nutrition summary for one day. ?date=YYYY-MM-DD (default: the newest day with data). */
export const GET = route(async (request, { userId }) => {
  const url = new URL(request.url);
  const date = url.searchParams.has("date") ? dateParam(url, "date", "") : null;
  return ok(await insightsDto(userId, date));
});
