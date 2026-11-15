import { PageTransition } from "@/components/PageTransition";
import { ExerciseLibrary } from "@/components/ExerciseLibrary";
import { getAllExercises } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Exercises" };

export default async function ExercisesPage() {
  const exercises = await getAllExercises();
  return (
    <PageTransition className="space-y-4">
      <ExerciseLibrary exercises={exercises} />
    </PageTransition>
  );
}
