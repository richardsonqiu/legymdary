import { BODY_METRICS, BODY_RANGES, addDaysStr, bodyStatPoints, daysBetween, formatMedium, formatPretty, kg, pointsDelta, recentWeightTrend, type BodyMetric, type BodyStatDto } from "@legymdary/shared";
import { useState } from "react";
import { View } from "react-native";
import { useAuth } from "../auth";
import { invalidateBody } from "../api/progress";
import { useMutation } from "../api/hooks";
import { Button, Card, LineChart, ListRow, Segmented, Text, TextField, confirm, useToast } from "../ui";

/** Log a weigh-in. Blank fields are skipped; one entry per day replaces the old one, like the web form. */
export function WeighInForm({ latest, today }: { latest: BodyStatDto | null; today: string }) {
  const { api } = useAuth();
  const { run, busy } = useMutation();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
  const vals = { weight: num(weight), waist: num(waist), bodyFat: num(bodyFat) };
  const bad = Object.values(vals).some((v) => v != null && !Number.isFinite(v));
  const empty = Object.values(vals).every((v) => v == null);
  const ph = (v: number | null | undefined) => (v != null ? kg(v) : "");

  const save = async () => {
    const ok = await run("log", () => api.logBodyStat({ date, ...vals }), "Couldn't save");
    if (!ok) return;
    invalidateBody();
    setWeight("");
    setWaist("");
    setBodyFat("");
    toast.show("Saved");
  };

  return (
    <Card>
      {toast.node}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Button title="‹" accessibilityLabel="Previous day" variant="ghost" small onPress={() => setDate(addDaysStr(date, -1))} />
        <Text variant="heading">{date === today ? "Today" : formatPretty(date)}</Text>
        <Button title="›" accessibilityLabel="Next day" variant="ghost" small disabled={date >= today} onPress={() => setDate(addDaysStr(date, 1))} />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <TextField label="Weight kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={ph(latest?.weight)} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Waist cm" value={waist} onChangeText={setWaist} keyboardType="decimal-pad" placeholder={ph(latest?.waist)} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Body fat %" value={bodyFat} onChangeText={setBodyFat} keyboardType="decimal-pad" placeholder={ph(latest?.bodyFat)} />
        </View>
      </View>
      <Button title="Save entry" onPress={() => void save()} loading={busy === "log"} disabled={empty || bad} />
      <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
        Leave a field blank to skip it. One entry per day.
      </Text>
    </Card>
  );
}

/** Weight, waist or body fat over time with the weekly weight trend. */
export function BodyTrend({ stats, today }: { stats: BodyStatDto[]; today: string }) {
  const [metric, setMetric] = useState<BodyMetric>("weight");
  const [range, setRange] = useState("90");
  const meta = BODY_METRICS.find((m) => m.value === metric)!;
  const points = bodyStatPoints(stats, metric, Number(range), today);
  const last = points[points.length - 1]?.value;
  const delta = pointsDelta(points);
  const weekly = metric === "weight" ? recentWeightTrend(bodyStatPoints(stats, "weight", 0, today).map((p) => ({ date: p.date, weight: p.value })), today) : null;
  const first = points[0]?.date;
  return (
    <Card>
      <Segmented options={BODY_METRICS.map((m) => ({ value: m.value, label: m.label }))} value={metric} onChange={setMetric} />
      <Segmented options={BODY_RANGES.map((r) => ({ value: String(r.value), label: r.label }))} value={range} onChange={setRange} />
      {last != null ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <Text variant="title">
            {kg(last)} {meta.unit}
          </Text>
          {delta != null && delta !== 0 ? (
            <Text variant="caption" tone="muted">
              {delta > 0 ? "+" : ""}
              {kg(delta)} {meta.unit} over range
            </Text>
          ) : null}
        </View>
      ) : null}
      {points.length === 0 ? (
        <Text tone="muted" style={{ textAlign: "center", paddingVertical: 24 }}>
          No {meta.label.toLowerCase()} data in this range.
        </Text>
      ) : (
        <>
          <LineChart points={points.map((p) => ({ x: daysBetween(first!, p.date), y: p.value }))} unit={` ${meta.unit}`} accessibilityLabel={`${meta.label} chart, latest ${kg(last)} ${meta.unit}`} />
          <Text variant="caption" tone="muted">
            {formatMedium(first!)} to {formatMedium(points[points.length - 1].date)}
          </Text>
        </>
      )}
      {weekly != null ? (
        <Text variant="caption" tone="muted">
          Last 4 weeks: {weekly > 0 ? "+" : ""}
          {kg(weekly)} kg per week
        </Text>
      ) : null}
    </Card>
  );
}

const sourceLabel = (s: string) => (s === "manual" ? "You" : s === "health_connect" ? "Health Connect" : s === "apple" ? "Apple Health" : s === "garmin" ? "Garmin" : s === "inbody" ? "InBody" : s);

/** Newest first, with delete after a confirm. */
export function WeighInList({ stats }: { stats: BodyStatDto[] }) {
  const { api } = useAuth();
  const { run, busy } = useMutation();
  const [all, setAll] = useState(false);
  const rows = [...stats].reverse();
  const shown = all ? rows : rows.slice(0, 10);

  const remove = async (s: BodyStatDto) => {
    if (!(await confirm({ title: `Delete the ${formatPretty(s.date)} entry?`, message: "This can't be undone.", confirmText: "Delete", destructive: true }))) return;
    if (await run(`d${s.id}`, () => api.deleteBodyStat(s.id), "Couldn't delete")) invalidateBody();
  };

  return (
    <View style={{ gap: 8 }}>
      {shown.map((s) => {
        const parts = [s.weight != null ? `${kg(s.weight)} kg` : null, s.waist != null ? `${kg(s.waist)} cm waist` : null, s.bodyFat != null ? `${kg(s.bodyFat)}% fat` : null].filter(Boolean);
        return (
          <ListRow
            key={s.id}
            title={parts.join(" · ") || "Empty entry"}
            subtitle={`${formatMedium(s.date)} · ${sourceLabel(s.source)}`}
            trailing={<Button title="Delete" accessibilityLabel={`Delete entry from ${formatMedium(s.date)}`} variant="ghost" small loading={busy === `d${s.id}`} onPress={() => void remove(s)} />}
          />
        );
      })}
      {rows.length > 10 ? <Button title={all ? "Show fewer" : `Show all ${rows.length}`} variant="secondary" small onPress={() => setAll(!all)} /> : null}
    </View>
  );
}
