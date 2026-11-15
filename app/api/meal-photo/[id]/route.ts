import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { meals } from "@/db/schema";
import { getSessionUser } from "@/lib/session";

/**
 * Serves a meal's thumbnail as an image. A meal's photo never changes, so the
 * browser may cache it for good (private: it's the user's own data).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.id) return new Response("Not signed in", { status: 401 });
  const { id } = await ctx.params;
  if (!/^\d{1,12}$/.test(id)) return new Response("Bad id", { status: 400 });
  const [row] = await db
    .select({ photo: meals.photo })
    .from(meals)
    .where(and(eq(meals.id, Number(id)), eq(meals.userId, user.id)))
    .limit(1);
  const m = row?.photo && /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(row.photo);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: {
      "Content-Type": m[1],
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
