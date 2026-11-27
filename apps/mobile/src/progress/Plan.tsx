import { ACTIVITY_LEVELS, addDaysStr, formatMedium, kg, paceOptions, planInputFrom, type GoalsDto, type PlanResponse } from "@legymdary/shared";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useMutation } from "../api/hooks";
import { invalidateBody } from "../api/progress";
import { useAuth } from "../auth";
import { useTheme } from "../theme";
import { Button, Card, Segmented, Sheet, Text, TextField, useToast } from "../ui";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const DIRECTION = { lose: "Fat loss", gain: "Lean gain", maintain: "Maintain" } as const;

/** Daily targets and the goal in one card. */
export function GoalSummary({ data, today, onEdit }: { data: PlanResponse; today: string; onEdit: () => void }) {
  const { plan, weight } = data;
  const eta = plan.weeksToGoal != null ? addDaysStr(today, Math.ceil(plan.weeksToGoal * 7)) : null;
  return (
    <Card>
      <Text variant="heading">{DIRECTION[plan.direction]}</Text>
      {plan.calorieTarget != null ? (
        <>
          <Text variant="number">
            {fmt(plan.calorieTarget)} kcal a day{plan.usingOverride ? " (custom)" : ""}
          </Text>
          <Text tone="muted">
            Protein {plan.protein ?? "-"} g · Carbs {plan.carbs ?? "-"} g · Fat {plan.fat ?? "-"} g
          </Text>
        </>
      ) : (
        <Text tone="muted">Add {plan.missing.join(", ") || "your details"} to get a daily target.</Text>
      )}
      <Text tone="muted">
        {weight != null ? `Now ${kg(weight)} kg` : "No weight yet"}
        {plan.goalWeight != null ? ` · Goal ${kg(plan.goalWeight)} kg` : ""}
        {plan.direction !== "maintain" ? ` · ${kg(plan.weeklyRate)} kg a week` : ""}
      </Text>
      {eta ? <Text tone="muted">Reach it around {formatMedium(plan.targetDate ?? eta)}</Text> : null}
      <Button title="Edit goals" variant="secondary" onPress={onEdit} />
    </Card>
  );
}

/** Three ready-made paces plus a date of your own, and steady vs adaptive targets. Same maths as the web Goal page. */
export function PaceCard({ data, today }: { data: PlanResponse; today: string }) {
  const { api } = useAuth();
  const t = useTheme();
  const { run, busy } = useMutation();
  const toast = useToast();
  const [date, setDate] = useState(data.goals?.targetDate ?? "");
  const { plan, goals } = data;
  const input = planInputFrom(goals, { weight: data.weight, bodyFat: data.bodyFat }, new Date().getFullYear(), plan.tdee != null && plan.maintenanceSource && plan.maintenanceSource !== "formula" ? { kcal: plan.tdee, source: plan.maintenanceSource } : null, today);
  const options = goals ? paceOptions(input) : [];
  const currentRate = goals?.weeklyRate ?? null;
  const selected = goals?.targetDate ? "date" : (options.find((o) => currentRate != null && Math.abs(o.weeklyRate - currentRate) < 0.015)?.key ?? null);

  const apply = async (key: string, body: { weeklyRate: number } | { targetDate: string }) => {
    if (await run(key, () => api.setGoalPace(body), "Couldn't change the pace")) {
      invalidateBody();
      toast.show("Pace updated");
    }
  };
  const setMode = async (mode: "steady" | "adaptive") => {
    if (mode !== data.targetMode && (await run("mode", () => api.setTargetMode({ mode }), "Couldn't change the mode"))) invalidateBody();
  };

  return (
    <Card>
      {toast.node}
      {options.length === 0 ? (
        <Text tone="muted">Set a target weight and your details to pick a pace.</Text>
      ) : (
        <>
          <Text tone="muted">Pick how fast. Each option shows your daily calories and when you would get there.</Text>
          {plan.usingOverride ? (
            <Text variant="caption" tone="warn">
              You set your own calories. Picking a pace switches back to the plan&apos;s calories.
            </Text>
          ) : null}
          {options.map((o) => (
            <Pressable
              key={o.key}
              accessibilityRole="button"
              accessibilityState={{ selected: selected === o.key, busy: busy === o.key }}
              disabled={busy != null}
              onPress={() => void apply(o.key, { weeklyRate: o.weeklyRate })}
              style={{ borderWidth: 1, borderColor: selected === o.key ? t.text : t.border, borderRadius: 14, padding: 12, gap: 2, minHeight: 56 }}
            >
              <Text style={{ fontWeight: "700" }}>
                {o.label} · {kg(o.effectiveRate)} kg a week
              </Text>
              <Text variant="caption" tone="muted">
                {o.calories != null ? `${fmt(o.calories)} kcal a day` : "No calorie target yet"}
                {o.eta ? ` · ${formatMedium(o.eta)}` : ""}
              </Text>
              <Text variant="caption" tone="muted">
                {o.note}
              </Text>
            </Pressable>
          ))}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <TextField label="Or reach it by (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder="2027-03-01" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
            </View>
            <Button title="Set" variant="secondary" loading={busy === "date"} disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)} onPress={() => void apply("date", { targetDate: date })} />
          </View>
        </>
      )}
      <Text variant="label">Daily target</Text>
      <Segmented
        options={[
          { value: "steady", label: "Steady" },
          { value: "adaptive", label: "Adaptive" },
        ]}
        value={data.targetMode}
        onChange={(m) => void setMode(m)}
      />
      <Text variant="caption" tone="muted">
        {data.targetMode === "steady" ? "The same calorie target every day." : "The target moves with your activity."}
      </Text>
    </Card>
  );
}

const numOrNull = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};
const str = (v: number | null | undefined) => (v != null ? String(v) : "");

/** Edit the goal and the details the plan needs. Pace and goal date are set on the pace card, so they are not sent. */
export function GoalsSheet({ visible, goals, onClose }: { visible: boolean; goals: GoalsDto | null; onClose: () => void }) {
  const { api } = useAuth();
  const { run, busy } = useMutation();
  const [targetWeight, setTargetWeight] = useState(str(goals?.targetWeight));
  const [targetBodyFat, setTargetBodyFat] = useState(str(goals?.targetBodyFat));
  const [heightCm, setHeightCm] = useState(str(goals?.heightCm));
  const [birthYear, setBirthYear] = useState(str(goals?.birthYear));
  const [calories, setCalories] = useState(str(goals?.calorieOverride));
  const [sex, setSex] = useState<string>(goals?.sex ?? "");
  const [activity, setActivity] = useState<string>(goals?.activityLevel ?? "");

  const save = async () => {
    const ok = await run(
      "goals",
      () =>
        api.saveGoals({
          sex: sex === "male" || sex === "female" ? sex : null,
          birthYear: numOrNull(birthYear),
          heightCm: numOrNull(heightCm),
          activityLevel: activity || null,
          targetWeight: numOrNull(targetWeight),
          targetBodyFat: numOrNull(targetBodyFat),
          calorieOverride: numOrNull(calories),
        }),
      "Couldn't save goals",
    );
    if (ok) {
      invalidateBody();
      onClose();
    }
  };
  const levels = Object.entries(ACTIVITY_LEVELS);

  return (
    <Sheet visible={visible} title="Goals" onClose={onClose}>
      <View style={{ gap: 12, padding: 16, paddingTop: 4 }}>
        <TextField label="Target weight kg" value={targetWeight} onChangeText={setTargetWeight} keyboardType="decimal-pad" />
        <TextField label="Target body fat % (optional)" value={targetBodyFat} onChangeText={setTargetBodyFat} keyboardType="decimal-pad" />
        <Text variant="label">Sex</Text>
        <Segmented
          options={[
            { value: "", label: "Not set" },
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
          ]}
          value={sex}
          onChange={setSex}
        />
        <TextField label="Birth year" value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" maxLength={4} />
        <TextField label="Height cm" value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" />
        <Text variant="label">Activity</Text>
        {levels.map(([key, l]) => (
          <Button key={key} title={`${l.label} · ${l.hint}`} variant={activity === key ? "primary" : "secondary"} small onPress={() => setActivity(activity === key ? "" : key)} />
        ))}
        <TextField label="Custom calories (leave blank to use the plan)" value={calories} onChangeText={setCalories} keyboardType="number-pad" />
        <Button title="Save goals" onPress={() => void save()} loading={busy === "goals"} />
      </View>
    </Sheet>
  );
}
