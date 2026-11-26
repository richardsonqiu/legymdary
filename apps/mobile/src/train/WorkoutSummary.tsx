import { bestSetId, formatPretty, kg, type WorkoutDto } from "@legymdary/shared";
import { View } from "react-native";
import { useTheme } from "../theme";
import { Text } from "../ui";

export function Stat({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingVertical: 8, alignItems: "center" }}>
      <Text variant="number">{value}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

export const volumeText = (n: number) => `${kg(n)} kg`;

/** A finished (or in-progress) workout: name, date, totals, and every set by exercise. */
export function WorkoutSummary({ workout }: { workout: WorkoutDto }) {
  const t = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <View>
        <Text variant="title">{workout.name}</Text>
        <Text variant="caption" tone="muted">
          {formatPretty(workout.date)}
          {workout.finished ? "" : " · in progress"}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Stat label="exercises" value={String(workout.exerciseCount)} />
        <Stat label="sets" value={String(workout.totalSets)} />
        <Stat label="volume" value={volumeText(workout.totalVolume)} />
      </View>
      {workout.exercises.map((ex) => {
        const best = bestSetId(ex.sets);
        return (
          <View key={ex.workoutExerciseId} style={{ gap: 6 }}>
            <Text variant="heading">{ex.name}</Text>
            <Text variant="caption" tone="muted">
              {ex.muscleGroup} · {ex.equipment}
            </Text>
            {ex.sets.length === 0 ? (
              <Text variant="caption" tone="muted">
                No sets logged
              </Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {ex.sets.map((s) => (
                  <View key={s.id} style={{ borderWidth: 1, borderColor: s.id === best ? t.accent : t.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text variant="caption" tone={s.isWarmup ? "muted" : "default"}>
                      {kg(s.weight)} × {s.reps}
                      {s.isWarmup ? " warmup" : ""}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
