import { auth } from "@/auth";

/** The signed-in user's id, or throws (the proxy already gates routes). */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("Not authenticated");
  return id;
}

export async function getSessionUser() {
  const session = await auth();
  return session?.user ?? null;
}
