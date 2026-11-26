import { disconnectHealthRequestSchema } from "@legymdary/shared";
import { body, ok, route } from "@/lib/services/http";
import { disconnectHealth } from "@/lib/services/health";

/** Body `{ source }`: removes only that source's synced data. */
export const DELETE = route(async (request, { userId }) => {
  const { source } = await body(request, disconnectHealthRequestSchema);
  return ok(await disconnectHealth(userId, source));
});
