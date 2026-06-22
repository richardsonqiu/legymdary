"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ExercisePicker } from "@/components/logger/ExercisePicker";
import { PlusIcon, TrashIcon, TrophyIcon, XIcon } from "@/components/icons";
import { Button, Card, EmptyState, Tag } from "@/components/ui";
import type { Exercise } from "@/db/schema";
import {
  addExerciseToWorkout,
  createExercise,
  deleteSet,
  discardWorkout,
  finishWorkout,
  logSet,
  removeWorkoutExercise,
  updateWorkout,
} from "@/lib/actions";
import type { WorkoutDetail, WorkoutExerciseDetail } from "@/lib/queries";
import { cn, estimate1RM, kg } from "@/lib/utils";

type Input = { weight: string; reps: string; warmup: boolean };

export function WorkoutEditor({
  workout,
  exercises,
}: {
  workout: WorkoutDetail;
  exercises: Exercise[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [inputs, setInputs] = useState<Record<number, Input>>({});
  const [toast, setToast] = useState<{ text: string; pr?: boolean } | null>(
    null,
  );
  const [name, setName] = useState(workout.name);
  const [date, setDate] = useState(workout.date);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  function exDefault(ex: WorkoutExerciseDetail): Input {
    const last = ex.sets[ex.sets.length - 1];
    return {
      weight: last ? String(last.weight) : "",
      reps: last ? String(last.reps) : "",
      warmup: false,
    };
  }
  function getInput(ex: WorkoutExerciseDetail): Input {
    return inputs[ex.workoutExerciseId] ?? exDefault(ex);
  }
  function updateInput(ex: WorkoutExerciseDetail, patch: Partial<Input>) {
    const id = ex.workoutExerciseId;
    setInputs((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? exDefault(ex)), ...patch },
    }));
  }

  function saveName() {
    if (name.trim() && name !== workout.name) {
      start(async () => {
        await updateWorkout(workout.id, { name });
        router.refresh();
      });
    }
  }
  function saveDate(v: string) {
    setDate(v);
    start(async () => {
      await updateWorkout(workout.id, { date: v });
      router.refresh();
    });
  }

  function addExercise(id: number) {
    start(async () => {
      await addExerciseToWorkout(workout.id, id);
      router.refresh();
    });
  }
  async function createAndAdd(input: {
    name: string;
    muscleGroup: string;
    equipment: string;
  }) {
    const res = await createExercise(input);
    if ("error" in res) return { error: res.error };
    await addExerciseToWorkout(workout.id, res.id);
    router.refresh();
    return {};
  }
  function removeExercise(id: number) {
    start(async () => {
      await removeWorkoutExercise(id);
      router.refresh();
    });
  }

  function addSet(ex: WorkoutExerciseDetail) {
    const inp = getInput(ex);
    const reps = parseInt(inp.reps, 10);
    const weight = parseFloat(inp.weight);
    if (!Number.isFinite(reps) || reps <= 0) {
      setToast({ text: "Enter the number of reps." });
      return;
    }
    if (!Number.isFinite(weight) || weight < 0) {
      setToast({ text: "Enter a weight (kg)." });
      return;
    }
    start(async () => {
      try {
        const res = await logSet({
          workoutExerciseId: ex.workoutExerciseId,
          reps,
          weight,
          isWarmup: inp.warmup,
        });
        if (res.isPR) {
          setToast({
            text: `New PR · ${ex.name} — est. 1RM ${kg(res.e1rm)}kg`,
            pr: true,
          });
        }
        updateInput(ex, { warmup: false });
        router.refresh();
      } catch (e) {
        setToast({ text: (e as Error).message });
      }
    });
  }

  function removeSet(id: number) {
    start(async () => {
      await deleteSet(id);
      router.refresh();
    });
  }

  function finish() {
    start(async () => {
      await finishWorkout(workout.id);
      router.push("/dashboard");
    });
  }
  function discard() {
    if (!confirm("Discard this workout and all its sets?")) return;
    start(async () => {
      await discardWorkout(workout.id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
          <div
            className={cn(
              "animate-pr-pop flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg",
              toast.pr
                ? "bg-zinc-50 text-zinc-950"
                : "border border-zinc-700 bg-zinc-900 text-zinc-100",
            )}
          >
            {toast.pr && <TrophyIcon className="h-4 w-4" />}
            {toast.text}
          </div>
        </div>
      )}

      {/* Session header */}
      <Card className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          aria-label="Workout name"
          className="w-full border-b border-transparent bg-transparent text-xl font-semibold tracking-tight outline-none focus:border-zinc-700"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => saveDate(e.target.value)}
          aria-label="Workout date"
          className="bg-transparent text-sm text-zinc-400 outline-none"
        />
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Mini label="exercises" value={`${workout.exerciseCount}`} />
          <Mini label="sets" value={`${workout.totalSets}`} />
          <Mini label="volume" value={`${kg(workout.totalVolume)}kg`} />
        </div>
      </Card>

      {/* Exercises */}
      {workout.exercises.length === 0 ? (
        <EmptyState
          icon={<PlusIcon className="h-6 w-6" />}
          title="No exercises yet"
          description="Add exercises from the library to start logging sets."
          action={
            <Button onClick={() => setPickerOpen(true)}>
              <PlusIcon className="h-5 w-5" /> Add exercise
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {workout.exercises.map((ex) => {
            const inp = getInput(ex);
            let workingNo = 0;
            let bestVal = 0;
            let bestId = -1;
            for (const s of ex.sets) {
              if (!s.isWarmup) {
                const v = estimate1RM(s.weight, s.reps);
                if (v > bestVal) {
                  bestVal = v;
                  bestId = s.id;
                }
              }
            }
            return (
              <Card key={ex.workoutExerciseId} className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{ex.name}</div>
                    <div className="mt-1 flex gap-1.5">
                      <Tag>{ex.muscleGroup}</Tag>
                      <Tag>{ex.equipment}</Tag>
                    </div>
                  </div>
                  <button
                    onClick={() => removeExercise(ex.workoutExerciseId)}
                    aria-label="Remove exercise"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>

                {ex.sets.length > 0 && (
                  <ul className="space-y-1.5">
                    {ex.sets.map((s) => {
                      const label = s.isWarmup ? "W" : String(++workingNo);
                      const e1rm = estimate1RM(s.weight, s.reps);
                      return (
                        <li
                          key={s.id}
                          className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2"
                        >
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold",
                              s.isWarmup
                                ? "text-zinc-500"
                                : "bg-zinc-800 text-zinc-300",
                            )}
                          >
                            {label}
                          </span>
                          <span className="flex-1 tabular-nums">
                            <span className="font-semibold">{kg(s.weight)}</span>
                            <span className="text-zinc-500"> kg × </span>
                            <span className="font-semibold">{s.reps}</span>
                          </span>
                          {s.id === bestId && bestVal > 0 && (
                            <TrophyIcon className="h-4 w-4 text-zinc-300" />
                          )}
                          {!s.isWarmup && (
                            <span className="text-xs tabular-nums text-zinc-600">
                              1RM {kg(e1rm)}
                            </span>
                          )}
                          <button
                            onClick={() => removeSet(s.id)}
                            aria-label="Delete set"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Add set */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <NumberInput
                      label="Weight (kg)"
                      value={inp.weight}
                      inputMode="decimal"
                      onChange={(v) => updateInput(ex, { weight: v })}
                      onEnter={() => addSet(ex)}
                    />
                    <NumberInput
                      label="Reps"
                      value={inp.reps}
                      inputMode="numeric"
                      onChange={(v) => updateInput(ex, { reps: v })}
                      onEnter={() => addSet(ex)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateInput(ex, { warmup: !inp.warmup })}
                      className={cn(
                        "h-12 shrink-0 rounded-xl px-4 text-sm font-medium transition-colors",
                        inp.warmup
                          ? "bg-zinc-200 text-zinc-900"
                          : "border border-zinc-700 text-zinc-400 hover:bg-zinc-800",
                      )}
                    >
                      Warmup
                    </button>
                    <Button
                      size="lg"
                      className="flex-1"
                      onClick={() => addSet(ex)}
                      disabled={pending}
                    >
                      <PlusIcon className="h-5 w-5" /> Add set
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}

          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => setPickerOpen(true)}
          >
            <PlusIcon className="h-5 w-5" /> Add exercise
          </Button>
        </div>
      )}

      {/* Finish / discard */}
      <div className="space-y-2 pt-2">
        <Button
          size="lg"
          className="w-full"
          onClick={finish}
          disabled={pending}
        >
          Finish workout
        </Button>
        <Button
          variant="danger"
          size="md"
          className="w-full"
          onClick={discard}
          disabled={pending}
        >
          Discard workout
        </Button>
      </div>

      {pickerOpen && (
        <ExercisePicker
          exercises={exercises}
          existingIds={workout.exercises.map((e) => e.exerciseId)}
          onAdd={addExercise}
          onCreateExercise={createAndAdd}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-center">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  onEnter,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  inputMode: "decimal" | "numeric";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
        }}
        placeholder="0"
        className="h-14 w-full rounded-xl border border-zinc-700 bg-zinc-950/60 text-center text-lg font-semibold tabular-nums text-zinc-100 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700/40"
      />
    </label>
  );
}
