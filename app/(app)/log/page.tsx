import { PageTransition } from "@/components/PageTransition";
import { StartWorkout } from "@/components/logger/StartWorkout";
import { WorkoutEditor } from "@/components/logger/WorkoutEditor";
import { RecommendedWorkout } from "@/components/logger/RecommendedWorkout";
import { getRecommendation } from "@/lib/training/history";
import { requireUserId, userToday } from "@/lib/session";
import {
  getActiveWorkout,
  getAllExercises,
  getLastPerformances,
  getTemplates,
  getWorkoutDates,
} from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log workout" };

export default async function LogPage() {
  // Start every independent read at once; only "last time" depends on the active workout.
  const exercisesP = getAllExercises();
  const datesP = getWorkoutDates();
  const templatesP = getTemplates();
  const active = await getActiveWorkout();

  if (active) {
    const [exercises, lastByExercise] = await Promise.all([
      exercisesP,
      getLastPerformances(
        active.id,
        active.exercises.map((e) => e.exerciseId),
      ),
    ]);
    // Settle the unused reads so they never surface as unhandled rejections.
    void datesP.catch(() => {});
    void templatesP.catch(() => {});
    return (
      <PageTransition className="">
        <WorkoutEditor
          workout={active}
          exercises={exercises}
          lastByExercise={lastByExercise}
        />
      </PageTransition>
    );
  }

  void exercisesP.catch(() => {});
  const userId = await requireUserId();
  const [dates, templates, rec] = await Promise.all([datesP, templatesP, getRecommendation(userId, await userToday())]);
  return (
    <PageTransition className="">
      <StartWorkout
        canDuplicate={dates.length > 0}
        templates={templates}
        recommended={rec.exercises.length ? <RecommendedWorkout rec={rec} /> : null}
      />
    </PageTransition>
  );
}
