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
  getWeeklyVolume,
} from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stats" };

export default async function StatsPage() {
  const [bodyStats, latest, weekly, progress, scans, goals] = await Promise.all([
    getBodyStats(),
    getLatestBodyStat(),
    getWeeklyVolume(12),
    getAllExerciseProgress(),
    getBodyScans(),
    getGoals(),
  ]);

  return (
    <PageTransition className="space-y-7">
      <PageHeader title="Stats" subtitle="Body, volume & progress" />

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
        <SectionTitle>Weekly volume</SectionTitle>
        <Card>
          <p className="mb-2 text-xs text-zinc-500">
            Total working sets per week
          </p>
          <WeeklyVolumeChart weeks={weekly} />
        </Card>
      </section>

      <section>
        <SectionTitle>Exercise progress</SectionTitle>
        <Card>
          <ExerciseProgressChart
            exercises={progress.exercises}
            byExercise={progress.byExercise}
          />
        </Card>
      </section>
    </PageTransition>
  );
}
