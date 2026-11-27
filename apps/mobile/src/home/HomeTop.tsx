import type { HomeScores, TodayResponse } from "@legymdary/shared";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useTheme } from "../theme";
import { Card, FactorChip, Pill, ScoreRing, Text, TickBar, toneWord } from "../ui";

const ADVICE: Record<"push" | "normal" | "easy", string> = {
  push: "Good day for a hard session.",
  normal: "Train as planned.",
  easy: "Go easy today and sleep early.",
};

/** "one up." with the round accent dot, like the web wordmark. */
export function Wordmark({ size = 18 }: { size?: number }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel="one up" style={{ flexDirection: "row", alignItems: "flex-end" }}>
      <Text style={{ fontSize: size, fontWeight: "700", letterSpacing: -0.035 * size }}>one up</Text>
      <View
        style={{
          width: size * 0.22,
          height: size * 0.22,
          borderRadius: size,
          marginLeft: size * 0.07,
          marginBottom: size * 0.28,
          backgroundColor: t.dark ? "#ded97a" : "#8a851f",
        }}
      />
    </View>
  );
}

/** Wordmark, account button and greeting. */
export function HomeHeader({ name, initial, date, onAccount }: { name?: string; initial: string; date: string; onAccount: () => void }) {
  const t = useTheme();
  const h = new Date().getHours();
  const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Wordmark />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Account"
          onPress={onAccount}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: t.dark ? "rgba(34,34,33,0.8)" : "rgba(255,255,255,0.8)",
          }}
        >
          <Text style={{ fontWeight: "600" }}>{initial}</Text>
        </Pressable>
      </View>
      <View>
        <Text accessibilityRole="header" style={{ fontSize: 30, fontWeight: "600", letterSpacing: -0.6, lineHeight: 34 }}>
          {greet}
          {name ? `, ${name}.` : "."}
        </Text>
        <Text tone="muted" style={{ marginTop: 4 }}>
          {date}
        </Text>
      </View>
    </View>
  );
}

/** Rings (Readiness, Sleep, Food, Steps, Battery) and the big card, the same as web Home. */
export function HomeScoresView({ d }: { d: TodayResponse }) {
  const router = useRouter();
  const t = useTheme();
  const s: HomeScores | null | undefined = d.scores;
  const target = d.targets?.calories ? d.targets.calories + d.bonus : null;
  const fuelPct = target ? (d.eaten.calories / target) * 100 : null;
  const steps = s?.steps ?? d.steps;
  const r = s?.readiness ?? null;
  const hero = r ? r.score : fuelPct != null ? Math.min(100, Math.round(fuelPct)) : null;
  const empty = s?.noSleepLastNight
    ? "No sleep recorded last night. Wear your watch or ring to bed for Readiness."
    : s?.source === "sync" || d.wearable
      ? "Shows after your watch or ring syncs a night of sleep."
      : s?.source === "apple_upload"
        ? "Upload a fresh Apple Health export to see last night."
        : "Connect Garmin or Oura, or sync Apple Health or Health Connect, to see your recovery here.";

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row" }}>
        <ScoreRing value={r?.score ?? null} label="Readiness" onPress={() => router.navigate("/insights")} />
        <ScoreRing
          value={s?.sleepScore ?? null}
          display={s?.sleepScore == null && s?.sleepHours != null ? `${s.sleepHours}h` : undefined}
          label="Sleep"
          onPress={() => router.navigate("/insights")}
        />
        <ScoreRing value={fuelPct} display={fuelPct == null ? "–" : `${Math.round(fuelPct)}%`} label="Food" onPress={() => router.navigate("/food")} />
        <ScoreRing
          value={steps != null ? (steps / (s?.stepGoal ?? 8000)) * 100 : null}
          display={steps == null ? "–" : steps >= 10000 ? `${Math.round(steps / 1000)}k` : `${(steps / 1000).toFixed(1)}k`}
          label="Steps"
        />
        <ScoreRing value={s?.battery ?? null} label="Battery" onPress={() => router.navigate("/insights")} />
      </View>

      <Card
        onPress={() => router.navigate(r ? "/insights" : "/food")}
        accessibilityLabel={r ? `Readiness ${r.score} of 100, ${r.label}` : "Today's food"}
        style={{ borderRadius: 28, padding: 20 }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 2, color: t.muted, textTransform: "uppercase" }}>
              {r ? "Readiness" : "Today's food"}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 6 }}>
              <Text style={{ fontSize: 56, fontWeight: "600", letterSpacing: -1.5, lineHeight: 60, fontVariant: ["tabular-nums"] }}>{hero ?? "–"}</Text>
              {hero != null ? <Text style={{ fontSize: 18, color: t.muted }}>{r ? "/100" : "%"}</Text> : null}
            </View>
          </View>
          <Pill>{r ? toneWord(r.score) : hero == null ? "No plan" : `${Math.round(d.eaten.calories).toLocaleString("en-US")} kcal`}</Pill>
        </View>
        <TickBar value={hero ?? 0} />
        <View style={{ gap: 2 }}>
          <Text variant="heading">{r ? r.label : target ? `of ${target.toLocaleString("en-US")} kcal today` : "Set a goal to get a target"}</Text>
          {r ? (
            r.label !== ADVICE[r.band].replace(/\.$/, "") ? <Text tone="muted">{ADVICE[r.band]}</Text> : null
          ) : (
            <Text tone="muted">{empty}</Text>
          )}
        </View>
        {r && r.factors.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {r.factors.map((f) => (
              <FactorChip key={f.label} label={f.label} score={f.score} />
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}
