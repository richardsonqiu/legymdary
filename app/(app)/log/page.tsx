import { PageTransition } from "@/components/PageTransition";
import { StartWorkout } from "@/components/logger/StartWorkout";
import { WorkoutEditor } from "@/components/logger/WorkoutEditor";
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
  const active = await getActiveWorkout();

  if (active) {
    const [exercises, lastByExercise] = await Promise.all([
      getAllExercises(),
      getLastPerformances(
        active.id,
        active.exercises.map((e) => e.exerciseId),
      ),
    ]);
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

  const [dates, templates] = await Promise.all([getWorkoutDates(), getTemplates()]);
  return (
    <PageTransition className="">
      <StartWorkout canDuplicate={dates.length > 0} templates={templates} />
    </PageTransition>
  );
}
