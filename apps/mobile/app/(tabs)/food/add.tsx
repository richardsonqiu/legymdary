import {
  MEAL_TYPES,
  eatenLabel,
  formatPretty,
  localDateMinutes,
  mealQuality,
  qualityFromItems,
  sumMacros,
  withEaten,
  type MealAnalysisDto,
  type MealItem,
  type MealItemDto,
} from "@legymdary/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Image, View } from "react-native";
import { deviceToday, errorMessage, useFoodActions } from "../../../src/api/hooks";
import { useAuth, deviceTimeZone } from "../../../src/auth";
import { BandBadge, MEAL_LABEL } from "../../../src/food/MealCard";
import { pickMealPhoto, type MealPhoto } from "../../../src/food/photo";
import { Button, Card, Screen, Segmented, Text, TextField } from "../../../src/ui";

const AMOUNTS = [0.5, 1, 1.5, 2];
const num = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
/** The API allows a missing portion; the shared math wants a string. */
const toItem = (i: MealItemDto): MealItem => ({ ...i, portion: i.portion ?? "" });

export default function AddMeal() {
  const router = useRouter();
  const { api } = useAuth();
  const actions = useFoodActions();
  const params = useLocalSearchParams<{ date?: string; type?: string }>();
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : deviceToday();
  const [type, setType] = useState<string>(MEAL_TYPES.find((m) => m === params.type) ?? "snack");
  const [photo, setPhoto] = useState<MealPhoto | null>(null);
  const [hint, setHint] = useState("");
  const [analysis, setAnalysis] = useState<MealAnalysisDto | null>(null);
  const [items, setItems] = useState<MealItem[]>([]);
  const [name, setName] = useState("");
  const [manual, setManual] = useState(false);
  const [q, setQ] = useState({ calories: "", protein: "", carbs: "", fat: "" });
  const [busy, setBusy] = useState<"analyze" | "save" | null>(null);

  const fail = (e: unknown) => Alert.alert("Couldn't do that", errorMessage(e));

  const pick = async (source: "camera" | "library") => {
    try {
      const p = await pickMealPhoto(source);
      if (p) setPhoto(p);
    } catch (e) {
      fail(e);
    }
  };

  const analyze = async () => {
    setBusy("analyze");
    try {
      const a = await api.analyzeMeal({ image: photo?.analysis ?? null, hint: hint.trim() || null });
      if (!a.isFood || a.items.length === 0) {
        Alert.alert("No food found", a.notes || "Try another photo or describe the meal.");
        return;
      }
      setAnalysis(a);
      setItems(a.items.map(toItem));
      setName(a.name);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    try {
      const today = deviceToday();
      const eatenAt = date === today ? localDateMinutes(new Date(), deviceTimeZone()).minutes : null;
      const base = { date, mealType: type, name: name.trim() || MEAL_LABEL[type], eatenAt, photo: photo?.thumb ?? null };
      if (manual) {
        await actions.createMeal({ ...base, items: [], calories: num(q.calories), protein: num(q.protein), carbs: num(q.carbs), fat: num(q.fat) });
      } else {
        await actions.createMeal({ ...base, items, aiEstimated: true, advisor: analysis?.advisor ?? null });
      }
      router.back();
    } catch (e) {
      fail(e);
      setBusy(null);
    }
  };

  const reviewing = analysis != null;
  const totals = sumMacros(items);
  const quality = mealQuality({ ...totals, ...qualityFromItems(items) });
  const canSave = manual ? name.trim().length > 0 && num(q.calories) > 0 : reviewing && items.length > 0;

  return (
    <Screen title="Add meal" eyebrow={formatPretty(date)} right={<Button title="Cancel" variant="ghost" small onPress={() => router.back()} />}>
      <Segmented value={type} onChange={setType} options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} />

      {!reviewing && !manual ? (
        <>
          {photo ? <Image source={{ uri: photo.uri }} accessibilityLabel="Meal photo" style={{ width: "100%", height: 200, borderRadius: 16 }} /> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button title="Take photo" variant="secondary" style={{ flex: 1 }} onPress={() => void pick("camera")} />
            <Button title="Choose photo" variant="secondary" style={{ flex: 1 }} onPress={() => void pick("library")} />
          </View>
          <TextField label="Describe it (optional with a photo)" value={hint} onChangeText={setHint} placeholder="1 plate chicken rice with soup" multiline />
          <Button title="Estimate with AI" loading={busy === "analyze"} disabled={!photo && hint.trim().length < 3} onPress={() => void analyze()} />
          <Button title="Enter calories myself" variant="ghost" onPress={() => setManual(true)} />
        </>
      ) : null}

      {manual ? (
        <>
          <TextField label="Name" value={name} onChangeText={setName} placeholder="Protein bar" />
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
              <View key={k} style={{ flex: 1 }}>
                <TextField label={k === "calories" ? "kcal" : `${k[0].toUpperCase()}${k.slice(1)} g`} keyboardType="decimal-pad" value={q[k]} onChangeText={(v) => setQ({ ...q, [k]: v })} />
              </View>
            ))}
          </View>
          <Button title="Back to photo and AI" variant="ghost" onPress={() => setManual(false)} />
        </>
      ) : null}

      {reviewing ? (
        <>
          {photo ? <Image source={{ uri: photo.uri }} accessibilityLabel="Meal photo" style={{ width: "100%", height: 160, borderRadius: 16 }} /> : null}
          <TextField label="Name" value={name} onChangeText={setName} />
          {analysis.advisor ? (
            <Text variant="body" tone="muted">
              {analysis.advisor}
            </Text>
          ) : null}
          <Text variant="caption" tone="muted">
            Confidence: {analysis.confidence}. Check the amounts below.
          </Text>
          {items.map((it, idx) => (
            <Card key={`${it.name}-${idx}`} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text variant="body" style={{ fontWeight: "600" }}>
                    {it.name}
                  </Text>
                  {it.portion ? (
                    <Text variant="caption" tone="muted">
                      {it.portion}
                    </Text>
                  ) : null}
                </View>
                <Text variant="number">{Math.round(it.calories)} kcal</Text>
              </View>
              <Text variant="caption" tone="muted">
                P {Math.round(it.protein)} · C {Math.round(it.carbs)} · F {Math.round(it.fat)}
              </Text>
              <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                {AMOUNTS.map((a) => (
                  <Button key={a} title={eatenLabel(a)} small variant={(it.eaten ?? 1) === a ? "primary" : "secondary"} onPress={() => setItems(items.map((x, i) => (i === idx ? withEaten(x, a) : x)))} />
                ))}
                <View style={{ flex: 1 }} />
                <Button title="Remove" small variant="danger" onPress={() => setItems(items.filter((_, i) => i !== idx))} />
              </View>
            </Card>
          ))}
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="heading">{Math.round(totals.calories)} kcal</Text>
              <BandBadge band={quality.band} />
            </View>
            <Text variant="caption" tone="muted">
              P {Math.round(totals.protein)} · C {Math.round(totals.carbs)} · F {Math.round(totals.fat)}
            </Text>
          </Card>
          <Button
            title="Start over"
            variant="ghost"
            onPress={() => {
              setAnalysis(null);
              setItems([]);
            }}
          />
        </>
      ) : null}

      {reviewing || manual ? <Button title="Save meal" loading={busy === "save"} disabled={!canSave} onPress={() => void save()} /> : null}
    </Screen>
  );
}
