import { eq } from "drizzle-orm";
import { db } from "@/db";
import { garminConnections } from "@/db/schema";
import { getBinary, GarminError } from "@/lib/garmin/client";
import { bearerToken } from "@/lib/garmin/sync";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

/** Streams an activity's original file (.FIT in a zip) straight from Garmin. */
export async function GET(_req: Request, ctx: { params: Promise<{ activityId: string }> }) {
  const user = await getSessionUser();
  if (!user?.id) return new Response("Not signed in", { status: 401 });
  const { activityId } = await ctx.params;
  if (!/^\d{1,20}$/.test(activityId)) return new Response("Bad activity id", { status: 400 });
  const [conn] = await db
    .select()
    .from(garminConnections)
    .where(eq(garminConnections.userId, user.id))
    .limit(1);
  if (!conn) return new Response("Garmin isn't connected", { status: 400 });
  // Each download is a Garmin API call on the user's key: keep it modest.
  if (!(await rateLimit(`garmin:fit:${user.id}`, 30, 60 * 60 * 1000)).ok) {
    return new Response("Too many downloads. Try again later.", { status: 429 });
  }
  try {
    const res = await getBinary(await bearerToken(conn), `/download-service/files/activity/${activityId}`);
    return new Response(res.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="garmin-activity-${activityId}.zip"`,
      },
    });
  } catch (err) {
    const status = err instanceof GarminError ? (err.isAuth ? 401 : err.status === 404 ? 404 : 502) : 502;
    return new Response("Couldn't download that activity file from Garmin.", { status });
  }
}
