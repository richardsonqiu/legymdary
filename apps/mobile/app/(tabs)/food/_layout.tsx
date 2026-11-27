import { Stack } from "expo-router";
import { useTheme } from "../../../src/theme";

/** Food tab: the diary, then the add-meal and meal-detail screens pushed on top of it. */
export default function FoodLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.page } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="add" options={{ presentation: "modal" }} />
      <Stack.Screen name="meal/[id]" />
    </Stack>
  );
}
