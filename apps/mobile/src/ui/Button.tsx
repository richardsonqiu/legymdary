import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { Icon, type IconName } from "./Icons";
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
    secondary: { bg: t.card, fg: t.text, border: t.controlBorder },
    ghost: { bg: "transparent", fg: t.text, border: "transparent" },
    danger: { bg: t.card, fg: t.muted, border: t.controlBorder },
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
          borderRadius: 999,
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


/** A 44pt icon-only ghost button (day arrows, close, delete). Same line icons as the web. */
export function IconButton({ icon, label, onPress, disabled, loading }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  const t = useTheme();
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", opacity: off ? 0.5 : pressed ? 0.6 : 1 })}
    >
      {loading ? <ActivityIndicator color={t.muted} /> : <Icon name={icon} size={20} color={t.text} />}
    </Pressable>
  );
}