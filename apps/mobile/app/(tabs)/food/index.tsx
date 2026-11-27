import { MEAL_TYPES, SKIPPABLE_MEALS, addDaysStr, formatPretty, mealTypeForHour, withBonus, type MealDto } from "@legymdary/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { deviceToday, useFoodActions, useMeals, useMutation, useRecentMeals, useRefreshAll, useToday } from "../../../src/api/hooks";
import { MEAL_LABEL, MealCard, MealThumb } from "../../../src/food/MealCard";
import { Button, Card, IconButton, EmptyState, MacroSummary, QueryBoundary, Screen, Section, Segmented, Sheet, SkeletonRows, StaleBanner, Text, useToast, useTones } from "../../../src/ui";

const ZERO = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export default function Food() {
  const router = useRouter();
  const tones = useTones();
  const today = deviceToday();
  // null follows "today", so the screen stays right if the app is open past midnight.
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const setDate = (d: string) => setPicked(d >= today ? null : d);
  const day = useToday(date);
  const meals = useMeals(date);
  const recent = useRecentMeals(8);
  const actions = useFoodActions();
  const { run, busy } = useMutation();
  const toast = useToast();
  const all = useRefreshAll([day, meals, recent]);
  const nowType = mealTypeForHour(new Date().getHours());

  const [again, setAgain] = useState<MealDto | null>(null);
  const [againType, setAgainType] = useState<string>(nowType);
  const openAgain = (m: MealDto) => {
    setAgainType(date === today ? nowType : m.mealType);
    setAgain(m);
  };
  const confirmAgain = async () => {
    if (!again) return;
    const ok = await run(`r${again.id}`, () => actions.relogMeal(again.id, date, againType));
    if (ok) {
      toast.show(`Logged ${again.name}`);
      setAgain(null);
    }
  };

  const add = (type: string) => router.push({ pathname: "/food/add", params: { date, type } });
  const open = (m: MealDto) => router.push({ pathname: "/food/meal/[id]", params: { id: String(m.id) } });

  return (
    <Screen title="Food" eyebrow="Fuel" photo="salmon" subtitle="Snap a meal or describe it" onRefresh={all.refresh} refreshing={all.refreshing}>
      {toast.node}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <IconButton icon="chevronLeft" label="Previous day" onPress={() => setDate(addDaysStr(date, -1))} />
        <Pressable accessibilityRole="button" accessibilityLabel="Jump to today" onPress={() => setPicked(null)} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text variant="heading">{date === today ? "Today" : formatPretty(date)}</Text>
        </Pressable>
        <IconButton icon="chevronRight" label="Next day" disabled={date >= today} onPress={() => setDate(addDaysStr(date, 1))} />
      </View>

      <QueryBoundary loading={day.loading} error={day.error} hasData={day.hasData} onRetry={() => void day.refresh()}>
        {day.data ? (
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
      </QueryBoundary>

      <Button title="Add a meal" onPress={() => add(nowType)} />

      {meals.loading ? (
        <SkeletonRows count={4} />
      ) : (
        <QueryBoundary loading={false} error={meals.error} hasData={meals.hasData} onRetry={() => void meals.refresh()}>
          {MEAL_TYPES.map((type) => {
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
          })}
        </QueryBoundary>
      )}

      <Section title="Eat again">
        <StaleBanner error={recent.hasData ? recent.error : null} onRetry={() => void recent.refresh()} />
        {recent.data && recent.data.meals.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {recent.data.meals.map((m) => (
              <Card key={m.id} onPress={() => openAgain(m)} accessibilityLabel={`Eat again: ${m.name}`} style={{ width: 150, padding: 10, gap: 6 }}>
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
          <SkeletonRows count={1} height={120} />
        ) : (
          <EmptyState icon="food" title="Nothing yet" description="Meals you log show up here for one-tap logging again." />
        )}
      </Section>

      <Sheet visible={again != null} title="Log this again?" onClose={() => setAgain(null)}>
        {again ? (
          <>
            <Text variant="heading">{again.name}</Text>
            <Text variant="body" tone="muted">
              {Math.round(again.calories)} kcal · P {Math.round(again.protein)} · C {Math.round(again.carbs)} · F {Math.round(again.fat)}
            </Text>
            <Text variant="caption" tone="muted">
              Adds it to {date === today ? "today" : formatPretty(date)} as:
            </Text>
            <Segmented value={againType} onChange={setAgainType} options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} />
            <Button title={`Log as ${MEAL_LABEL[againType].toLowerCase()}`} loading={busy === `r${again.id}`} onPress={() => void confirmAgain()} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}
