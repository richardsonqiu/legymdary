import { BodyStatForm } from "@/components/charts/BodyStatForm";
import { BodyStatsChart } from "@/components/charts/BodyStatsChart";
import { ExerciseProgressChart } from "@/components/charts/ExerciseProgressChart";
import { WeeklyVolumeChart } from "@/components/charts/WeeklyVolumeChart";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import {
  getAllExerciseProgress,
  getBodyStats,
  getLatestBodyStat,
  getWeeklyVolume,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const [bodyStats, latest, weekly, progress] = await Promise.all([
    getBodyStats(),
    getLatestBodyStat(),
    getWeeklyVolume(12),
    getAllExerciseProgress(),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title="Stats" subtitle="Body, volume & progress" />

      <section>
        <SectionTitle>Log body stats</SectionTitle>
        <BodyStatForm latest={latest} />
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
    </div>
  );
}
