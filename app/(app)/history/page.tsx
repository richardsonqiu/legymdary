import { ConsistencyHeatmap } from "@/components/ConsistencyHeatmap";
import { HistoryCalendar } from "@/components/HistoryCalendar";
import { CalendarIcon } from "@/components/icons";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { getWorkoutDetails } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const workouts = await getWorkoutDetails();

  return (
    <div className="space-y-6">
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
    </div>
  );
}
