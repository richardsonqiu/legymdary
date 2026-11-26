import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export function TextField({ label, style, ...rest }: TextInputProps & { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      {label ? (
        <Text variant="caption" tone="muted">
          {label}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        {...rest}
        style={[{ color: t.text, borderColor: t.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 48, fontSize: 16, backgroundColor: t.page }, style]}
      />
    </View>
  );
}

/** A row of single-choice pills (meal type, filters). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            onPress={() => onChange(o.value)}
            style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: 20, borderWidth: 1, borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : "transparent" }}
          >
            <Text variant="label" style={{ color: on ? t.onAccent : t.text }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
