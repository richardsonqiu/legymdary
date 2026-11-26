import { MEAL_TYPES, SKIPPABLE_MEALS, addDaysStr, formatPretty, mealTypeForHour, withBonus, type MealDto } from "@legymdary/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { deviceToday, errorMessage, useFoodActions, useMeals, useRecentMeals, useToday } from "../../../src/api/hooks";
import { MEAL_LABEL, MealCard, MealThumb } from "../../../src/food/MealCard";
import { Button, Card, EmptyState, ErrorState, Loading, MacroSummary, Screen, Section, Text, useTones } from "../../../src/ui";

const ZERO = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export default function Food() {
  const router = useRouter();
  const tones = useTones();
  const today = deviceToday();
  const [date, setDate] = useState(today);
  const day = useToday(date);
  const meals = useMeals(date);
  const recent = useRecentMeals(8);
  const actions = useFoodActions();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      Alert.alert("Couldn't do that", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const refresh = () => {
    day.refresh();
    meals.refresh();
    recent.refresh();
  };
  const add = (type: string) => router.push({ pathname: "/food/add", params: { date, type } });
  const open = (m: MealDto) => router.push({ pathname: "/food/meal/[id]", params: { id: String(m.id) } });
  const nowType = mealTypeForHour(new Date().getHours());

  return (
    <Screen title="Food" eyebrow="Fuel" onRefresh={refresh} refreshing={day.refreshing || meals.refreshing}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Button title="‹" variant="ghost" small onPress={() => setDate(addDaysStr(date, -1))} />
        <Pressable accessibilityRole="button" accessibilityLabel="Jump to today" onPress={() => setDate(today)} hitSlop={8}>
          <Text variant="heading">{date === today ? "Today" : formatPretty(date)}</Text>
        </Pressable>
        <Button title="›" variant="ghost" small disabled={date >= today} onPress={() => setDate(addDaysStr(date, 1))} />
      </View>

      {day.loading ? (
        <Loading />
      ) : day.error ? (
        <ErrorState message={day.error} onRetry={day.refresh} />
      ) : day.data ? (
        <Card>
          <MacroSummary totals={day.data.eaten ?? ZERO} targets={withBonus(day.data.targets, day.data.bonus)} />
          {day.data.targets == null ? (
            <Text variant="caption" tone="muted">
              Set a goal in the web app to get daily targets.
            </Text>
          ) : null}
          {day.data.bonus > 0 ? (
            <Text variant="caption" style={{ color: tones.good }}>
              +{day.data.bonus} kcal added for extra activity
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Button title="Add a meal" onPress={() => add(nowType)} />

      {meals.loading ? (
        <Loading />
      ) : meals.error ? (
        <ErrorState message={meals.error} onRetry={meals.refresh} />
      ) : (
        MEAL_TYPES.map((type) => {
          const list = (meals.data?.meals ?? []).filter((m) => m.mealType === type);
          const skipped = day.data?.skipped.includes(type) ?? false;
          const skippable = (SKIPPABLE_MEALS as readonly string[]).includes(type);
          return (
            <Section key={type} title={MEAL_LABEL[type]} action={list.length ? "Add another" : undefined} onAction={() => add(type)}>
              {list.map((m) => (
                <MealCard key={m.id} meal={m} onPress={() => open(m)} />
              ))}
              {list.length === 0 ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {skipped ? (
                    <>
                      <Text variant="body" tone="muted" style={{ flex: 1, alignSelf: "center" }}>
                        Skipped
                      </Text>
                      <Button title="Undo skip" variant="secondary" small loading={busy === `u${type}`} onPress={() => void run(`u${type}`, () => actions.unskipMeal(date, type))} />
                    </>
                  ) : (
                    <>
                      <Button title={`Log ${MEAL_LABEL[type].toLowerCase()}`} variant="secondary" small style={{ flex: 1 }} onPress={() => add(type)} />
                      {skippable ? <Button title="Skip" variant="ghost" small loading={busy === `s${type}`} onPress={() => void run(`s${type}`, () => actions.skipMeal(date, type))} /> : null}
                    </>
                  )}
                </View>
              ) : null}
            </Section>
          );
        })
      )}

      <Section title="Eat again">
        {recent.data && recent.data.meals.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {recent.data.meals.map((m) => (
              <Card key={m.id} onPress={() => void run(`r${m.id}`, () => actions.relogMeal(m.id, date, date === today ? nowType : undefined))} accessibilityLabel={`Eat again: ${m.name}`} style={{ width: 150, padding: 10, gap: 6, opacity: busy === `r${m.id}` ? 0.5 : 1 }}>
                <MealThumb id={m.id} has={m.hasPhoto} size={64} />
                <Text variant="label" numberOfLines={2}>
                  {m.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {Math.round(m.calories)} kcal
                </Text>
              </Card>
            ))}
          </ScrollView>
        ) : recent.loading ? (
          <Loading />
        ) : (
          <EmptyState title="Nothing yet" description="Meals you log show up here for one-tap logging again." />
        )}
      </Section>
    </Screen>
  );
}
