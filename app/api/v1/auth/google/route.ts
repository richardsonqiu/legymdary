import { googleLoginRequestSchema, type AuthResponse } from "@legymdary/shared";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, users } from "@/db/schema";
import { jsonError, parseBody } from "@/lib/api-auth";
import { createApiToken } from "@/lib/api-token";
import { verifyGoogleIdToken } from "@/lib/google-id-token";
import { clientIp, rateLimit, tooMany } from "@/lib/rate-limit";

const FIFTEEN_MIN = 15 * 60 * 1000;

/**
 * Native Google sign-in. The user must already have signed in with Google on
 * the web: we match ONLY the existing `account` row (provider google +
 * the token's `sub`). No linking by email, so a Google account that merely
 * shares an email with a password account can't take it over.
 */
export async function POST(request: Request) {
  const parsed = await parseBody(request, googleLoginRequestSchema);
  if ("response" in parsed) return parsed.response;

  const ip = await clientIp(request.headers);
  const limit = await rateLimit(`login:google:ip:${ip}`, 30, FIFTEEN_MIN);
  if (!limit.ok) return jsonError(tooMany(limit.retryAfterSec), 429, { "Retry-After": String(limit.retryAfterSec) });

  const claims = await verifyGoogleIdToken(parsed.data.idToken);
  if (!claims) return jsonError("Invalid Google sign-in", 401);

  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(eq(accounts.provider, "google"), eq(accounts.providerAccountId, claims.sub)))
    .limit(1);
  if (!row) return jsonError("Invalid Google sign-in", 401);

  const { token, expiresAt } = await createApiToken(row.id, parsed.data.deviceName);
  const body: AuthResponse = { token, expiresAt: expiresAt.toISOString(), user: row };
  return Response.json(body);
}
