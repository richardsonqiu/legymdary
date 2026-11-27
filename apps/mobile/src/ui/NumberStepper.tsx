import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "./Text";

const round = (n: number) => Math.round(n * 100) / 100;

/** A number with a unit and -/+ buttons (sets, reps, weight). The number can also be typed. */
export function NumberStepper({
  label,
  value,
  onChange,
  unit,
  step = 1,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  const t = useTheme();
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const clamp = (n: number) => round(Math.min(max ?? Infinity, Math.max(min, n)));
  const btn = (sign: 1 | -1) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sign > 0 ? "Increase" : "Decrease"} ${label}`}
      disabled={sign > 0 ? max != null && value >= max : value <= min}
      onPress={() => onChange(clamp(value + sign * step))}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: t.controlBorder, alignItems: "center", justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
    >
      <Text variant="heading">{sign > 0 ? "+" : "−"}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 4 }}>
      <Text variant="caption" style={{ fontWeight: "500", textTransform: "uppercase", letterSpacing: 0.3, color: t.muted2 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {btn(-1)}
        <TextInput
          accessibilityLabel={`${label}${unit ? ` in ${unit}` : ""}`}
          keyboardType="decimal-pad"
          value={text}
          onChangeText={setText}
          onEndEditing={() => {
            const n = Number(text.replace(",", "."));
            if (Number.isFinite(n)) {
              const c = clamp(n);
              setText(String(c));
              onChange(c);
            }
            else setText(String(value));
          }}
          style={{ color: t.text, borderColor: t.controlBorder, borderWidth: 1, borderRadius: 12, minHeight: 44, minWidth: 72, textAlign: "center", fontSize: 16, fontWeight: "700", backgroundColor: t.page }}
        />
        {btn(1)}
        {unit ? (
          <Text variant="label" tone="muted">
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
