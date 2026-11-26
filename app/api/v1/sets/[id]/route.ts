import { idOf, ok, route, type IdCtx } from "@/lib/services/http";
import { deleteSet } from "@/lib/services/workouts";

export const DELETE = route<IdCtx>(async (_request, { userId }, ctx) => {
  await deleteSet(userId, await idOf(ctx));
  return ok({ ok: true });
});
