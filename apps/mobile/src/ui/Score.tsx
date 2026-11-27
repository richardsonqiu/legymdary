import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../theme";
import { Text } from "./Text";
import { useTones } from "./tones";

/** Same words as the web (components/score/Score.tsx). */
export const toneWord = (score: number | null) =>
  score == null ? "No data" : score >= 85 ? "Optimal" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Pay attention";

/** Accent when good, neutral when fair, amber when low. */
export function useScoreColor() {
  const t = useTheme();
  const tones = useTones();
  return (score: number | null) => (score == null ? t.muted : score >= 75 ? tones.good : score >= 50 ? t.muted : tones.warn);
}

/** Small circular score with a label, the row at the top of Home. */
export function ScoreRing({ value, display, label, onPress }: { value: number | null; display?: string; label: string; onPress?: () => void }) {
  const t = useTheme();
  const tones = useTones();
  const color = useScoreColor();
  const size = 58;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <Pressable onPress={onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={`${label} ${display ?? (value == null ? "no data" : Math.round(value))}`} style={{ alignItems: "center", gap: 6, flex: 1 }}>
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        <Svg width={size} height={size} style={{ position: "absolute" }}>
          <Circle cx={size / 2} cy={size / 2} r={r} fill={t.dark ? "rgba(25,25,25,0.35)" : "rgba(255,255,255,0.5)"} stroke={tones.track} strokeWidth={stroke} />
          {value != null ? (
            <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color(value)} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
          ) : null}
        </Svg>
        <Text numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.15} style={{ fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{display ?? (value == null ? "–" : Math.round(value))}</Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 11, color: t.muted }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 40 thin ticks, filled with the accent up to the value (0 to 100). */
export function TickBar({ value }: { value: number }) {
  const t = useTheme();
  const tones = useTones();
  const n = 40;
  const on = Math.round((Math.max(0, Math.min(100, value)) / 100) * n);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: 26, gap: 3 }} accessible={false}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ flex: 1, borderRadius: 2, height: i % 5 === 0 ? "100%" : "62%", backgroundColor: i < on ? t.accent : tones.track }} />
      ))}
    </View>
  );
}

/** A pill like the web's citron tag ("Fair", "840 kcal"). */
export function Pill({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text style={{ color: t.onAccent, fontSize: 12, fontWeight: "600" }}>{children}</Text>
    </View>
  );
}

/** A small outlined chip with a status dot ("HRV · Pay attention"). */
export function FactorChip({ label, score }: { label: string; score: number }) {
  const t = useTheme();
  const tones = useTones();
  const dot = score >= 75 ? t.accent : score >= 50 ? t.muted : tones.warn;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      <Text style={{ fontSize: 12, color: t.muted }}>{label}</Text>
      <Text style={{ fontSize: 12, fontWeight: "600" }}>{toneWord(score)}</Text>
    </View>
  );
}

/** A level bar with a knob, like the Insights contributor rows on the web. */
export function LevelBar({ value }: { value: number }) {
  const t = useTheme();
  const tones = useTones();
  const color = useScoreColor();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height: 6, justifyContent: "center" }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: tones.track }} />
      <View style={{ position: "absolute", left: 0, width: `${pct}%`, height: 4, borderRadius: 2, backgroundColor: color(value) }} />
      <View style={{ position: "absolute", left: `${pct}%`, marginLeft: -1.5, width: 3, height: 12, borderRadius: 1.5, backgroundColor: t.text }} />
    </View>
  );
}
