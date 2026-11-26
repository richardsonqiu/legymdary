import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

/** One row: optional leading element, title and subtitle, optional trailing element. Tappable when onPress is set. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();
  const body = (
    <>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" numberOfLines={1} style={{ fontWeight: "600" }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  );
  const style = { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, borderRadius: 14 } as const;
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title} onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.7 }]}>
      {body}
    </Pressable>
  );
}
