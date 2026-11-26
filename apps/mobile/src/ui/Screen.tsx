import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
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
}: {
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
      contentContainerStyle={{ paddingTop: (topInset ? insets.top : 0) + 24, paddingHorizontal: 20, paddingBottom: 40, gap: 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} /> : undefined}
    >
      {title || right ? (
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
