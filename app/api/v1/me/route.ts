import type { MeResponse } from "@legymdary/shared";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { jsonError, withAuth } from "@/lib/api-auth";

export const GET = withAuth(async (_request, { userId }) => {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return jsonError("Unauthorized", 401);
  const body: MeResponse = { user };
  return Response.json(body);
});
