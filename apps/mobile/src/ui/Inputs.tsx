import { useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

export function TextField({ label, style, onFocus, onBlur, ...rest }: TextInputProps & { label?: string }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="caption" style={{ fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.3, color: t.muted2 }}>
          {label}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        // Web inputClass: placeholder zinc-600, bg zinc-950/60, border zinc-700, focus border teal-400.
        // shortcut: no focus ring (web adds a 25% teal ring), border colour only; add a ring if it reads too faint on device.
        placeholderTextColor={t.dark ? "#6f6f6b" : "#8a8a85"}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            color: t.text,
            borderColor: focused ? (t.dark ? "#cdc75e" : "#8a851f") : t.controlBorder,
            borderWidth: 1,
            borderRadius: 12,
            paddingHorizontal: 14,
            minHeight: 48,
            fontSize: 16,
            fontFamily: "Geist-Regular",
            backgroundColor: t.dark ? "rgba(25,25,25,0.6)" : "rgba(245,245,240,0.6)",
          },
          style,
        ]}
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
            style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: 20, borderWidth: 1, borderColor: on ? t.accent : t.controlBorder, backgroundColor: on ? t.accent : "transparent" }}
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
