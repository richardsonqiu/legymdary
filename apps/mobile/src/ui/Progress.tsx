import { macroStatus, type MacroKind } from "@legymdary/shared";
import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Text } from "./Text";
import { useTones } from "./tones";

/** Circular progress, 0 to 1. Children are centered inside. */
export function ProgressRing({ value, size = 120, stroke = 11, color, children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const tones = useTones();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tones.track} strokeWidth={stroke} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? tones.good}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={{ maxWidth: size - 2 * stroke - 6, alignItems: "center" }}>{children}</View>
    </View>
  );
}

/** Thin horizontal progress bar, 0 to 1. */
export function Bar({ value, color }: { value: number; color: string }) {
  const tones = useTones();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: tones.track, overflow: "hidden" }}>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: color, width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </View>
  );
}

export function MacroBar({ label, value, target, color, kind }: { label: string; value: number; target?: number | null; color: string; kind: MacroKind }) {
  const tones = useTones();
  const status = target ? macroStatus(kind, value, target) : null;
  const over = status?.tone === "over";
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${label} ${Math.round(value)} grams${target ? ` of ${target}` : ""}${status ? `, ${status.text}` : ""}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="caption" tone="muted">
          <Text variant="caption" tone={over ? "warn" : "default"} style={{ fontWeight: "700" }}>
            {Math.round(value)}
          </Text>
          {target ? ` / ${target}` : ""} g
        </Text>
      </View>
      <Bar value={target ? value / target : 0} color={over ? tones.warn : color} />
      {status ? (
        <Text variant="caption" tone={status.tone === "good" ? "good" : status.tone === "over" ? "warn" : "muted"} style={{ textAlign: "right" }}>
          {status.text}
        </Text>
      ) : null}
    </View>
  );
}
