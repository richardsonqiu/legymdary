import { addDaysStr, daysBetween, formatPretty, kg, type InsightsResponse } from "@legymdary/shared";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useRefreshAll } from "../../src/api/hooks";
import { useInsights } from "../../src/api/progress";
import { Button, Card, IconButton, EmptyState, LevelBar, LineChart, Pill, QueryBoundary, Screen, Section, SkeletonRows, StaleBanner, Text, TickBar, toneWord, useScoreColor } from "../../src/ui";

const n0 = (v: number | null | undefined, unit = "") => (v == null ? "-" : `${Math.round(v).toLocaleString("en-US")}${unit}`);

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
      <Text tone="muted" style={{ flexShrink: 1 }}>
        {label}
      </Text>
      <View style={{ alignItems: "flex-end", flexShrink: 1 }}>
        <Text style={{ fontWeight: "600" }}>{value}</Text>
        {sub ? (
          <Text variant="caption" tone="muted">
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Trend({ title, series, pick, unit }: { title: string; series: InsightsResponse["series"]; pick: (p: InsightsResponse["series"][number]) => number | null; unit: string }) {
  const pts = series.flatMap((p) => (pick(p) != null ? [{ x: daysBetween(series[0].date, p.date), y: pick(p) as number }] : []));
  if (pts.length < 2) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text variant="label">{title}</Text>
      <LineChart points={pts} height={160} unit={unit} xLabel={(x) => formatPretty(addDaysStr(series[0].date, x))} accessibilityLabel={`${title}, last 30 days, latest ${pts[pts.length - 1].y}${unit}`} />
    </View>
  );
}

export default function Insights() {
  const scoreColor = useScoreColor();
  const [picked, setPicked] = useState<string | null>(null);
  const q = useInsights(picked);
  const all = useRefreshAll([q]);
  const d = q.data;
  // The picked day, or the data's day while following the latest. Keeps the navigator on screen while a day loads or fails.
  const shown = picked ?? d?.date ?? null;

  return (
    <Screen title="Insights" eyebrow="Recovery" photo="sleep" subtitle="Sleep and training vs your usual" onRefresh={all.refresh} refreshing={all.refreshing}>
      {q.hasData ? <StaleBanner error={q.error} onRetry={() => void q.refresh()} /> : null}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <IconButton icon="chevronLeft" label="Previous day" disabled={!shown} onPress={() => shown && setPicked(addDaysStr(shown, -1))} />
        <Pressable accessibilityRole="button" accessibilityLabel="Jump to the latest day" onPress={() => setPicked(null)} style={{ minHeight: 44, justifyContent: "center" }}>
          <Text variant="heading">{shown ? formatPretty(shown) : "Latest"}</Text>
        </Pressable>
        <IconButton icon="chevronRight" label="Next day" disabled={!shown || (d != null && d.date >= d.latest)} onPress={() => shown && setPicked(addDaysStr(shown, 1) >= (d?.latest ?? "9999") ? null : addDaysStr(shown, 1))} />
      </View>

      {q.loading ? <SkeletonRows count={4} height={96} /> : null}
      <QueryBoundary loading={false} error={q.error} hasData={q.hasData} onRetry={() => void q.refresh()}>
        {d ? (
          <>
            {!d.hasWearableData ? <EmptyState icon="insights" title="No watch data yet" description="Connect Garmin, Oura or Apple Health in the web app to unlock readiness, sleep and recovery." /> : null}

            {d.readiness ? (
              <Section title="Readiness">
                <Card style={{ borderRadius: 28, padding: 20 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                      <Text style={{ fontSize: 56, fontWeight: "600", letterSpacing: -1.5, lineHeight: 60, fontVariant: ["tabular-nums"] }}>{d.readiness.score}</Text>
                      <Text style={{ fontSize: 18 }} tone="muted">
                        /100
                      </Text>
                    </View>
                    <Pill>{toneWord(d.readiness.score)}</Pill>
                  </View>
                  <TickBar value={d.readiness.score} />
                  <Text variant="heading">{d.readiness.label}</Text>
                  <Text variant="caption" tone="muted" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                    {d.readiness.confidence} confidence
                  </Text>
                </Card>
                <Card>
                  {d.readiness.contributors.map((c, i) => (
                    <View key={`${c.label}-${i}`} style={{ gap: 6 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                        <Text style={{ flexShrink: 1 }}>{c.label}</Text>
                        <Text style={{ fontWeight: "600", color: scoreColor(c.score) }}>{toneWord(c.score)}</Text>
                      </View>
                      <Text variant="caption" tone="muted">
                        {c.detail}
                      </Text>
                      <LevelBar value={c.score} />
                    </View>
                  ))}
                </Card>
              </Section>
            ) : null}

            {d.flags.length > 0 ? (
              <Section title="Heads up">
                <Card>
                  {d.flags.map((f, i) => (
                    <Text key={`${f.text}-${i}`} tone={f.level === "warn" ? "warn" : "default"}>
                      {f.text}
                    </Text>
                  ))}
                </Card>
              </Section>
            ) : null}

            {d.sleep ? (
              <Section title="Last night">
                <Card>
                  {d.sleep.headline ? <Text variant="heading">{d.sleep.headline}</Text> : null}
                  <Row label="Slept" value={d.sleep.hours != null ? `${kg(d.sleep.hours)} h` : "-"} sub={`Need ${kg(d.sleep.needHours)} h`} />
                  {d.sleep.score != null ? <Row label="Sleep score" value={String(d.sleep.score)} /> : null}
                  {d.sleep.bedtime || d.sleep.wake ? <Row label="Bed to wake" value={`${d.sleep.bedtime ?? "-"} to ${d.sleep.wake ?? "-"}`} /> : null}
                  {d.sleep.hrv != null ? <Row label="HRV" value={`${Math.round(d.sleep.hrv)} ms`} sub={d.sleep.hrvUsual != null ? `Usual ${Math.round(d.sleep.hrvUsual)} ms` : undefined} /> : null}
                  {d.sleep.restingHr != null ? <Row label="Resting heart rate" value={`${Math.round(d.sleep.restingHr)} bpm`} sub={d.sleep.restingHrUsual != null ? `Usual ${Math.round(d.sleep.restingHrUsual)} bpm` : undefined} /> : null}
                  {d.sleep.bodyBatteryAtWake != null ? <Row label="Body Battery at wake" value={String(d.sleep.bodyBatteryAtWake)} /> : null}
                  {d.sleepDebtHours != null && d.sleepDebtHours > 0 ? <Row label="Sleep debt" value={`${kg(d.sleepDebtHours)} h`} /> : null}
                </Card>
              </Section>
            ) : null}

            <Section title="Yesterday">
              <Card>
                <Row label="Eaten" value={n0(d.yesterday.eatenKcal, " kcal")} sub={`${d.yesterday.meals} meal${d.yesterday.meals === 1 ? "" : "s"}${d.yesterday.skippedMeals ? `, ${d.yesterday.skippedMeals} skipped` : ""}${d.yesterday.fullyLogged ? "" : " (not fully logged)"}`} />
                <Row label="Protein / carbs / fat" value={`${d.yesterday.protein} / ${d.yesterday.carbs} / ${d.yesterday.fat} g`} />
                {d.yesterday.burnedKcal != null ? <Row label="Burned" value={n0(d.yesterday.burnedKcal, " kcal")} sub={d.yesterday.netKcal != null ? `Net ${d.yesterday.netKcal > 0 ? "+" : ""}${n0(d.yesterday.netKcal)} kcal` : undefined} /> : null}
                <Row label="Strain" value={String(Math.round(d.yesterday.strain))} />
                {d.yesterday.steps != null ? <Row label="Steps" value={n0(d.yesterday.steps)} /> : null}
                {d.yesterday.strengthSets > 0 ? <Row label="Strength sets" value={String(d.yesterday.strengthSets)} /> : null}
              </Card>
            </Section>

            {d.energy7d.fullyLoggedDays > 0 ? (
              <Section title="Energy, last 7 days">
                <Card>
                  <Row label="Fully logged days" value={String(d.energy7d.fullyLoggedDays)} />
                  {d.energy7d.avgNetKcal != null ? <Row label="Average net" value={`${d.energy7d.avgNetKcal > 0 ? "+" : ""}${n0(d.energy7d.avgNetKcal)} kcal a day`} /> : null}
                  {d.energy7d.impliedKgPerWeek != null ? <Row label="That pace is about" value={`${d.energy7d.impliedKgPerWeek > 0 ? "+" : ""}${kg(d.energy7d.impliedKgPerWeek)} kg a week`} /> : null}
                </Card>
              </Section>
            ) : null}

            {d.patterns.length > 0 ? (
              <Section title="Your patterns">
                <Card>
                  {d.patterns.map((p, i) => (
                    <Text key={`${p}-${i}`}>{p}</Text>
                  ))}
                </Card>
              </Section>
            ) : null}

            <Section title="30-day trends">
              <Card>
                <Trend title="Readiness" series={d.series} pick={(p) => p.readiness} unit="" />
                <Trend title="HRV" series={d.series} pick={(p) => p.hrv} unit=" ms" />
                <Trend title="Sleep hours" series={d.series} pick={(p) => p.sleepHours} unit=" h" />
                <Trend title="Calories eaten" series={d.series} pick={(p) => p.eaten} unit=" kcal" />
              </Card>
            </Section>

            <Text variant="caption" tone="muted" style={{ textAlign: "center" }}>
              Based on {d.coverage.sleepDays} nights of sleep, {d.coverage.hrvDays} of HRV and {d.coverage.loggedDays} fully logged food days in the last 4 months.
            </Text>
          </>
        ) : null}
      </QueryBoundary>
    </Screen>
  );
}
