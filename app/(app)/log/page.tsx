import { StartWorkout } from "@/components/logger/StartWorkout";
import { WorkoutEditor } from "@/components/logger/WorkoutEditor";
import {
  getActiveWorkout,
  getAllExercises,
  getLastPerformances,
  getWorkoutDates,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

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
      <WorkoutEditor
        workout={active}
        exercises={exercises}
        lastByExercise={lastByExercise}
      />
    );
  }

  const dates = await getWorkoutDates();
  return <StartWorkout canDuplicate={dates.length > 0} />;
}
