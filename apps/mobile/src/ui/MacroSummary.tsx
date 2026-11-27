import type { DailyTargets, Macros } from "@legymdary/shared";
import { View } from "react-native";
import { MacroBar, ProgressRing } from "./Progress";
import { Text } from "./Text";
import { useTones } from "./tones";

/** Calorie ring plus protein, carbs and fat bars for one day. Mirrors the web MacroSummary. */
export function MacroSummary({ totals, targets, compact = false }: { totals: Macros; targets: DailyTargets; compact?: boolean }) {
  const tones = useTones();
  const eaten = Math.round(totals.calories);
  const target = targets?.calories ?? null;
  const remaining = target != null ? target - eaten : null;
  const over = target != null && eaten > target;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
      <ProgressRing value={target ? eaten / target : 0} size={compact ? 96 : 124} stroke={compact ? 9 : 11} color={over ? tones.warn : tones.good}>
        <Text variant={compact ? "heading" : "title"} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.15} style={{ fontVariant: ["tabular-nums"] }}>
          {(remaining != null ? Math.abs(remaining) : eaten).toLocaleString("en-US")}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.1} style={{ textTransform: "uppercase" }}>
          {remaining == null ? "kcal eaten" : over ? "kcal over" : "kcal left"}
        </Text>
      </ProgressRing>
      <View style={{ flex: 1, gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="label" tone="muted">
            Eaten
          </Text>
          <Text variant="label" tone="muted">
            <Text variant="label" style={{ fontWeight: "700" }}>
              {eaten.toLocaleString("en-US")}
            </Text>
            {target != null ? ` / ${target.toLocaleString("en-US")} kcal` : " kcal"}
          </Text>
        </View>
        <MacroBar label="Protein" value={totals.protein} target={targets?.protein} color={tones.info} kind="protein" />
        <MacroBar label="Carbs" value={totals.carbs} target={targets?.carbs} color={tones.violet} kind="limit" />
        <MacroBar label="Fat" value={totals.fat} target={targets?.fat} color={tones.rose} kind="limit" />
      </View>
    </View>
  );
}
