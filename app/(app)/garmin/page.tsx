import Link from "next/link";
import { GarminActivityList } from "@/components/garmin/GarminActivityList";
import { GarminConnect } from "@/components/garmin/GarminConnect";
import { ArrowLeftIcon } from "@/components/icons";
import { PageHeader, SectionTitle } from "@/components/ui";
import { getGarminActivities, getGarminStatus } from "@/lib/queries";
import { addDaysStr, todayStr } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GarminPage() {
  const today = todayStr();
  const [status, activities] = await Promise.all([
    getGarminStatus(),
    getGarminActivities(addDaysStr(today, -30), addDaysStr(today, 1)),
  ]);
  return (
    <div className="space-y-7">
      <PageHeader
        title="Garmin"
        subtitle="Calories burned, recovery and activities"
        action={
          <Link
            href="/dashboard"
            className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            <ArrowLeftIcon className="h-4 w-4" /> Home
          </Link>
        }
      />
      <GarminConnect status={status} />
      {status && (
        <section>
          <SectionTitle>Recent activities</SectionTitle>
          <GarminActivityList activities={activities.slice(0, 15)} />
        </section>
      )}
    </div>
  );
}
