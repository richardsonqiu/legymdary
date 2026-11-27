import { ApiClientError } from "@legymdary/shared";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, Text, TextField } from "../src/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { GoogleSignInError, googleSignIn } from "../src/googleSignIn";
import { useTheme } from "../src/theme";

export default function Login() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signInWithGoogle } = useAuth();
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

  async function google() {
    if (busy || !googleSignIn) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await googleSignIn.getIdToken();
      if (idToken) await signInWithGoogle(idToken);
      else setBusy(false); // cancelled: not an error
    } catch (e) {
      setError(
        e instanceof ApiClientError && e.status === 401
          ? "No One Up account is linked to this Google account. Sign in with Google on the website once, then try again."
          : e instanceof GoogleSignInError || e instanceof ApiClientError
            ? e.message
            : "Something went wrong. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: t.page }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 16, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
      >
        {/* Same layout as the web LoginForm: centred column, max-w-sm, form inside a Card. */}
        <View style={{ width: "100%", maxWidth: 384 }}>
          <View style={{ marginBottom: 24, alignItems: "center" }}>
            <View accessible accessibilityLabel="one up" style={s.brand}>
              <Text style={[s.title, { color: t.text }]}>one up</Text>
              {/* Round full stop in the accent colour, like the web wordmark. */}
              <View style={[s.dot, { backgroundColor: t.dark ? "#DED97A" : "#8A851F" }]} />
            </View>
            <Text accessibilityRole="header" style={{ marginTop: 16, fontSize: 24, fontWeight: "600", letterSpacing: -0.4, color: t.text }}>
              Welcome back
            </Text>
            <Text style={{ marginTop: 4, fontSize: 14, color: t.muted2 }}>Sign in to your gym diary.</Text>
          </View>

          <Card style={{ gap: 16 }}>
            {googleSignIn ? (
              <>
                <Button title="Continue with Google" disabled={busy} onPress={google} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
                  <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3, color: t.dark ? "#6f6f6b" : "#8a8a85" }}>or</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
                </View>
              </>
            ) : null}

            <View style={{ gap: 12 }}>
              <TextField
                label="Email"
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
              />
              <TextField
                label="Password"
                placeholder="••••••••"
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={submit}
              />
              {error ? (
                <Text accessibilityRole="alert" style={{ fontSize: 14, color: t.dark ? "#c4c4bf" : "#42423f" }}>
                  {error}
                </Text>
              ) : null}
              <Button title="Sign in" loading={busy} disabled={!email.trim() || !password} onPress={submit} />
            </View>
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  // Same wordmark as the web (text-2xl): Geist Bold, tracking -0.035em, round accent dot (0.22em).
  title: { fontSize: 24, fontWeight: "700", letterSpacing: -0.85 },
  brand: { flexDirection: "row", alignItems: "flex-end", alignSelf: "center" },
  dot: { width: 5, height: 5, borderRadius: 3, marginLeft: 2, marginBottom: 7 },
});