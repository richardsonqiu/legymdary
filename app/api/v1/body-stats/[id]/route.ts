import { deleteBodyStat } from "@/lib/services/body";
import { idOf, ok, route, type IdCtx } from "@/lib/services/http";

export const DELETE = route<IdCtx>(async (_request, { userId }, ctx) => {
  await deleteBodyStat(userId, await idOf(ctx));
  return ok({ ok: true });
});
