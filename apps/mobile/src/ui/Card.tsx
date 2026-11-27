import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";

export function Card({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const base: ViewStyle = { backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 24, padding: 16, gap: 12 };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.7 }, style]}>
      {children}
    </Pressable>
  );
}
