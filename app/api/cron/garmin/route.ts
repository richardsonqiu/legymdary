import { staleGarminUsers, syncGarminForUser } from "@/lib/garmin/sync";

/**
 * Daily Vercel Cron: syncs every connected Garmin account that hasn't synced
 * in the last 12 hours. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const started = Date.now();
  const users = await staleGarminUsers(12 * 60 * 60 * 1000);
  const results: { ok: boolean; error?: string }[] = [];
  for (const userId of users) {
    if (Date.now() - started > 50_000) break; // stay inside the function limit
    const r = await syncGarminForUser(userId, { days: 3 });
    results.push({ ok: r.ok, error: r.error });
  }
  return Response.json({
    candidates: users.length,
    synced: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  });
}
