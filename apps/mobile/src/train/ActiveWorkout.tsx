import { bestSetId, estimate1RM, formatPretty, kg, nextSetDefault, sessionSummary, workingSetCount, type ExerciseDto, type WorkoutDto } from "@legymdary/shared";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { deviceToday, useMutation, useWorkoutActions } from "../api/hooks";
import { useTheme } from "../theme";
import { Bar, Button, Card, EmptyState, Icon, IconButton, NumberStepper, Segmented, Sheet, Text, confirm, useTones, useToast } from "../ui";
import { ExercisePicker } from "./ExercisePicker";
import { Stat, volumeText } from "./WorkoutSummary";

type Input = { weight: number; reps: number; warmup: boolean };

/** Time since the session started, ticking every second. Hidden after 6 hours (a forgotten workout). */
function SessionClock({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  if (sec > 6 * 3600) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const text = `${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(sec % 60).padStart(2, "0")}`;
  return (
    <Text variant="label" tone="good" accessibilityLabel={`Session time ${text}`}>
      ● {text}
    </Text>
  );
}

/** The unfinished workout: log sets, add or remove exercises, finish or discard. */
export function ActiveWorkout({ workout }: { workout: WorkoutDto }) {
  const router = useRouter();
  const t = useTheme();
  const tones = useTones();
  const actions = useWorkoutActions();
  const { run, isBusy } = useMutation();
  const toast = useToast(3600);
  const [, rerender] = useState(0);
  // Inputs live in a ref so a tap right after a stepper edit reads the latest value, not a stale render.
  const inputs = useRef<Record<number, Input>>({});
  // Synchronous re-entry guards: state-based isBusy lags a render behind a fast second tap.
  const inFlight = useRef(new Set<string>());
  const once = async <T,>(key: string, fn: () => Promise<T>): Promise<T | undefined> => {
    if (inFlight.current.has(key)) return undefined;
    inFlight.current.add(key);
    try {
      return await fn();
    } finally {
      inFlight.current.delete(key);
    }
  };
  const [pickerOpen, setPickerOpen] = useState(false);
  const [summary, setSummary] = useState<ReturnType<typeof sessionSummary> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const def = (ex: WorkoutDto["exercises"][number]): Input => {
    const d = nextSetDefault(ex);
    return { weight: Number(d.weight) || 0, reps: Number(d.reps) || 0, warmup: false };
  };
  const inputOf = (ex: WorkoutDto["exercises"][number]) => inputs.current[ex.workoutExerciseId] ?? def(ex);
  const patch = (ex: WorkoutDto["exercises"][number], p: Partial<Input>) => {
    inputs.current[ex.workoutExerciseId] = { ...inputOf(ex), ...p };
    rerender((n) => n + 1);
  };

  const addSet = async (ex: WorkoutDto["exercises"][number]) => {
    const inp = inputOf(ex);
    setError(null);
    if (!Number.isInteger(inp.reps) || inp.reps < 1) return setError("Enter the number of reps.");
    if (!(inp.weight >= 0)) return setError("Enter a weight (kg).");
    const key = `set${ex.workoutExerciseId}`;
    const res = await once(key, () => run(key, () => actions.logSet(ex.workoutExerciseId, { reps: inp.reps, weight: inp.weight, isWarmup: inp.warmup })));
    if (!res) return;
    patch(ex, { warmup: false });
    if (res.isPR) toast.show(`New PR · ${ex.name} · est. 1RM ${kg(res.e1rm)} kg`);
  };
  // The typed number in a stepper is committed when the box loses focus. Dismiss the keyboard first,
  // then log on the next tick so the committed value is in `inputs`.
  const addSetRef = useRef(addSet);
  addSetRef.current = addSet;
  const pressAdd = (ex: WorkoutDto["exercises"][number]) => {
    Keyboard.dismiss();
    setTimeout(() => void addSetRef.current(ex), 0);
  };

  const removeSet = async (id: number) => {
    if (await confirm({ title: "Delete this set?", confirmText: "Delete", destructive: true })) await run(`ds${id}`, () => actions.deleteSet(id));
  };
  const removeExercise = async (ex: WorkoutDto["exercises"][number]) => {
    if (ex.sets.length > 0 && !(await confirm({ title: "Remove this exercise?", message: "Its logged sets are removed too.", confirmText: "Remove", destructive: true }))) return;
    await run(`re${ex.workoutExerciseId}`, () => actions.removeExercise(ex.workoutExerciseId));
  };
  const addExercise = async (e: ExerciseDto) => {
    if (await once("add", () => run("add", () => actions.addExercise(workout.id, e.id)))) setPickerOpen(false);
  };
  const createAndAdd = async (input: { name: string; muscleGroup: string; equipment: string }) => {
    const ok = await once("add", () =>
      run("add", async () => {
        const c = await actions.createExercise(input);
        await actions.addExercise(workout.id, c.id);
        return true;
      }),
    );
    if (ok) setPickerOpen(false);
  };
  const finish = async () => {
    if (await run("finish", () => actions.finish(workout.id))) {
      setSummary(null);
      router.push({ pathname: "/train/workout/[id]", params: { id: String(workout.id) } });
    }
  };
  const discard = async () => {
    if (await confirm({ title: "Discard this workout?", message: "All its sets are deleted.", confirmText: "Discard", destructive: true })) await run("discard", () => actions.discard(workout.id));
  };

  return (
    <>
      {toast.node}
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text variant="title">{workout.name}</Text>
            <Text variant="caption" tone="muted">
              {formatPretty(workout.date)}
            </Text>
          </View>
          {workout.startedAt && workout.date === deviceToday() && !workout.garminActivityId ? <SessionClock since={workout.startedAt} /> : null}
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Stat label="exercises" value={String(workout.exerciseCount)} />
          <Stat label="sets" value={String(workout.totalSets)} />
          <Stat label="volume" value={volumeText(workout.totalVolume)} />
        </View>
      </Card>

      {error ? (
        <Text variant="body" tone="warn" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {workout.exercises.length === 0 ? (
        <EmptyState icon="train" title="No exercises yet" description="Add exercises from the library to start logging sets." action={<Button title="Add exercise" onPress={() => setPickerOpen(true)} />} />
      ) : (
        <>
          {workout.exercises.map((ex) => {
            const inp = inputOf(ex);
            const best = bestSetId(ex.sets);
            const done = workingSetCount(ex);
            const target = ex.targetSets ?? 0;
            let workingNo = 0;
            return (
              <Card key={ex.workoutExerciseId}>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text variant="heading">{ex.name}</Text>
                    <Text variant="caption" tone="muted">
                      {ex.muscleGroup} · {ex.equipment}
                    </Text>
                  </View>
                  <Button title="Remove" accessibilityLabel={`Remove ${ex.name}`} variant="ghost" small loading={isBusy(`re${ex.workoutExerciseId}`)} onPress={() => void removeExercise(ex)} />
                </View>

                {ex.targetSets || ex.targetReps ? (
                  <View style={{ gap: 6 }}>
                    <Text variant="label" tone="info">
                      Target: {ex.targetSets ? `${ex.targetSets} × ` : ""}
                      {ex.targetReps ?? ""}
                      {ex.targetWeight ? ` @ ${kg(ex.targetWeight)} kg` : ""}
                    </Text>
                    {target > 0 ? (
                      <View accessible accessibilityLabel={`${Math.min(done, target)} of ${target} sets done`}>
                        <Bar value={done / target} color={tones.good} />
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {ex.sets.map((s) => (
                  <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingLeft: 12, minHeight: 48 }}>
                    <Text variant="label" tone="muted" style={{ width: 20 }}>
                      {s.isWarmup ? "W" : ++workingNo}
                    </Text>
                    <Text variant="number" style={{ flex: 1 }}>
                      {kg(s.weight)} kg × {s.reps}
                    </Text>
                    {s.id === best ? <Icon name="trophy" size={18} color={tones.good} /> : null}
                    {!s.isWarmup ? (
                      <Text variant="caption" tone="muted">
                        1RM {kg(estimate1RM(s.weight, s.reps))}
                      </Text>
                    ) : null}
                    <IconButton icon="trash" label={`Delete set ${kg(s.weight)} kg times ${s.reps}`} loading={isBusy(`ds${s.id}`)} onPress={() => void removeSet(s.id)} />
                  </View>
                ))}

                <NumberStepper label="Weight" unit="kg" step={2.5} max={2000} value={inp.weight} onChange={(v) => patch(ex, { weight: v })} />
                <NumberStepper label="Reps" max={1000} value={inp.reps} onChange={(v) => patch(ex, { reps: Math.round(v) })} />
                <Segmented
                  value={inp.warmup ? "warm" : "work"}
                  onChange={(v) => patch(ex, { warmup: v === "warm" })}
                  options={[
                    { value: "work", label: "Working set" },
                    { value: "warm", label: "Warmup" },
                  ]}
                />
                <Button title="Add set" loading={isBusy(`set${ex.workoutExerciseId}`)} onPress={() => pressAdd(ex)} />
              </Card>
            );
          })}
          <Button title="Add exercise" variant="secondary" onPress={() => setPickerOpen(true)} />
        </>
      )}

      <Button title="Finish workout" onPress={() => setSummary(sessionSummary(workout, Date.now()))} />
      <Button title="Discard workout" variant="danger" loading={isBusy("discard")} onPress={() => void discard()} />

      <ExercisePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        existingIds={workout.exercises.map((e) => e.exerciseId)}
        onPick={(e) => void addExercise(e)}
        onCreate={(i) => void createAndAdd(i)}
        busy={isBusy("add")}
      />

      <Sheet visible={summary != null} title="Finish workout?" onClose={() => setSummary(null)}>
        {summary ? (
          <>
            <View style={{ alignSelf: "center", width: 56, height: 56, borderRadius: 28, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" }}>
              <Icon name="trophy" size={28} color={t.onAccent} />
            </View>
            <Text variant="title" style={{ textAlign: "center" }}>{summary.planned > 0 && summary.done >= summary.planned ? "Every set done" : "Great session"}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Stat label="minutes" value={summary.minutes != null ? String(summary.minutes) : "–"} />
              <Stat label="sets" value={String(summary.sets)} />
              <Stat label="volume" value={volumeText(summary.volume)} />
            </View>
            {summary.planned > 0 ? (
              <Text variant="body" tone="muted">
                {summary.done}/{summary.planned} planned sets{summary.done >= summary.planned ? " · all done" : ""}
              </Text>
            ) : null}
            <Button title="Save & finish" loading={isBusy("finish")} onPress={() => void finish()} />
            <Button title="Keep going" variant="secondary" onPress={() => setSummary(null)} />
          </>
        ) : null}
      </Sheet>
    </>
  );
}
