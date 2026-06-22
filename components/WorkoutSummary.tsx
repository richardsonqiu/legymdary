import type { WorkoutDetail } from "@/lib/queries";
import { Tag } from "@/components/ui";
import { formatPretty, kg } from "@/lib/utils";

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-center">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
    </div>
  );
}

export function WorkoutSummary({
  workout,
  showSets = true,
}: {
  workout: WorkoutDetail;
  showSets?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold">{workout.name}</div>
          <div className="text-xs text-zinc-500">
            {formatPretty(workout.date)}
            {!workout.finished && (
              <span className="ml-2 text-zinc-400">· in progress</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="exercises" value={`${workout.exerciseCount}`} />
        <MiniStat label="sets" value={`${workout.totalSets}`} />
        <MiniStat label="volume" value={`${kg(workout.totalVolume)}kg`} />
      </div>

      {showSets && workout.exercises.length > 0 && (
        <ul className="space-y-2.5">
          {workout.exercises.map((ex) => (
            <li key={ex.workoutExerciseId}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{ex.name}</span>
                <Tag>{ex.muscleGroup}</Tag>
              </div>
              {ex.sets.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {ex.sets.map((s) => (
                    <span
                      key={s.id}
                      className={
                        s.isWarmup
                          ? "rounded-md border border-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500"
                          : "rounded-md border border-zinc-700 bg-zinc-800/50 px-1.5 py-0.5 text-xs tabular-nums text-zinc-200"
                      }
                    >
                      {kg(s.weight)}×{s.reps}
                      {s.isWarmup && " ·w"}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-xs text-zinc-600">No sets logged</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
