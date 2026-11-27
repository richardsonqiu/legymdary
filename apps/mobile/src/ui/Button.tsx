import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  small,
  accessibilityLabel,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  small?: boolean;
  /** Read by screen readers instead of the title (for symbol-only buttons). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const off = disabled || loading;
  const look = {
    primary: { bg: t.accent, fg: t.onAccent, border: t.accent },
    secondary: { bg: "transparent", fg: t.text, border: t.border },
    ghost: { bg: "transparent", fg: t.text, border: "transparent" },
    danger: { bg: "transparent", fg: t.danger, border: t.border },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: look.bg,
          borderColor: look.border,
          borderWidth: 1,
          borderRadius: 12,
          minHeight: small ? 44 : 48,
          paddingHorizontal: small ? 14 : 20,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          opacity: off ? 0.5 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={look.fg} /> : icon ? <View>{icon}</View> : null}
      <Text variant="label" style={{ color: look.fg, fontSize: small ? 14 : 16, fontWeight: "700" }}>
        {title}
      </Text>
    </Pressable>
  );
}
