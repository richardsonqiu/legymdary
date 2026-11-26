import { Stack } from "expo-router";
import { useTheme } from "../../../src/theme";

/** Train tab: the logger and history, with workout detail pushed on top. */
export default function TrainLayout() {
  const t = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.page } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="workout/[id]" />
    </Stack>
  );
}
