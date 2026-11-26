import { formatPretty, localDateMinutes } from "@legymdary/shared";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { deviceTimeZone, useAuth } from "../../src/auth";
import { useTheme } from "../../src/theme";

export default function Today() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  // "Today" in the device's zone, the same date the server derives from X-Timezone.
  const today = formatPretty(localDateMinutes(new Date(), deviceTimeZone()).date);

  return (
    <View style={[s.root, { paddingTop: insets.top + 24 }]}>
      <Text style={[s.date, { color: t.muted }]}>{today}</Text>
      <Text style={[s.title, { color: t.text }]}>Today</Text>
      <View style={[s.card, { backgroundColor: t.card, borderColor: t.border }]}>
        <Text style={{ color: t.muted }}>Signed in as</Text>
        <Text style={[s.name, { color: t.text }]}>{user?.name || user?.email}</Text>
        {user?.name ? <Text style={{ color: t.muted }}>{user.email}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={[s.out, { borderColor: t.border }]}>
        <Text style={{ color: t.text, fontWeight: "600" }}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, gap: 12 },
  date: { fontSize: 14 },
  title: { fontSize: 32, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 4 },
  name: { fontSize: 20, fontWeight: "700" },
  out: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
});
