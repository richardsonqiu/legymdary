import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { meals } from "@/db/schema";
import { fail, idOf, route, type IdCtx } from "@/lib/services/http";

/** The meal's thumbnail as an image (the web route is cookie-only). */
export const GET = route<IdCtx>(async (_request, { userId }, ctx) => {
  const id = await idOf(ctx);
  const [row] = await db
    .select({ photo: meals.photo })
    .from(meals)
    .where(and(eq(meals.id, id), eq(meals.userId, userId)))
    .limit(1);
  const m = row?.photo && /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(row.photo);
  if (!m) return fail("Not found", 404);
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "X-Content-Type-Options": "nosniff" },
  });
});
