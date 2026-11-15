import { BodyScans } from "@/components/body/BodyScans";
import { BodyStatForm } from "@/components/charts/BodyStatForm";
import { PageTransition } from "@/components/PageTransition";
import { BodyStatsChart } from "@/components/charts/BodyStatsChart";
import { ExerciseProgressChart } from "@/components/charts/ExerciseProgressChart";
import { WeeklyVolumeChart } from "@/components/charts/WeeklyVolumeChart";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import {
  getAllExerciseProgress,
  getBodyScans,
  getBodyStats,
  getGoals,
  getLatestBodyStat,
  getTrainingOverview,
  getWeeklyVolume,
} from "@/lib/queries";
import { TrainingWeeksChart } from "@/components/charts/TrainingWeeksChart";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progress" };

export default async function StatsPage() {
  const [bodyStats, latest, weekly, progress, scans, goals, training] = await Promise.all([
    getBodyStats(),
    getLatestBodyStat(),
    getWeeklyVolume(12),
    getAllExerciseProgress(),
    getBodyScans(),
    getGoals(),
    getTrainingOverview(12),
  ]);
  const hasGym = weekly.some((w) => w.sets > 0) || progress.exercises.length > 0;

  return (
    <PageTransition className="space-y-7">
      <PageHeader title="Progress" subtitle="Your body and training over time" />

      <section>
        <SectionTitle>Log body stats</SectionTitle>
        <BodyStatForm latest={latest} />
      </section>

      <section>
        <SectionTitle help="bodyComp">Body composition (InBody)</SectionTitle>
        <BodyScans scans={scans} targetBodyFat={goals?.targetBodyFat ?? null} />
      </section>

      <section>
        <SectionTitle>Body measurements</SectionTitle>
        <Card>
          <BodyStatsChart data={bodyStats} />
        </Card>
      </section>

      <section>
        <SectionTitle>Weekly training</SectionTitle>
        <Card>
          <TrainingWeeksChart weeks={training.weeks} types={training.types} />
        </Card>
      </section>

      {hasGym && (
        <>
          <section>
            <SectionTitle>Gym volume</SectionTitle>
            <Card>
              <p className="mb-2 text-xs text-zinc-500">Working sets per week (logged on the Log tab)</p>
              <WeeklyVolumeChart weeks={weekly} />
            </Card>
          </section>

          <section>
            <SectionTitle>Exercise progress</SectionTitle>
            <Card>
              <ExerciseProgressChart exercises={progress.exercises} byExercise={progress.byExercise} />
            </Card>
          </section>
        </>
      )}
    </PageTransition>
  );
}
