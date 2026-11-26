import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { Text } from "./Text";
import { useTones } from "./tones";

export type ChartPoint = { x: number; y: number };

/**
 * A line chart for one series (weight, volume). `points` need numeric x (a day number or timestamp) and y.
 * Draws a baseline, min and max labels and a dot at the last point. Gaps in x are drawn to scale.
 * shortcut: one series, no axes or touch; add them when Progress needs them.
 */
export function LineChart({ points, height = 120, color, unit = "", accessibilityLabel }: { points: ChartPoint[]; height?: number; color?: string; unit?: string; accessibilityLabel?: string }) {
  const tones = useTones();
  const [w, setW] = useState(0);
  const stroke = color ?? tones.info;
  const pad = 8;
  const pts = [...points].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
  const ys = pts.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const xMin = pts[0]?.x ?? 0;
  const xMax = pts[pts.length - 1]?.x ?? 1;
  const sx = (x: number) => pad + (xMax === xMin ? (w - 2 * pad) / 2 : ((x - xMin) / (xMax - xMin)) * (w - 2 * pad));
  const sy = (y: number) => pad + (max === min ? (height - 2 * pad) / 2 : (1 - (y - min) / (max - min)) * (height - 2 * pad));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? (last ? `Chart, latest ${last.y}${unit}, low ${min}${unit}, high ${max}${unit}` : "Chart, no data")}>
      {w > 0 && pts.length > 0 ? (
        <Svg width={w} height={height}>
          <Line x1={pad} x2={w - pad} y1={height - pad} y2={height - pad} stroke={tones.track} strokeWidth={1} />
          {pts.length > 1 ? <Path d={d} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" /> : null}
          {last ? <Circle cx={sx(last.x)} cy={sy(last.y)} r={4} fill={stroke} /> : null}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      {pts.length > 0 ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="caption" tone="muted">
            Low {min}
            {unit}
          </Text>
          <Text variant="caption" tone="muted">
            High {max}
            {unit}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
