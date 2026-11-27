import { useActiveWorkout, useLastWorkouts, useRefreshAll, useTemplates } from "../../../src/api/hooks";
import { ActiveWorkout } from "../../../src/train/ActiveWorkout";
import { StartWorkout } from "../../../src/train/StartWorkout";
import { QueryBoundary, Screen } from "../../../src/ui";

export default function Train() {
  const active = useActiveWorkout();
  const history = useLastWorkouts(30);
  const templates = useTemplates();
  const all = useRefreshAll([active, history, templates]);
  const workout = active.data?.workout ?? null;

  return (
    <Screen title="Train" eyebrow={workout ? "In progress" : "Workout"} photo="pullup" subtitle="Today's plan, or start your own" onRefresh={all.refresh} refreshing={all.refreshing}>
      <QueryBoundary loading={active.loading} error={active.error} hasData={active.hasData} onRetry={() => void active.refresh()}>
        {workout ? <ActiveWorkout workout={workout} /> : <StartWorkout history={history} templates={templates} />}
      </QueryBoundary>
    </Screen>
  );
}
