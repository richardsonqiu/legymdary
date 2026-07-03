import { cache } from "react";
import { auth } from "@/auth";

/** Deduped per request so multiple queries don't re-decode the session. */
export const getSessionUser = cache(async () => {
  const session = await auth();
  return session?.user ?? null;
});

/** The signed-in user's id, or throws (the proxy already gates routes). */
export async function requireUserId(): Promise<string> {
  const user = await getSessionUser();
  if (!user?.id) throw new Error("Not authenticated");
  return user.id;
}
