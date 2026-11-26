import { logBodyStatRequestSchema, type BodyStatsResponse } from "@legymdary/shared";
import { getBodyStats } from "@/lib/queries";
import { logBodyStat } from "@/lib/services/body";
import { bodyStatDto } from "@/lib/services/dto";
import { body, fromResult, ok, route } from "@/lib/services/http";

/** All weigh-ins, oldest first. */
export const GET = route(async () => {
  const res: BodyStatsResponse = { bodyStats: (await getBodyStats()).map(bodyStatDto) };
  return ok(res);
});

/** Adds or replaces the weigh-in for a date. */
export const POST = route(async (request, { userId }) => {
  const input = await body(request, logBodyStatRequestSchema);
  const r = await logBodyStat(userId, input);
  return fromResult({ ok: true, ...r }, 201);
});
