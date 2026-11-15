import { after } from "next/server";
import { runGarminImport } from "@/lib/garmin/raw-import";
import { syncGarminForUser } from "@/lib/garmin/sync";
import { rateLimit } from "@/lib/rate-limit";

/** Re-sync Garmin when the last sync is older than this. */
export const GARMIN_SYNC_STALE_MS = 15 * 60 * 1000;

/**
 * Called from pages with the Garmin status they already loaded, so it adds
 * no database round trips to the response. All Garmin work runs *after* the
 * page is sent (Next.js `after()`).
 *
 * Returns true when a sync was scheduled; the page can render <AutoRefresh>
 * to pull the fresh data in a few seconds later.
 */
export function scheduleGarminSync(
  userId: string,
  status: { status: string; lastSyncAt: Date | null } | null,
): boolean {
  if (!status || status.status !== "ok") return false;
  const stale = !status.lastSyncAt || Date.now() - status.lastSyncAt.getTime() >= GARMIN_SYNC_STALE_MS;
  after(async () => {
    try {
      // Dedupe: several tabs opened at once shouldn't each hit Garmin.
      if (stale && (await rateLimit(`garmin:bgsync:${userId}`, 1, 10 * 60 * 1000)).ok) {
        await syncGarminForUser(userId, { days: 3 });
      }
      // Keep advancing the full raw import (e.g. after a rate-limit pause).
      if ((await rateLimit(`garmin:bgimport:${userId}`, 1, 30 * 60 * 1000)).ok) {
        await runGarminImport(userId, { budgetMs: 20_000 });
      }
    } catch (err) {
      console.error("[garmin] background sync failed:", err);
    }
  });
  return stale;
}
