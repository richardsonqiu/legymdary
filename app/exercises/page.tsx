import Link from "next/link";
import { ExerciseLibrary } from "@/components/ExerciseLibrary";
import { ArrowLeftIcon } from "@/components/icons";
import { getAllExercises } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ExercisesPage() {
  const exercises = await getAllExercises();
  return (
    <div className="space-y-4">
      <Link
        href="/log"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </Link>
      <ExerciseLibrary exercises={exercises} />
    </div>
  );
}
