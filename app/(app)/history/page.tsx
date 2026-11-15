import { ConsistencyCalendar } from "@/components/consistency/ConsistencyCalendar";
import { PageTransition } from "@/components/PageTransition";
import { HistoryCalendar } from "@/components/HistoryCalendar";
import { CalendarIcon } from "@/components/icons";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { GarminActivityList } from "@/components/garmin/GarminActivityList";
import { getConsistencyDays, getGarminActivities, getGarminStatus, getWorkoutDetails } from "@/lib/queries";
import { addDaysStr, todayStr } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };

export default async function HistoryPage() {
  const today = todayStr();
  const [workouts, garmin, activities, days] = await Promise.all([
    getWorkoutDetails(),
    getGarminStatus(),
    getGarminActivities(addDaysStr(today, -30), addDaysStr(today, 1)),
    getConsistencyDays(addDaysStr(today, -380), addDaysStr(today, 1)),
  ]);

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="History" subtitle="Your exercise and food logging over time" />
      <section>
        <SectionTitle>Consistency</SectionTitle>
        <ConsistencyCalendar days={days} />
      </section>
      {(garmin || activities.length > 0) && (
        <section>
          <SectionTitle>Garmin activities · tap one for full stats</SectionTitle>
          <GarminActivityList activities={activities} />
        </section>
      )}
      {workouts.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="h-6 w-6" />}
          title="No gym sessions logged"
          description={
            garmin || activities.length > 0
              ? "Gym sessions you log on the Log tab appear here. Your Garmin activities are above."
              : "Once you finish a workout on the Log tab it will appear here."
          }
        />
      ) : (
        <section>
          <SectionTitle>Gym sessions · tap a day to see it</SectionTitle>
          <HistoryCalendar workouts={workouts} />
        </section>
      )}
    </PageTransition>
  );
}
