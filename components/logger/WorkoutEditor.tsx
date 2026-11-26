"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ExercisePicker } from "@/components/logger/ExercisePicker";
import { RestTimer, type RestTimerHandle } from "@/components/logger/RestTimer";
import { Portal } from "@/components/Portal";
import { PlusIcon, TrashIcon, TrophyIcon, XIcon, TargetIcon, CheckIcon, WatchIcon } from "@/components/icons";
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
  saveWorkoutAsTemplate,
  updateWorkout,
} from "@/lib/actions";
import type {
  LastPerf,
  WorkoutDetail,
  WorkoutExerciseDetail,
} from "@/lib/queries";
import { cn, estimate1RM, formatShort, kg, todayStr } from "@/lib/utils";

type Input = { weight: string; reps: string; warmup: boolean };

export function WorkoutEditor({
  workout,
  exercises,
  lastByExercise,
}: {
  workout: WorkoutDetail;
  exercises: Exercise[];
  lastByExercise: Record<number, LastPerf>;
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
  const timer = useRef<RestTimerHandle>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  function exDefault(ex: WorkoutExerciseDetail): Input {
    // Prefill from this session's last set, else from last time's top set.
    const last = ex.sets[ex.sets.length - 1];
    if (last) {
      return {
        weight: String(last.weight),
        reps: String(last.reps),
        warmup: false,
      };
    }
    // A planned session: start from its target weight and the low end of the rep range.
    if (ex.targetWeight != null || ex.targetReps) {
      const lo = ex.targetReps ? Number.parseInt(ex.targetReps, 10) : NaN;
      return {
        weight: ex.targetWeight != null ? String(ex.targetWeight) : "",
        reps: Number.isFinite(lo) ? String(lo) : "",
        warmup: false,
      };
    }
    const prev = lastByExercise[ex.exerciseId]?.sets;
    const prevLast = prev?.[prev.length - 1];
    return {
      weight: prevLast ? String(prevLast.weight) : "",
      reps: prevLast ? String(prevLast.reps) : "",
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
  function removeExercise(id: number, hasSets: boolean) {
    if (hasSets && !confirm("Remove this exercise and its logged sets?"))
      return;
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
            text: `New PR · ${ex.name} · est. 1RM ${kg(res.e1rm)} kg`,
            pr: true,
          });
        }
        updateInput(ex, { warmup: false });
        navigator.vibrate?.(res.isPR ? [20, 40, 60] : 12);
        timer.current?.start();
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

  const [summary, setSummary] = useState<{ minutes: number | null; sets: number; volume: number; planned: number; done: number } | null>(null);
  /** Finish shows the session summary first; it is saved on "Save & finish". */
  function finish() {
    const planned = workout.exercises.reduce((a, e) => a + (e.targetSets ?? 0), 0);
    const done = workout.exercises.reduce((a, e) => a + Math.min(e.targetSets ?? 0, e.sets.filter((x) => !x.isWarmup).length), 0);
    const minutes = workout.startedAt && !workout.garminActivityId ? Math.round((Date.now() - Date.parse(workout.startedAt)) / 60_000) : null;
    navigator.vibrate?.([20, 40, 20]);
    setSummary({ minutes: minutes != null && minutes < 600 ? minutes : null, sets: workout.totalSets, volume: workout.totalVolume, planned, done });
  }
  function confirmFinish() {
    start(async () => {
      await finishWorkout(workout.id);
      router.push(workout.garminActivityId ? `/activities/${workout.garminActivityId}` : "/dashboard");
    });
  }
  function saveTemplate() {
    const tplName = prompt("Template name:", workout.name);
    if (!tplName?.trim()) return;
    start(async () => {
      const res = await saveWorkoutAsTemplate(workout.id, tplName);
      setToast({
        text: "error" in res ? res.error : `Saved template “${tplName.trim()}”`,
      });
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
    <div className="space-y-4 pb-16">
      {toast && (
        <Portal>
          <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-50 flex justify-center px-4">
            <div
              className={cn(
                "animate-pr-pop flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg",
                toast.pr
                  ? "bg-citron text-carbon"
                  : "border border-zinc-700 bg-zinc-900 text-zinc-100",
              )}
            >
              {toast.pr && <TrophyIcon className="h-4 w-4" />}
              {toast.text}
            </div>
          </div>
        </Portal>
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
          <Mini label="volume" value={`${kg(workout.totalVolume)} kg`} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {workout.startedAt && workout.date === todayStr() && !workout.garminActivityId && <SessionClock since={workout.startedAt} />}
          {workout.garminActivityId && (
            <a href={`/activities/${workout.garminActivityId}`} className="flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1 text-zinc-300">
              <WatchIcon className="h-3.5 w-3.5" /> linked to your watch activity
            </a>
          )}
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
                    onClick={() =>
                      removeExercise(ex.workoutExerciseId, ex.sets.length > 0)
                    }
                    aria-label="Remove exercise"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>

                {(ex.targetSets || ex.targetReps) && (() => {
                  const done = ex.sets.filter((x) => !x.isWarmup).length;
                  const target = ex.targetSets ?? 0;
                  return (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="flex items-center gap-1 rounded-full bg-teal-300/10 px-2.5 py-1 tabular-nums text-teal-100">
                        <TargetIcon className="h-3.5 w-3.5" />
                        {ex.targetSets ? `${ex.targetSets} × ` : ""}
                        {ex.targetReps ?? ""}
                        {ex.targetWeight ? ` @ ${kg(ex.targetWeight)} kg` : ""}
                      </span>
                      {target > 0 && (
                        <span className="flex items-center gap-1" aria-label={`${Math.min(done, target)} of ${target} sets done`}>
                          {Array.from({ length: target }, (_, i) => (
                            <span key={i} className={cn("h-2 w-4 rounded-full", i < done ? "bg-teal-300" : "bg-zinc-700")} />
                          ))}
                          {done >= target && <CheckIcon className="h-4 w-4 text-teal-300" />}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {lastByExercise[ex.exerciseId] && (
                  <div className="text-xs text-zinc-500">
                    <span className="text-zinc-600">
                      Last · {formatShort(lastByExercise[ex.exerciseId].date)}:
                    </span>{" "}
                    <span className="tabular-nums">
                      {lastByExercise[ex.exerciseId].sets
                        .map((s) => `${kg(s.weight)}×${s.reps}`)
                        .join(", ")}
                    </span>
                  </div>
                )}

                {ex.sets.length > 0 && (
                  <ul className="space-y-1.5">
                    {ex.sets.map((s) => {
                      const label = s.isWarmup ? "W" : String(++workingNo);
                      const e1rm = estimate1RM(s.weight, s.reps);
                      return (
                        <li
                          key={s.id}
                          className="animate-item-in flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2"
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
                            <span className="font-semibold">
                              {kg(s.weight)}
                            </span>
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
                          ? "bg-citron text-carbon"
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
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            size="md"
            onClick={saveTemplate}
            disabled={pending || workout.exercises.length === 0}
          >
            Save as template
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={discard}
            disabled={pending}
          >
            Discard workout
          </Button>
        </div>
      </div>

      <RestTimer ref={timer} />

      {summary && (
        <Portal>
          <div className="animate-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
            <div role="dialog" aria-label="Workout done" className="animate-sheet pb-safe w-full max-w-md space-y-4 rounded-t-3xl border border-zinc-800 bg-zinc-950 px-5 pb-5 pt-7 text-center sm:rounded-3xl">
              <div className="badge-pop mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-teal-300 to-emerald-500">
                <TrophyIcon className="h-8 w-8 text-paper" />
              </div>
              <div>
                <div className="text-sm uppercase tracking-wider text-teal-200">{summary.planned > 0 && summary.done >= summary.planned ? "Every set done" : "Great session"}</div>
                <div className="mt-1 text-2xl font-bold">{workout.name}</div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Mini label="minutes" value={summary.minutes != null ? String(summary.minutes) : "–"} />
                <Mini label="sets" value={String(summary.sets)} />
                <Mini label="volume" value={`${kg(summary.volume)} kg`} />
              </div>
              {summary.planned > 0 && (
                <div className="text-sm text-zinc-300">
                  {summary.done}/{summary.planned} planned sets
                  {summary.done >= summary.planned ? " · all done" : ""}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="lg" onClick={() => setSummary(null)} disabled={pending}>
                  Keep going
                </Button>
                <Button size="lg" onClick={confirmFinish} disabled={pending}>
                  {pending ? "Saving…" : "Save & finish"}
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}

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

/** Time since the session started, ticking every second. */
function SessionClock({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  if (sec > 6 * 3600) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  return (
    <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-1 font-semibold tabular-nums text-emerald-200" aria-label="Session time">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />
      {h ? `${h}:${String(m).padStart(2, "0")}` : m}:{String(ss).padStart(2, "0")}
    </span>
  );
}
