import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { useTheme } from "../theme";
import { useTones } from "./tones";

export type TextVariant = "display" | "title" | "heading" | "body" | "label" | "caption" | "number";
export type TextTone = "default" | "muted" | "danger" | "good" | "warn" | "info";

const VARIANTS: Record<TextVariant, TextStyle> = {
  display: { fontSize: 32, fontWeight: "800" },
  title: { fontSize: 22, fontWeight: "700" },
  heading: { fontSize: 17, fontWeight: "700" },
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
  return <RNText maxFontSizeMultiplier={1.4} {...rest} style={[VARIANTS[variant], { color }, style]} />;
}
