import { after } from "next/server";
import { db } from "@/db";
import { garminConnections } from "@/db/schema";
import { syncGarminForUser } from "@/lib/garmin/sync";
import { eq } from "drizzle-orm";

const STALE_MS = 3 * 60 * 60 * 1000; // re-sync at most every 3 hours

/**
 * Called from pages: if the user's Garmin data is stale, sync it *after* the
 * response is sent so page loads never wait on Garmin. Fresh data shows up on
 * the next visit (or immediately via "Sync now").
 */
export async function syncGarminInBackgroundIfStale(userId: string) {
  const [conn] = await db
    .select({ status: garminConnections.status, lastSyncAt: garminConnections.lastSyncAt })
    .from(garminConnections)
    .where(eq(garminConnections.userId, userId))
    .limit(1);
  if (!conn || conn.status !== "ok") return;
  if (conn.lastSyncAt && Date.now() - conn.lastSyncAt.getTime() < STALE_MS) return;
  after(async () => {
    try {
      await syncGarminForUser(userId, { days: 3 });
    } catch (err) {
      console.error("[garmin] background sync failed:", err);
    }
  });
}
