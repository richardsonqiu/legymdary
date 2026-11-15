import { userToday } from "@/lib/session";
import { ConsistencyCalendar } from "@/components/consistency/ConsistencyCalendar";
import { PageTransition } from "@/components/PageTransition";
import { WorkoutSummary } from "@/components/WorkoutSummary";
import { CalendarIcon } from "@/components/icons";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { GarminActivityList } from "@/components/garmin/GarminActivityList";
import { getConsistencyDays, getGarminActivities, getGarminStatus, getWorkoutDetails } from "@/lib/queries";
import { addDaysStr } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };

export default async function HistoryPage() {
  const today = (await userToday());
  const [workouts, garmin, activities, days] = await Promise.all([
    getWorkoutDetails(),
    getGarminStatus(),
    getGarminActivities(addDaysStr(today, -30), addDaysStr(today, 1)),
    getConsistencyDays(addDaysStr(today, -380), addDaysStr(today, 1)),
  ]);

  return (
    <PageTransition className="space-y-6">
      <PageHeader title="History" subtitle="Exercise and food, day by day" />
      <section>
        <SectionTitle>Calendar</SectionTitle>
        <ConsistencyCalendar days={days} />
      </section>
      {(garmin || activities.length > 0) && (
        <section>
          <SectionTitle>Garmin activities</SectionTitle>
          <GarminActivityList activities={activities} />
        </section>
      )}
      {workouts.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="h-6 w-6" />}
          title="No gym sessions logged"
          description={
            garmin || activities.length > 0
              ? "Sessions you log in Workout show here. Garmin activities are above."
              : "Finish a workout and it shows here."
          }
        />
      ) : (
        <section>
          <SectionTitle>Gym sessions</SectionTitle>
          <div className="space-y-3">
            {workouts.slice(0, 5).map((w) => (
              <Card key={w.id}>
                <WorkoutSummary workout={w} />
              </Card>
            ))}
            {workouts.length > 5 && (
              <details>
                <summary className="cursor-pointer rounded-xl border border-white/[0.07] px-4 py-3 text-center text-sm text-zinc-300">
                  Show {workouts.length - 5} older
                </summary>
                <div className="mt-3 space-y-3">
                  {workouts.slice(5, 60).map((w) => (
                    <Card key={w.id}>
                      <WorkoutSummary workout={w} />
                    </Card>
                  ))}
                </div>
              </details>
            )}
          </div>
        </section>
      )}
    </PageTransition>
  );
}
