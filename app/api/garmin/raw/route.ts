import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { garminRaw } from "@/db/schema";
import { getSessionUser } from "@/lib/session";

/** One raw Garmin payload (?dataset=…&key=…), pretty-printed — for the Data explorer. */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.id) return new Response("Not signed in", { status: 401 });
  const q = new URL(request.url).searchParams;
  const dataset = (q.get("dataset") ?? "").slice(0, 60);
  const key = (q.get("key") ?? "").slice(0, 80);
  const [row] = await db
    .select({ payload: garminRaw.payload, fetchedAt: garminRaw.fetchedAt })
    .from(garminRaw)
    .where(and(eq(garminRaw.userId, user.id), eq(garminRaw.dataset, dataset), eq(garminRaw.key, key)))
    .limit(1);
  if (!row) return Response.json({ error: "No data for that day." }, { status: 404 });
  return new Response(JSON.stringify(JSON.parse(row.payload), null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Fetched-At": row.fetchedAt.toISOString() },
  });
}
