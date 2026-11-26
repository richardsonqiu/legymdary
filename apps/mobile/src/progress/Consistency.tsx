import { WEEKLY_TARGET, addDaysStr, isActiveDay, isLoggedDay, startOfWeekStr, type ConsistencyResponse } from "@legymdary/shared";
import { View } from "react-native";
import { Card, Text, useTones } from "../ui";

const LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function Dot({ on, future, label, color }: { on: boolean; future: boolean; label: string; color: string }) {
  const tones = useTones();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${future ? "upcoming" : on ? "done" : "not yet"}`}
      style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: on && !future ? color : "transparent", borderWidth: on && !future ? 0 : 1, borderColor: tones.track, borderStyle: future ? "dashed" : "solid" }}
    />
  );
}

/** This week's exercise and food days plus both streaks, from /stats/consistency. Mirrors the web StreaksCard. */
export function ConsistencyCard({ data, today }: { data: ConsistencyResponse; today: string }) {
  const tones = useTones();
  const byDate = new Map(data.days.map((d) => [d.date, d]));
  const start = startOfWeekStr(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysStr(start, i);
    return { date, active: isActiveDay(byDate.get(date)), logged: isLoggedDay(byDate.get(date)), future: date > today };
  });
  const { weekStreak: ws, foodStreak: fs } = data;
  const left = Math.max(0, WEEKLY_TARGET - ws.thisWeek);
  const row = (title: string, key: "active" | "logged", color: string) => (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <Text variant="label" style={{ width: 72 }}>
        {title}
      </Text>
      <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between" }}>
        {week.map((d, i) => (
          <Dot key={d.date} on={d[key]} future={d.future} label={`${title} ${LETTERS[i]}`} color={color} />
        ))}
      </View>
    </View>
  );
  return (
    <Card>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="heading">This week</Text>
        <Text tone={left === 0 ? "good" : "muted"}>{left === 0 ? `${ws.thisWeek} workouts, goal hit` : `${ws.thisWeek} of ${WEEKLY_TARGET} workouts`}</Text>
      </View>
      <View style={{ flexDirection: "row", paddingLeft: 72 }}>
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between" }}>
          {LETTERS.map((l, i) => (
            <Text key={i} variant="caption" tone="muted" style={{ width: 24, textAlign: "center" }}>
              {l}
            </Text>
          ))}
        </View>
      </View>
      {row("Exercise", "active", tones.good)}
      {row("Food", "logged", tones.info)}
      <Text tone="muted">
        {ws.current} week{ws.current === 1 ? "" : "s"} training streak (best {ws.longest})
      </Text>
      <Text tone="muted">
        {fs.current} day{fs.current === 1 ? "" : "s"} logging food (best {fs.longest})
      </Text>
    </Card>
  );
}
