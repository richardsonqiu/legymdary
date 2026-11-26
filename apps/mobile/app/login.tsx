import { ApiClientError } from "@legymdary/shared";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { useTheme } from "../src/theme";

export default function Login() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  const input = [s.input, { backgroundColor: t.card, borderColor: t.border, color: t.text }];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[s.root, { backgroundColor: t.page, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
    >
      <View accessible accessibilityLabel="one up" style={s.brand}>
        <Text style={[s.title, { color: t.text }]}>one up</Text>
        {/* Round full stop in the accent colour, like the web wordmark. */}
        <View style={[s.dot, { backgroundColor: t.dark ? "#DED97A" : "#8A851F" }]} />
      </View>
      <Text style={[s.sub, { color: t.muted }]}>Sign in to continue</Text>

      <TextInput
        style={input}
        placeholder="Email"
        placeholderTextColor={t.muted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={input}
        placeholder="Password"
        placeholderTextColor={t.muted}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />

      {error ? (
        <Text accessibilityRole="alert" style={{ color: t.danger }}>
          {error}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={submit}
        style={[s.button, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}
      >
        {busy ? <ActivityIndicator color={t.onAccent} /> : <Text style={[s.buttonText, { color: t.onAccent }]}>Sign in</Text>}
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={[s.button, s.google, { borderColor: t.border }]}>
        <Text style={{ color: t.muted, fontWeight: "600" }}>Continue with Google</Text>
      </Pressable>
      <Text style={[s.note, { color: t.muted }]}>
        Google sign-in is off until the iOS and Android OAuth client IDs are created in Google Cloud.
      </Text>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, gap: 12 },
  title: { fontSize: 32, fontWeight: "800" },
  brand: { flexDirection: "row", alignItems: "flex-end" },
  dot: { width: 7, height: 7, borderRadius: 4, marginLeft: 2, marginBottom: 9 },
  sub: { fontSize: 16, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center", minHeight: 48 },
  buttonText: { fontSize: 16, fontWeight: "700" },
  google: { borderWidth: 1, opacity: 0.6 },
  note: { fontSize: 12 },
});
