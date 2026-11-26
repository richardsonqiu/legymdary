"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DumbbellIcon, PencilIcon, PlusIcon } from "@/components/icons";
import { Button, Card } from "@/components/ui";
import { startWorkoutForActivity } from "@/lib/actions";
import type { WorkoutDetail } from "@/lib/queries";
import { kg } from "@legymdary/shared";

/** Exercises and sets logged for a watch activity, or a button to add them. */
export function ActivityBreakdown({ activityId, workout, gym }: { activityId: string; workout: WorkoutDetail | null; gym: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function open() {
    setError(null);
    start(async () => {
      const r = await startWorkoutForActivity(activityId);
      if ("error" in r) setError(r.error);
      else router.push("/log");
    });
  }

  if (!workout || workout.exercises.length === 0) {
    return (
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-300/15 text-teal-200">
            <DumbbellIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 text-sm">
            <div className="font-medium">{gym ? "What did you lift?" : "Add exercises"}</div>
            <div className="text-xs text-zinc-400">Log exercises, weights and reps for this session. Works during or after it.</div>
          </div>
        </div>
        <Button className="w-full" onClick={open} disabled={pending}>
          <PlusIcon className="h-4 w-4" /> {pending ? "Opening…" : workout ? "Continue logging" : "Add exercises"}
        </Button>
        {error && <p className="text-sm text-amber-300">{error}</p>}
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat value={String(workout.exerciseCount)} label="exercises" />
        <Stat value={String(workout.totalSets)} label="sets" />
        <Stat value={`${kg(workout.totalVolume)} kg`} label="volume" />
      </div>
      <ul className="divide-y divide-white/[0.05]">
        {workout.exercises.map((e) => {
          const working = e.sets.filter((s) => !s.isWarmup);
          return (
            <li key={e.workoutExerciseId} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">{e.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                {working.map((s) => `${kg(s.weight)}×${s.reps}`).join("  ")}
              </span>
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" className="w-full" onClick={open} disabled={pending}>
        <PencilIcon className="h-4 w-4" /> Edit exercises
      </Button>
      {error && <p className="text-sm text-amber-300">{error}</p>}
    </Card>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] py-2">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}
