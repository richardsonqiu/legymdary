import { MEAL_TYPES, SKIPPABLE_MEALS, formatPretty, formatShort, kg, withBonus } from "@legymdary/shared";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { deviceToday, useActiveWorkout, useLastWorkouts, useRefreshAll, useToday } from "../../src/api/hooks";
import { useAuth } from "../../src/auth";
import { MEAL_LABEL } from "../../src/food/MealCard";
import { HomeHeader, HomeScoresView } from "../../src/home/HomeTop";
import { Button, Card, EmptyState, ListRow, MacroSummary, QueryBoundary, Screen, Section, SkeletonRows, StaleBanner, Text, confirm, useTones, type PhotoName } from "../../src/ui";

/** One scene a day, like the web (lib/scenes.ts). */
const SCENES: PhotoName[] = ["sunrise", "mountains", "ocean", "evening"];
const sceneFor = (date: string) => SCENES[((Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000) % SCENES.length) + SCENES.length) % SCENES.length];
const ZERO = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export default function Home() {
  const router = useRouter();
  const tones = useTones();
  const { user, signOut } = useAuth();
  const today = useToday();
  const active = useActiveWorkout();
  const last = useLastWorkouts(1);
  const first = user?.name?.split(" ")[0];
  const d = today.data;
  const lastWorkout = last.data?.workouts[0];

  const all = useRefreshAll([today, active, last]);

  return (
    <Screen
      backdrop={sceneFor(d?.date ?? deviceToday())}
      header={
        <HomeHeader
          name={first}
          initial={(user?.name || user?.email || "?").charAt(0).toUpperCase()}
          date={formatPretty(d?.date ?? deviceToday())}
          onAccount={() => void confirm({ title: user?.email ?? "Account", message: "Sign out of One Up on this phone?", confirmText: "Sign out", destructive: true }).then((yes) => { if (yes) void signOut(); })}
        />
      }
      onRefresh={all.refresh}
      refreshing={all.refreshing}
    >
      <QueryBoundary loading={today.loading} error={today.error} hasData={today.hasData} onRetry={() => void today.refresh()}>
        {d ? (
        <>
          <HomeScoresView d={d} />
          <Card onPress={() => router.navigate("/food")} accessibilityLabel="Today's food. Open the food diary">
            <MacroSummary compact totals={d.eaten ?? ZERO} targets={withBonus(d.targets, d.bonus)} />
            {d.bonus > 0 ? (
              <Text variant="caption" style={{ color: tones.good }}>
                +{d.bonus} kcal added for extra activity
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {MEAL_TYPES.map((m) => {
                const done = d.logged.includes(m);
                const skipped = d.skipped.includes(m);
                const needed = (SKIPPABLE_MEALS as readonly string[]).includes(m);
                if (!done && !skipped && !needed) return null;
                return (
                  <Text key={m} variant="caption" tone={done ? "good" : "muted"} style={{ fontWeight: "600" }}>
                    {done ? "✓" : skipped ? "–" : "○"} {MEAL_LABEL[m]}
                  </Text>
                );
              })}
            </View>
            <Button title={d.eaten.count > 0 ? "Add another meal" : "Log your first meal today"} variant="secondary" onPress={() => router.push({ pathname: "/food/add", params: { date: d.date } })} />
          </Card>

        </>
        ) : null}
      </QueryBoundary>

      <StaleBanner error={active.hasData ? active.error : last.hasData ? last.error : null} onRetry={all.refresh} />

      {active.data?.workout ? (
        <ListRow
          title={`Continue: ${active.data.workout.name}`}
          subtitle={`${active.data.workout.exerciseCount} exercises · ${active.data.workout.totalSets} sets`}
          trailing={<Text variant="label">Open ›</Text>}
          onPress={() => router.navigate("/train")}
        />
      ) : null}

      <Section title="Last workout" action="Train ›" onAction={() => router.navigate("/train")}>
        {lastWorkout ? (
          <ListRow
            title={lastWorkout.name}
            subtitle={`${formatShort(lastWorkout.date)} · ${lastWorkout.exerciseCount} exercises · ${lastWorkout.totalSets} sets · ${kg(lastWorkout.totalVolume)} kg`}
            onPress={() => router.navigate("/train")}
          />
        ) : last.loading ? (
          <SkeletonRows count={1} />
        ) : (
          <EmptyState icon="train" title="No workouts yet" description="Log a gym session in Train." />
        )}
      </Section>

    </Screen>
  );
}
