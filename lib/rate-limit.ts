import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

/**
 * Fixed-window rate limiter backed by the database (one atomic upsert per
 * check), so it works across serverless instances without extra infra.
 * Fails open if the DB call itself errors — a limiter outage shouldn't lock
 * everyone out.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const now = Date.now();
  const expired = now - windowMs;
  try {
    const [row] = await db
      .insert(rateLimits)
      .values({ key, windowStart: now, count: 1 })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          count: sql`case when ${rateLimits.windowStart} <= ${expired} then 1 else ${rateLimits.count} + 1 end`,
          windowStart: sql`case when ${rateLimits.windowStart} <= ${expired} then ${now} else ${rateLimits.windowStart} end`,
        },
      })
      .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart });
    if (!row || row.count <= limit) return { ok: true, retryAfterSec: 0 };
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((row.windowStart + windowMs - now) / 1000)),
    };
  } catch (err) {
    console.error("[rate-limit] check failed, allowing request:", err);
    return { ok: true, retryAfterSec: 0 };
  }
}

/** Best-effort client IP (Vercel sets x-forwarded-for / x-real-ip). */
export async function clientIp(h?: Headers): Promise<string> {
  const hs = h ?? (await headers());
  return (
    hs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    hs.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function tooMany(retryAfterSec: number): string {
  const mins = Math.ceil(retryAfterSec / 60);
  return mins > 1
    ? `Too many attempts. Please try again in ${mins} minutes.`
    : "Too many attempts. Please wait a moment and try again.";
}
