import { NAV } from "@legymdary/shared";
import { StyleSheet, View } from "react-native";
import { Text } from "./ui/Text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./theme";

/** Empty tab for a web NAV group that has no native screen yet. */
export function Placeholder({ navKey }: { navKey: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const group = NAV.find((g) => g.key === navKey);
  return (
    <View style={[s.root, { paddingTop: insets.top + 24 }]}>
      <Text style={[s.title, { color: t.text }]}>{group?.label ?? navKey}</Text>
      <Text style={{ color: t.muted }}>Coming soon. Use the web app for now.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, gap: 8 },
  title: { fontSize: 32, fontWeight: "800" },
});
