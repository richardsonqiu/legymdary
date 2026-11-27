import { useState } from "react";
import { View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useTheme } from "../theme";
import { Text } from "./Text";

export type ChartPoint = { x: number; y: number };

const TICKS = 4;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

/**
 * A line chart for one series (weight, volume), drawn like the web charts (components/charts/common.tsx):
 * text-colour line, track-colour grid, dimmer axis labels, 220px tall. Touch the chart to read a point.
 * `points` need numeric x (a day number or timestamp) and y. Gaps in x are drawn to scale.
 * shortcut: one series and y axis labels only, no x axis ticks; add them when a chart needs them.
 */
export function LineChart({
  points,
  height = 220,
  color,
  unit = "",
  xLabel,
  accessibilityLabel,
}: {
  points: ChartPoint[];
  height?: number;
  color?: string;
  unit?: string;
  /** Text for a point's x in the readout (a date). */
  xLabel?: (x: number) => string;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const stroke = color ?? t.text;
  const padL = 40;
  const padR = 12;
  const padT = 10;
  const padB = 10;
  const pts = [...points].filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.x - b.x);
  const ys = pts.map((p) => p.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  // A little room above and below, like Recharts' auto domain.
  const span = hi === lo ? Math.max(Math.abs(hi) * 0.1, 1) : (hi - lo) * 0.1;
  const min = lo - span;
  const max = hi + span;
  const xMin = pts[0]?.x ?? 0;
  const xMax = pts[pts.length - 1]?.x ?? 1;
  const iw = w - padL - padR;
  const sx = (x: number) => padL + (xMax === xMin ? iw / 2 : ((x - xMin) / (xMax - xMin)) * iw);
  const sy = (y: number) => padT + (1 - (y - min) / (max - min)) * (height - padT - padB);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const shown = pick != null ? pts[pick] : last;
  const touch = (e: GestureResponderEvent) => {
    if (!pts.length) return;
    const x = e.nativeEvent.locationX;
    let best = 0;
    pts.forEach((p, i) => {
      if (Math.abs(sx(p.x) - x) < Math.abs(sx(pts[best].x) - x)) best = i;
    });
    setPick(best);
  };
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? (last ? `Chart, latest ${last.y}${unit}, low ${lo}${unit}, high ${hi}${unit}` : "Chart, no data")}>
      {shown ? (
        <Text variant="caption" style={{ color: t.muted2, marginBottom: 4 }}>
          {xLabel ? `${xLabel(shown.x)}: ` : ""}
          <Text variant="caption" style={{ color: t.text, fontWeight: "600" }}>
            {fmt(shown.y)}
            {unit}
          </Text>
        </Text>
      ) : null}
      {w > 0 && pts.length > 0 ? (
        <View onStartShouldSetResponder={() => true} onResponderGrant={touch} onResponderMove={touch} onResponderRelease={() => setPick(null)} onResponderTerminate={() => setPick(null)}>
          <Svg width={w} height={height}>
            {Array.from({ length: TICKS }, (_, i) => {
              const v = min + ((max - min) * i) / (TICKS - 1);
              return <Line key={i} x1={padL} x2={w - padR} y1={sy(v)} y2={sy(v)} stroke={t.border} strokeWidth={1} />;
            })}
            {pts.length > 1 ? <Path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
            {pick != null ? <Line x1={sx(pts[pick].x)} x2={sx(pts[pick].x)} y1={padT} y2={height - padB} stroke={t.controlBorder} strokeWidth={1} /> : null}
            {shown ? <Circle cx={sx(shown.x)} cy={sy(shown.y)} r={4} fill={stroke} /> : null}
          </Svg>
          {/* Y axis labels sit over the left gutter. */}
          {Array.from({ length: TICKS }, (_, i) => {
            const v = min + ((max - min) * i) / (TICKS - 1);
            return (
              <Text key={i} pointerEvents="none" style={{ position: "absolute", left: 0, width: padL - 6, top: sy(v) - 7, textAlign: "right", fontSize: 11, lineHeight: 14, color: t.muted2 }}>
                {fmt(v)}
              </Text>
            );
          })}
        </View>
      ) : (
        <View style={{ height }} />
      )}
    </View>
  );
}
