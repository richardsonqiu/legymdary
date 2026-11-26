import { targetModeRequestSchema } from "@legymdary/shared";
import { body, fromResult, route } from "@/lib/services/http";
import { setTargetMode } from "@/lib/services/plan";

export const PUT = route(async (request, { userId }) => {
  const { mode } = await body(request, targetModeRequestSchema);
  return fromResult(await setTargetMode(userId, mode));
});
