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
  getWeeklyCheckin,
  getWeeklyVolume,
} from "@/lib/queries";
import { WeeklyCheckin } from "@/components/WeeklyCheckin";
import { getEnergyContext } from "@/lib/energy-data";
import { TrainingWeeksChart } from "@/components/charts/TrainingWeeksChart";
import { RecapTiles } from "@/components/recap/RecapTiles";

export const dynamic = "force-dynamic";
export const metadata = { title: "Progress" };

export default async function StatsPage() {
  const [bodyStats, latest, weekly, progress, scans, goals, training, checkin, energy] = await Promise.all([
    getBodyStats(),
    getLatestBodyStat(),
    getWeeklyVolume(12),
    getAllExerciseProgress(),
    getBodyScans(),
    getGoals(),
    getTrainingOverview(12),
    getWeeklyCheckin(),
    getEnergyContext(),
  ]);
  const hasGym = weekly.some((w) => w.sets > 0) || progress.exercises.length > 0;

  return (
    <PageTransition className="space-y-7">
      <PageHeader title="Progress" subtitle="Body and training over time" />

      <section>
        <SectionTitle>Recaps</SectionTitle>
        <RecapTiles />
      </section>

      <section>
        <SectionTitle>Log body stats</SectionTitle>
        <BodyStatForm latest={latest} />
      </section>

      <section id="inbody" className="scroll-mt-6">
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
        <SectionTitle>This week vs last week</SectionTitle>
        <WeeklyCheckin data={checkin} targets={energy.targets} targetsByDate={energy.targetsByDate} />
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
              <p className="mb-2 text-xs text-zinc-500">Sets per week, from your logged workouts</p>
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
