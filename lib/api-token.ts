import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Issues a token for a user. Only its hash is stored; the plain token is returned once. */
export async function createApiToken(userId: string, name?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const expiresAt = new Date(now + TOKEN_TTL_MS);
  await db.insert(apiTokens).values({
    userId,
    tokenHash: hashToken(token),
    name: name || null,
    createdAt: new Date(now),
    expiresAt,
  });
  return { token, expiresAt };
}

/** The bearer token on a request, or null. */
export function bearerToken(headers: Headers): string | null {
  const m = /^Bearer\s+(\S{1,512})$/i.exec(headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

/**
 * Looks up a token (not revoked, not expired). Never throws: any failure
 * means "no user", so a bad token can't break a web page.
 */
export async function resolveApiToken(token: string): Promise<{ userId: string; tokenId: string } | null> {
  try {
    const now = new Date();
    const [row] = await db
      .select({ id: apiTokens.id, userId: apiTokens.userId })
      .from(apiTokens)
      .where(and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt), gt(apiTokens.expiresAt, now)))
      .limit(1);
    if (!row) return null;
    // last_used_at moves at most once an hour, so reads stay read-only most of the time.
    await db
      .update(apiTokens)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(apiTokens.id, row.id),
          or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, new Date(now.getTime() - TOUCH_EVERY_MS))),
        ),
      )
      .catch(() => {});
    return { userId: row.userId, tokenId: row.id };
  } catch (err) {
    console.error("[api-token] lookup failed:", err);
    return null;
  }
}

export async function revokeApiToken(tokenId: string) {
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.id, tokenId), isNull(apiTokens.revokedAt)));
}
