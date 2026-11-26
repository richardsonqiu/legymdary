import { formatPretty, kg, type TemplateDto } from "@legymdary/shared";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { deviceToday, useLastWorkouts, useMutation, useTemplates, useWorkoutActions } from "../api/hooks";
import { Button, Card, EmptyState, ListRow, QueryBoundary, Section, SkeletonRows, StaleBanner, Text, TextField } from "../ui";

const templateLine = (t: TemplateDto) => t.exercises.map((e) => (e.targetSets ? `${e.name} ×${e.targetSets}` : e.name)).join(" · ");

/** No workout in progress: today's plan, templates, a blank workout, and past sessions. */
export function StartWorkout({ history, templates }: { history: ReturnType<typeof useLastWorkouts>; templates: ReturnType<typeof useTemplates> }) {
  const router = useRouter();
  const actions = useWorkoutActions();
  const { run: runMutation, isBusy } = useMutation();
  // Sync lock: isBusy lags a render, so a fast second tap could start a second workout.
  const locked = useRef(false);
  const run = async <T,>(key: string, fn: () => Promise<T>) => {
    if (locked.current) return undefined;
    locked.current = true;
    try {
      return await runMutation(key, fn);
    } finally {
      locked.current = false;
    }
  };
  const [name, setName] = useState("Workout");

  const open = (id: number) => router.push({ pathname: "/train/workout/[id]", params: { id: String(id) } });
  const list = history.data?.workouts ?? [];
  // One start at a time: a second would fail ("finish the workout in progress") or start twice.
  const starting = ["rec", "new", ...(templates.data?.templates ?? []).map((t) => `t${t.id}`)].some(isBusy);

  return (
    <>
      <Card>
        <Text variant="heading">Today&apos;s workout</Text>
        <Text variant="body" tone="muted">
          A session built from your training days and last results.
        </Text>
        <Button title="Start recommended workout" loading={isBusy("rec")} disabled={starting} onPress={() => void run("rec", () => actions.startRecommended())} />
      </Card>

      <Section title="Your templates">
        <QueryBoundary loading={templates.loading} error={templates.error} hasData={templates.hasData} onRetry={() => void templates.refresh()}>
          {templates.data && templates.data.templates.length > 0 ? (
            templates.data.templates.map((t) => (
              <ListRow
                key={t.id}
                title={t.name}
                subtitle={templateLine(t)}
                trailing={<Button title="Start" accessibilityLabel={`Start ${t.name}`} small loading={isBusy(`t${t.id}`)} disabled={starting} onPress={() => void run(`t${t.id}`, () => actions.startFromTemplate(t.id, deviceToday()))} />}
              />
            ))
          ) : (
            <EmptyState title="No templates yet" description="Templates you save in the web app show up here." />
          )}
        </QueryBoundary>
      </Section>

      <Card>
        <Text variant="heading">Blank workout</Text>
        <TextField label="Workout name" value={name} onChangeText={setName} placeholder="e.g. Push day" maxLength={200} />
        <Button title="Start workout" variant="secondary" loading={isBusy("new")} disabled={starting} onPress={() => void run("new", () => actions.createWorkout(name.trim() || "Workout", deviceToday()))} />
      </Card>

      <Section title="History">
        <StaleBanner error={history.hasData ? history.error : null} onRetry={() => void history.refresh()} />
        {history.loading ? (
          <SkeletonRows count={3} />
        ) : !history.hasData && history.error ? (
          <QueryBoundary loading={false} error={history.error} hasData={false} onRetry={() => void history.refresh()}>
            {null}
          </QueryBoundary>
        ) : list.length === 0 ? (
          <EmptyState title="No gym sessions logged" description="Finish a workout and it shows here." />
        ) : (
          list.map((w) => <ListRow key={w.id} title={w.name} subtitle={`${formatPretty(w.date)} · ${w.totalSets} sets · ${kg(w.totalVolume)} kg`} onPress={() => open(w.id)} />)
        )}
      </Section>
    </>
  );
}
