import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const FIFTEEN_MIN = 15 * 60 * 1000;

export type CredentialResult =
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "rate_limited"; retryAfterSec: number };

/**
 * Email + password check with brute-force limits (per account and per IP).
 * The one implementation behind web sign-in (auth.ts) and /api/v1/auth/login.
 * "invalid" covers an unknown email, a wrong password and a Google-only
 * account, so callers can't tell them apart.
 */
export async function checkCredentials(
  rawEmail: unknown,
  rawPassword: unknown,
  headers?: Headers,
): Promise<CredentialResult> {
  const email = String(rawEmail ?? "")
    .trim()
    .toLowerCase();
  const password = String(rawPassword ?? "");
  // Length caps stop huge inputs from being hashed (cheap DoS).
  if (!email || !password || email.length > 254 || password.length > 256) return { ok: false, reason: "invalid" };

  const ip = await clientIp(headers);
  const [byEmail, byIp] = await Promise.all([
    rateLimit(`login:email:${email}`, 10, FIFTEEN_MIN),
    rateLimit(`login:ip:${ip}`, 30, FIFTEEN_MIN),
  ]);
  if (!byEmail.ok || !byIp.ok) {
    return { ok: false, reason: "rate_limited", retryAfterSec: Math.max(byEmail.retryAfterSec, byIp.retryAfterSec) };
  }

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const u = rows[0];
  if (!u?.passwordHash) return { ok: false, reason: "invalid" }; // no account, or a Google-only account
  if (!(await verifyPassword(password, u.passwordHash))) return { ok: false, reason: "invalid" };
  return { ok: true, user: { id: u.id, email: u.email, name: u.name } };
}
