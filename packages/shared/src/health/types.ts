/** Plain words for the health record types the phones can name (Health Connect record types and HealthKit identifiers). */
const LABELS: Record<string, string> = {
  Steps: "Steps",
  ActiveCaloriesBurned: "Active calories",
  BasalMetabolicRate: "Resting calories",
  RestingHeartRate: "Resting heart rate",
  SleepSession: "Sleep",
  Weight: "Weight",
  BodyFat: "Body fat",
  ExerciseSession: "Workouts",
  Distance: "Distance",
};

export const healthTypeLabel = (recordType: string): string => LABELS[recordType] ?? recordType;

/**
 * Health Connect aggregates return a computed default (for example a basal rate from the user's profile) for a day with no records.
 * A day has real data only when at least one app wrote to it, which `dataOrigins` lists.
 */
export const hasRealData = (result: { dataOrigins?: readonly string[] } | null | undefined): boolean => (result?.dataOrigins?.length ?? 0) > 0;
