import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useFonts } from "expo-font";
import { View } from "react-native";
import { GEIST_FONTS } from "../src/ui/fonts";
import { Button } from "../src/ui/Button";
import { Text } from "../src/ui/Text";
import { AuthProvider, useAuth } from "../src/auth";
import { ThemeProvider, useTheme } from "../src/theme";

void SplashScreen.preventAutoHideAsync();

function Routes() {
  const { ready: authReady, user, offline, retry } = useAuth();
  const theme = useTheme();
  // Keep the splash up until Geist is loaded too, so text never flashes in another font.
  const [fontsLoaded, fontError] = useFonts(GEIST_FONTS);
  const ready = authReady && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  if (offline && !user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
        <StatusBar style={theme.dark ? "light" : "dark"} />
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>Can't reach the server</Text>
        <Text style={{ color: theme.muted, textAlign: "center" }}>Check your connection. You are still signed in.</Text>
        <Button title="Retry" onPress={() => void retry()} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.page } }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes />
      </AuthProvider>
    </ThemeProvider>
  );
}
