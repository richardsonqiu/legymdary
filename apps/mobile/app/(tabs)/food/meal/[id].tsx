import { MEAL_TYPES, formatPretty, type MealDto } from "@legymdary/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Image, View } from "react-native";
import { deviceToday, errorMessage, useApi, useFoodActions, useMealPhoto } from "../../../../src/api/hooks";
import { BandBadge, MEAL_LABEL, qualityOf } from "../../../../src/food/MealCard";
import { useTheme } from "../../../../src/theme";
import { Button, Card, ListRow, QueryBoundary, Screen, Section, Segmented, Sheet, Text, TextField, useTones } from "../../../../src/ui";

function Photo({ meal }: { meal: MealDto }) {
  const t = useTheme();
  const src = useMealPhoto(meal.id, meal.hasPhoto);
  if (!src) return null;
  return <Image source={src} accessibilityLabel={meal.name} accessibilityIgnoresInvertColors style={{ width: "100%", height: 220, borderRadius: 16, backgroundColor: t.border }} />;
}

export default function MealDetail() {
  const router = useRouter();
  const tones = useTones();
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = Number(raw);
  // Name starts with "meals" so food writes refresh it.
  const q = useApi(`meals:one:${id}`, (api) => api.meal(id));
  const actions = useFoodActions();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("snack");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const meal = q.data?.meal;
  const fail = (e: unknown) => Alert.alert("Couldn't do that", errorMessage(e));
  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      after?.();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (m: MealDto) => {
    setName(m.name);
    setType(m.mealType);
    setNotes(m.notes ?? "");
    setEditing(true);
  };
  const saveEdit = (m: MealDto) =>
    run(
      () =>
        actions.updateMeal(m.id, {
          date: m.date,
          mealType: type,
          name: name.trim() || m.name,
          items: m.items,
          calories: m.calories,
          protein: m.protein,
          carbs: m.carbs,
          fat: m.fat,
          notes: notes.trim() || null,
          aiEstimated: m.aiEstimated,
          eatenAt: m.eatenAt,
          advisor: m.advisor,
        }),
      () => setEditing(false),
    );
  const confirmDelete = (m: MealDto) =>
    Alert.alert("Delete this meal?", m.name, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run(() => actions.deleteMeal(m.id), () => router.back()) },
    ]);

  const quality = meal ? qualityOf(meal) : null;
  return (
    <Screen
      title={meal?.name ?? "Meal"}
      eyebrow={meal ? `${MEAL_LABEL[meal.mealType] ?? meal.mealType} · ${formatPretty(meal.date)}` : undefined}
      right={<Button title="Back" variant="ghost" small onPress={() => router.back()} />}
      onRefresh={q.refresh}
      refreshing={q.refreshing}
    >
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.refresh}>
        {meal && quality ? (
          <>
            <Photo meal={meal} />
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text variant="title">{Math.round(meal.calories)} kcal</Text>
                <BandBadge band={quality.band} />
              </View>
              <Text variant="body" tone="muted">
                Protein {Math.round(meal.protein)} g · Carbs {Math.round(meal.carbs)} g · Fat {Math.round(meal.fat)} g
              </Text>
              {meal.advisor ? <Text variant="body">{meal.advisor}</Text> : null}
              {meal.notes ? (
                <Text variant="body" tone="muted">
                  {meal.notes}
                </Text>
              ) : null}
            </Card>

            {meal.items.length > 0 ? (
              <Section title="What's in it">
                {meal.items.map((it, i) => (
                  <ListRow key={`${it.name}-${i}`} title={it.name} subtitle={it.portion || undefined} trailing={<Text variant="number">{Math.round(it.calories)}</Text>} />
                ))}
              </Section>
            ) : null}

            {quality.score != null ? (
              <Section title="Quality">
                <Card style={{ gap: 8 }}>
                  {quality.nutrients
                    .filter((n) => n.level)
                    .map((n) => (
                      <View key={n.key} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                        <Text variant="body" style={{ flex: 1 }}>
                          {n.label}
                        </Text>
                        <Text variant="label" style={{ color: n.tone === "good" ? tones.good : n.tone === "watch" ? tones.warn : undefined }}>
                          {n.level}
                          {n.detail ? ` · ${n.detail}` : ""}
                        </Text>
                      </View>
                    ))}
                  {quality.partial ? (
                    <Text variant="caption" tone="muted">
                      Fiber, sugar or processing level is unknown for this meal.
                    </Text>
                  ) : null}
                </Card>
              </Section>
            ) : null}

            <Button title="Eat again today" variant="secondary" loading={busy} onPress={() => void run(() => actions.relogMeal(meal.id, deviceToday()), () => router.back())} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button title="Edit" variant="secondary" style={{ flex: 1 }} onPress={() => startEdit(meal)} />
              <Button title="Delete" variant="danger" style={{ flex: 1 }} onPress={() => confirmDelete(meal)} />
            </View>

            <Sheet visible={editing} title="Edit meal" onClose={() => setEditing(false)}>
              <TextField label="Name" value={name} onChangeText={setName} />
              <Segmented value={type} onChange={setType} options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} />
              <TextField label="Notes" value={notes} onChangeText={setNotes} multiline />
              <Button title="Save" loading={busy} onPress={() => void saveEdit(meal)} />
            </Sheet>
          </>
        ) : null}
      </QueryBoundary>
    </Screen>
  );
}
