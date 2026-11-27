import { bandLabel, mealQuality, type Band, type MealDto } from "@legymdary/shared";
import { Image, View } from "react-native";
import { useMealPhoto } from "../api/hooks";
import { useTheme } from "../theme";
import { Card, Text, useTones } from "../ui";

export const MEAL_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

export function useBandColor() {
  const t = useTheme();
  const tones = useTones();
  return (b: Band | null) => (b === "nutritious" || b === "good" ? tones.good : b === "fair" ? tones.warn : b === "limited" ? tones.rose : t.muted);
}

export const qualityOf = (m: MealDto) => mealQuality({ calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber, sugar: m.sugar, processing: m.processing });

export function BandBadge({ band }: { band: Band | null }) {
  const color = useBandColor()(band);
  if (!band) return null;
  return (
    <Text variant="caption" style={{ color, fontWeight: "700" }}>
      {bandLabel(band)}
    </Text>
  );
}

export function MealThumb({ id, has, size = 56 }: { id: number; has: boolean; size?: number }) {
  const t = useTheme();
  const src = useMealPhoto(id, has);
  if (!has || !src) return <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: t.border }} />;
  return <Image source={src} accessibilityIgnoresInvertColors style={{ width: size, height: size, borderRadius: 12, backgroundColor: t.border }} />;
}

export function MealCard({ meal, onPress }: { meal: MealDto; onPress: () => void }) {
  const q = qualityOf(meal);
  return (
    <Card onPress={onPress} accessibilityLabel={`${meal.name}, ${Math.round(meal.calories)} kilocalories`} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
      <MealThumb id={meal.id} has={meal.hasPhoto} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={2} style={{ fontWeight: "600" }}>
          {meal.name}
        </Text>
        <Text variant="caption" tone="muted">
          {Math.round(meal.calories)} kcal · P {Math.round(meal.protein)} · C {Math.round(meal.carbs)} · F {Math.round(meal.fat)}
        </Text>
      </View>
      <BandBadge band={q.band} />
    </Card>
  );
}
