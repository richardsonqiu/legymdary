import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { garminRaw } from "@/db/schema";
import { getSessionUser } from "@/lib/session";

/**
 * Full lossless export of the user's imported Garmin data as NDJSON
 * (one JSON object per line: {dataset, key, date, fetchedAt, data}).
 * Optional ?dataset=… limits it to one dataset. Streamed in pages so large
 * histories don't need to fit in memory.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.id) return new Response("Not signed in", { status: 401 });
  const userId = user.id;
  const dataset = new URL(request.url).searchParams.get("dataset")?.slice(0, 60) || null;
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastId = 0;
      try {
        for (;;) {
          const rows = await db
            .select()
            .from(garminRaw)
            .where(
              and(
                eq(garminRaw.userId, userId),
                gt(garminRaw.id, lastId),
                dataset ? eq(garminRaw.dataset, dataset) : undefined,
              ),
            )
            .orderBy(asc(garminRaw.id))
            .limit(300);
          if (!rows.length) break;
          for (const r of rows) {
            controller.enqueue(
              enc.encode(
                `{"dataset":${JSON.stringify(r.dataset)},"key":${JSON.stringify(r.key)},"date":${JSON.stringify(r.date)},"fetchedAt":${JSON.stringify(r.fetchedAt.toISOString())},"data":${r.payload}}\n`,
              ),
            );
          }
          lastId = rows[rows.length - 1].id;
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="garmin-${dataset ?? "all"}-${stamp}.ndjson"`,
    },
  });
}
