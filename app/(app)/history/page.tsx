import { ConsistencyHeatmap } from "@/components/ConsistencyHeatmap";
import { PageTransition } from "@/components/PageTransition";
import { HistoryCalendar } from "@/components/HistoryCalendar";
import { CalendarIcon } from "@/components/icons";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { GarminActivityList } from "@/components/garmin/GarminActivityList";
import { getGarminActivities, getGarminStatus, getWorkoutDetails } from "@/lib/queries";
import { addDaysStr, todayStr } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };

export default async function HistoryPage() {
  const today = todayStr();
  const [workouts, garmin, activities] = await Promise.all([
    getWorkoutDetails(),
    getGarminStatus(),
    getGarminActivities(addDaysStr(today, -30), addDaysStr(today, 1)),
  ]);

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="History" subtitle="Your training calendar" />
      {workouts.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="h-6 w-6" />}
          title="No sessions logged"
          description="Once you finish a workout it will appear on your calendar."
        />
      ) : (
        <>
          <section>
            <SectionTitle>Consistency</SectionTitle>
            <Card>
              <ConsistencyHeatmap workouts={workouts} />
            </Card>
          </section>
          <HistoryCalendar workouts={workouts} />
        </>
      )}
      {garmin && (
        <section>
          <SectionTitle>Garmin activities · last 30 days</SectionTitle>
          <GarminActivityList activities={activities} />
        </section>
      )}
    </PageTransition>
  );
}
