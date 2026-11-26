import { after } from "next/server";
import { syncOuraForUser } from "@/lib/oura/sync";
import { rateLimit } from "@/lib/rate-limit";

/** Re-sync Oura when the last sync is older than this. */
const STALE_MS = 30 * 60 * 1000;

/**
 * Like scheduleGarminSync: called by pages with the status they already
 * loaded; the sync runs after the page is sent. Returns true when one was
 * scheduled (the page can show <AutoRefresh>).
 */
export function scheduleOuraSync(
  userId: string,
  status: { status: string; lastSyncAt: Date | null } | null,
): boolean {
  if (!status || status.status !== "ok") return false;
  const stale = !status.lastSyncAt || Date.now() - status.lastSyncAt.getTime() >= STALE_MS;
  if (!stale) return false;
  after(async () => {
    try {
      if ((await rateLimit(`oura:bgsync:${userId}`, 1, 10 * 60 * 1000)).ok) await syncOuraForUser(userId, { days: 10 });
    } catch (err) {
      console.error("[oura] background sync failed:", err);
    }
  });
  return true;
}
