import { StyleSheet, Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { geistFor } from "./fonts";
import { useTheme } from "../theme";
import { useTones } from "./tones";

export type TextVariant = "display" | "title" | "heading" | "body" | "label" | "caption" | "number";
export type TextTone = "default" | "muted" | "danger" | "good" | "warn" | "info";

// Sizes and weights follow the web: page titles 28 semibold with tight tracking.
const VARIANTS: Record<TextVariant, TextStyle> = {
  display: { fontSize: 30, fontWeight: "600", letterSpacing: -0.6, lineHeight: 34 },
  title: { fontSize: 22, fontWeight: "600", letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 15 },
  label: { fontSize: 13, fontWeight: "600" },
  caption: { fontSize: 12 },
  number: { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
};

export type TextProps = RNTextProps & { variant?: TextVariant; tone?: TextTone };

/** App text. Color comes from the theme, size and weight from the variant. */
export function Text({ variant = "body", tone = "default", style, ...rest }: TextProps) {
  const t = useTheme();
  const tones = useTones();
  const color = { default: t.text, muted: t.muted, danger: t.danger, good: tones.good, warn: tones.warn, info: tones.info }[tone];
  const flat: TextStyle = StyleSheet.flatten([VARIANTS[variant], { color }, style]) ?? {};
  // Geist per weight. fontWeight is dropped so Android doesn't fake-bold the face.
  const font = { ...flat, fontFamily: flat.fontFamily ?? geistFor(flat.fontWeight), fontWeight: undefined };
  return <RNText maxFontSizeMultiplier={1.4} {...rest} style={font} />;
}
