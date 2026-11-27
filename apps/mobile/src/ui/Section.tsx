import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

/** A heading row with an optional text action on the right ("History ›"). */
export function SectionTitle({ children, action, onAction }: { children: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
      <Text variant="caption" accessibilityRole="header" style={{ flex: 1, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6, color: t.muted2 }}>
        {children}
      </Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text variant="label" tone="muted">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Section({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle action={action} onAction={onAction}>
        {title}
      </SectionTitle>
      {children}
    </View>
  );
}
