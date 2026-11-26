import { cache } from "react";
import { auth } from "@/auth";
import { localDateMinutes } from "@legymdary/shared";

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

const TZ_RE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/;

/** The user's time zone from the `tz` cookie, if valid. */
export const userTimeZone = cache(async (): Promise<string | null> => {
  try {
    const { cookies } = await import("next/headers");
    const tz = (await cookies()).get("tz")?.value;
    if (tz && TZ_RE.test(tz)) {
      new Intl.DateTimeFormat("en-US", { timeZone: tz }); // throws on an unknown zone
      return tz;
    }
  } catch {}
  return null;
});

/** Minutes after midnight in the user's time zone (null when unknown). */
export async function userNowMinutes(at: Date = new Date()): Promise<number | null> {
  const tz = await userTimeZone();
  if (!tz) return null;
  return localMinutes(at, tz);
}

function localMinutes(at: Date, tz: string) {
  return localDateMinutes(at, tz).minutes;
}

/**
 * Today's date (YYYY-MM-DD) where the user is. The browser stores its time
 * zone in a `tz` cookie (see TimezoneSync); without it we fall back to the
 * server's date. Servers run in UTC, so without this "today" would be
 * yesterday for the first hours of the day in Asia.
 */
export const userToday = cache(async (): Promise<string> => {
  try {
    const { cookies } = await import("next/headers");
    const tz = (await cookies()).get("tz")?.value;
    if (tz && TZ_RE.test(tz)) {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    }
  } catch {
    // No request (cron, background work) or an unknown zone: use the server date.
  }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
});
