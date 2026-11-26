import { NAV } from "@legymdary/shared";
import { Tabs } from "expo-router";
import { useTheme } from "../../src/theme";

/** One tab per web NAV group (shared nav). The route file name equals the group key, except Home -> index. */
const route = (key: string) => (key === "home" ? "index" : key);

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: t.page },
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.muted,
        tabBarLabelStyle: { fontWeight: "600" },
      }}
    >
      {NAV.map((g) => (
        <Tabs.Screen key={g.key} name={route(g.key)} options={{ title: g.label }} />
      ))}
    </Tabs>
  );
}
