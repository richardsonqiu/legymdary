import { useLocalSearchParams, useRouter } from "expo-router";
import { useRefreshAll, useWorkout } from "../../../../src/api/hooks";
import { WorkoutSummary } from "../../../../src/train/WorkoutSummary";
import { Button, EmptyState, QueryBoundary, Screen } from "../../../../src/ui";

export default function WorkoutDetail() {
  const router = useRouter();
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const q = useWorkout(Number(raw));
  const all = useRefreshAll([q]);
  const workout = q.data?.workout;

  return (
    <Screen right={<Button title="Back" variant="ghost" small onPress={() => router.back()} />} onRefresh={all.refresh} refreshing={all.refreshing}>
      <QueryBoundary loading={q.loading} error={q.error} hasData={q.hasData} onRetry={() => void q.refresh()}>
        {workout ? <WorkoutSummary workout={workout} /> : <EmptyState title="Workout not found" />}
      </QueryBoundary>
    </Screen>
  );
}
