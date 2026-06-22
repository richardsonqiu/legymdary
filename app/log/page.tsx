import { StartWorkout } from "@/components/logger/StartWorkout";
import { WorkoutEditor } from "@/components/logger/WorkoutEditor";
import { getActiveWorkout, getAllExercises, getWorkoutDetails } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const [active, exercises, details] = await Promise.all([
    getActiveWorkout(),
    getAllExercises(),
    getWorkoutDetails(),
  ]);

  if (active) {
    return <WorkoutEditor workout={active} exercises={exercises} />;
  }

  return <StartWorkout canDuplicate={details.length > 0} />;
}
