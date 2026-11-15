import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { GarminDataExplorer } from "@/components/garmin/GarminDataExplorer";
import { GarminAttribution } from "@/components/garmin/GarminAttribution";
import { ArrowLeftIcon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { db } from "@/db";
import { garminConnections } from "@/db/schema";
import { getImportStatus } from "@/lib/garmin/raw-import";
import { requireUserId } from "@/lib/session";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Garmin data" };

export default async function GarminDataPage() {
  const userId = await requireUserId();
  const [conn] = await db
    .select({ historyDays: garminConnections.historyDays })
    .from(garminConnections)
    .where(eq(garminConnections.userId, userId))
    .limit(1);
  if (!conn) redirect("/garmin");
  const status = await getImportStatus(userId);
  return (
    <PageTransition className="space-y-6">
      <PageHeader
        title="Garmin data"
        subtitle="Import, inspect and export everything"
        action={
          <Link
            href="/garmin"
            transitionTypes={["nav-back"]}
            className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            <ArrowLeftIcon className="h-4 w-4" /> Garmin
          </Link>
        }
      />
      <GarminDataExplorer initial={status} historyDays={conn.historyDays} />
      <GarminAttribution className="text-center" />
    </PageTransition>
  );
}
