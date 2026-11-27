import type { ReactNode } from "react";
import { ImageBackground, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { Fade, PHOTOS, PhotoBanner, type PhotoName } from "./Photo";
import { Text } from "./Text";

/** Scrolling page with a header and optional pull-to-refresh. Use for every tab. */
export function Screen({
  title,
  eyebrow,
  right,
  children,
  onRefresh,
  refreshing = false,
  topInset = true,
  photo,
  subtitle,
  header,
  backdrop,
}: {
  /** A photo behind the top of the page that fades into it (Home). */
  backdrop?: PhotoName;
  /** Show the title on a photo banner, like the web page headers. */
  photo?: PhotoName;
  subtitle?: string;
  /** Replace the title row entirely (Home). */
  header?: ReactNode;
  title?: string;
  eyebrow?: string;
  right?: ReactNode;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** false when a native header already covers the status bar. */
  topInset?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.page }}
      contentContainerStyle={{ paddingTop: (topInset ? insets.top : 0) + 24, paddingHorizontal: 16, paddingBottom: 40, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} /> : undefined}
    >
      {backdrop ? (
        <ImageBackground
          source={PHOTOS[backdrop]}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          // Same photo in both themes; only the overlay changes (like the web .home-backdrop).
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 520 + (topInset ? insets.top : 0) }}
        >
          <Fade id="home-backdrop" from={t.dark ? "rgba(25,25,25,0.35)" : "rgba(245,245,240,0.35)"} to={t.page} stops={[0.15, 1]} />
        </ImageBackground>
      ) : null}
      {header ? (
        header
      ) : photo && title ? (
        <PhotoBanner photo={photo} eyebrow={eyebrow} title={title} subtitle={subtitle} right={right} />
      ) : title || right ? (
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1 }}>
            {eyebrow ? (
              <Text variant="caption" tone="muted" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                {eyebrow}
              </Text>
            ) : null}
            {title ? (
              <Text variant="display" accessibilityRole="header">
                {title}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </ScrollView>
  );
}
