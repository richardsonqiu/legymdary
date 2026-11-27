import { NAV } from "@legymdary/shared";
import { Tabs } from "expo-router";
import { useTheme } from "../../src/theme";
import { TabBar } from "../../src/ui/TabBar";

/** One tab per web NAV group (shared nav). The route file name equals the group key, except Home -> index. */
const route = (key: string) => (key === "home" ? "index" : key);

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.page } }}
    >
      {NAV.map((g) => (
        <Tabs.Screen key={g.key} name={route(g.key)} options={{ title: g.label }} />
      ))}
    </Tabs>
  );
}
