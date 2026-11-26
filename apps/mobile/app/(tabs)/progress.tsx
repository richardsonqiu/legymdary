import { useState } from "react";
import { deviceToday, useRefreshAll } from "../../src/api/hooks";
import { useBodyStats, useConsistency, usePlan } from "../../src/api/progress";
import { ConsistencyCard } from "../../src/progress/Consistency";
import { GoalSummary, GoalsSheet, PaceCard } from "../../src/progress/Plan";
import { BodyTrend, WeighInForm, WeighInList } from "../../src/progress/WeighIns";
import { EmptyState, QueryBoundary, Screen, Section, SkeletonRows, StaleBanner } from "../../src/ui";

export default function Progress() {
  const today = deviceToday();
  const body = useBodyStats();
  const plan = usePlan();
  const consistency = useConsistency();
  const all = useRefreshAll([body, plan, consistency]);
  const [editing, setEditing] = useState(false);
  const stats = body.data?.bodyStats ?? [];
  const latest = [...stats].reverse().find((s) => s.weight != null) ?? null;

  return (
    <Screen title="Progress" eyebrow="Trends" onRefresh={all.refresh} refreshing={all.refreshing}>
      {body.hasData ? <StaleBanner error={body.error} onRetry={() => void body.refresh()} /> : null}
      <Section title="Log body stats">
        <WeighInForm latest={latest} today={today} />
      </Section>

      <Section title="Body measurements">
        {body.loading ? (
          <SkeletonRows count={2} height={120} />
        ) : (
          <QueryBoundary loading={false} error={body.error} hasData={body.hasData} onRetry={() => void body.refresh()}>
            <BodyTrend stats={stats} today={today} />
          </QueryBoundary>
        )}
      </Section>

      <Section title="Goal">
        {plan.loading ? (
          <SkeletonRows count={2} height={120} />
        ) : (
          <QueryBoundary loading={false} error={plan.error} hasData={plan.hasData} onRetry={() => void plan.refresh()}>
            {plan.data ? (
              <>
                <GoalSummary data={plan.data} today={today} onEdit={() => setEditing(true)} />
                <PaceCard data={plan.data} today={today} />
                {editing ? <GoalsSheet visible goals={plan.data.goals} onClose={() => setEditing(false)} /> : null}
              </>
            ) : null}
          </QueryBoundary>
        )}
      </Section>

      <Section title="Consistency">
        {consistency.loading ? (
          <SkeletonRows count={1} height={160} />
        ) : (
          <QueryBoundary loading={false} error={consistency.error} hasData={consistency.hasData} onRetry={() => void consistency.refresh()}>
            {consistency.data ? <ConsistencyCard data={consistency.data} today={today} /> : null}
          </QueryBoundary>
        )}
      </Section>

      <Section title="Weigh-ins">
        {body.loading ? (
          <SkeletonRows count={3} />
        ) : stats.length === 0 ? (
          <EmptyState title="No entries yet" description="Log your first weigh-in above." />
        ) : (
          <WeighInList stats={stats} />
        )}
      </Section>
    </Screen>
  );
}
