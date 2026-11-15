import { eq } from "drizzle-orm";
import { db } from "@/db";
import { garminConnections } from "@/db/schema";
import { buildInventory, inventoryToMarkdown } from "@/lib/garmin/inventory";
import { getSessionUser } from "@/lib/session";

/** Field-level inventory of the signed-in user's Garmin data (?format=md|json). */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.id) return new Response("Not signed in", { status: 401 });
  const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "md";
  const [conn] = await db
    .select({ historyDays: garminConnections.historyDays })
    .from(garminConnections)
    .where(eq(garminConnections.userId, user.id))
    .limit(1);
  const inv = await buildInventory(user.id);
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), datasets: inv }, null, 1), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="garmin-inventory-${stamp}.json"`,
      },
    });
  }
  const md = inventoryToMarkdown(inv, { generatedAt: new Date().toISOString(), historyDays: conn?.historyDays ?? 90 });
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="garmin-inventory-${stamp}.md"`,
    },
  });
}
