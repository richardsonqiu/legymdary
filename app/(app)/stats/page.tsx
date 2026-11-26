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
  getDailyTotals,
  getGarminDaily,
  getGoals,
  getTargetHistory,
  getLatestBodyStat,
  getTrainingOverview,
  getWeeklyCheckin,
  getWeeklyVolume,
} from "@/lib/queries";
import { WeeklyCheckin } from "@/components/WeeklyCheckin";
import { getEnergyContext } from "@/lib/energy-data";
import { TrainingWeeksChart } from "@/components/charts/TrainingWeeksChart";
import { RecapTiles } from "@/components/recap/RecapTiles";
import { CalorieBalance } from "@/components/progress/CalorieBalance";
import { balanceVerdict, computeBalance, type Balance, type Period, addDaysStr } from "@legymdary/shared";
import { userToday } from "@/lib/session";

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
  // Calorie balance: a year of food logs and watch burn, with weigh-ins.
  const today = await userToday();
  const [yearTotals, yearBurn, targetHistory] = await Promise.all([
    getDailyTotals(addDaysStr(today, -366), today),
    getGarminDaily(addDaysStr(today, -366), today),
    getTargetHistory(addDaysStr(today, -366), today),
  ]);
  const burnBy = new Map(yearBurn.map((g) => [g.date, g.totalKcal]));
  const balanceDays = yearTotals.map((t) => ({ date: t.date, eaten: t.calories, meals: t.count, skipped: t.skipped, burned: burnBy.get(t.date) ?? null }));
  const weightsAll = bodyStats.filter((s) => s.weight != null).map((s) => ({ date: s.date, weight: s.weight as number }));
  const fallbackBurn = energy.plan.tdee ?? null;
  const balance = Object.fromEntries(
    (["week", "month", "year"] as const).map((p) => [p, computeBalance(p, today, balanceDays, weightsAll, fallbackBurn, targetHistory)]),
  ) as Record<Period, Balance>;
  const verdicts = Object.fromEntries(
    (["week", "month", "year"] as const).map((p) => [p, balanceVerdict(balance[p], energy.plan.direction)]),
  ) as Record<Period, string | null>;
  const hasGym = weekly.some((w) => w.sets > 0) || progress.exercises.length > 0;

  return (
    <PageTransition className="space-y-7">
      <PageHeader title="Progress" eyebrow="Trends" subtitle="Body and training over time" image="runner" imagePosition="center 35%" />

      <section>
        <SectionTitle>Recaps</SectionTitle>
        <RecapTiles />
      </section>

      <section id="balance" className="scroll-mt-6">
        <SectionTitle>Calorie balance</SectionTitle>
        <CalorieBalance
          data={balance}
          direction={energy.plan.direction}
          planDaily={energy.plan.calorieTarget != null ? energy.plan.dailyDelta : null}
          verdicts={verdicts}
        />
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
