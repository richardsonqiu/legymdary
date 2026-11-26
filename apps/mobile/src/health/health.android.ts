import { emptyRawHealth, type HealthSample, type RawHealth, type RawSleepSegment, type RawWorkout, type SleepStageName } from "@legymdary/shared";
import type { ReadRecordsResult, RecordType } from "react-native-health-connect";
import { dayBounds, makeSync } from "./sync";
import type { HealthApi } from "./types";

/** Health Connect through react-native-health-connect. Mapping to the server batch is in @legymdary/shared. */
type HC = typeof import("react-native-health-connect");
type Permission = Parameters<HC["requestPermission"]>[0][number];
type Range = { operator: "between"; startTime: string; endTime: string };

/** Loaded on first use so a build without the native module (Expo Go) still opens; the screen then says "not available". */
function hc(): HC | null {
  try {
    return require("react-native-health-connect") as HC;
  } catch {
    return null;
  }
}

const RECORDS = ["Steps", "ActiveCaloriesBurned", "BasalMetabolicRate", "RestingHeartRate", "SleepSession", "Weight", "BodyFat", "ExerciseSession", "Distance"] as const;
const PERMISSIONS: Permission[] = RECORDS.map((recordType) => ({ accessType: "read", recordType }));

export const healthName = "Health Connect";

export const isAvailable: HealthApi["isAvailable"] = async () => {
  const m = hc();
  if (!m) return false;
  try {
    return (await m.getSdkStatus()) === m.SdkAvailabilityStatus.SDK_AVAILABLE && (await m.initialize());
  } catch {
    return false;
  }
};

/** Record types the user has allowed us to read. */
async function grantedTypes(m: HC): Promise<Set<string>> {
  const granted = await m.getGrantedPermissions();
  return new Set(granted.filter((p) => p.accessType === "read").map((p) => p.recordType));
}

export const getPermissionState: HealthApi["getPermissionState"] = async () => {
  const m = hc();
  if (!m) return "unavailable";
  try {
    // Health Connect is missing (Android 13 and older) or needs an update: send the user to the store.
    if ((await m.getSdkStatus()) !== m.SdkAvailabilityStatus.SDK_AVAILABLE) return "needs_install";
  } catch {
    return "unavailable";
  }
  if (!(await isAvailable())) return "unavailable";
  return (await grantedTypes(m)).size > 0 ? "granted" : "needed";
};

/** Requested types that are switched off in Health Connect (empty when all 9 are allowed). */
export const missingPermissions: HealthApi["missingPermissions"] = async () => {
  const m = hc();
  if (!m || !(await isAvailable())) return [];
  const have = await grantedTypes(m);
  return RECORDS.filter((r) => !have.has(r));
};
export const requestPermissions: HealthApi["requestPermissions"] = async () => {
  if (!(await isAvailable())) return false;
  const granted = await hc()!.requestPermission(PERMISSIONS);
  return granted.some((p) => p.accessType === "read");
};

/** Every page of a record type in the range. */
async function all<T extends RecordType>(m: HC, type: T, range: Range): Promise<ReadRecordsResult<T>["records"]> {
  const out: ReadRecordsResult<T>["records"] = [];
  let pageToken: string | undefined;
  do {
    const page = await m.readRecords(type, { timeRangeFilter: range, pageSize: 1000, pageToken });
    out.push(...page.records);
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}
/** Health Connect SleepStageType values. */
const STAGE: Record<number, SleepStageName> = { 0: "asleep", 1: "awake", 2: "asleep", 4: "light", 5: "deep", 6: "rem", 7: "awake" };
// Apple workout activity names for the types the app treats specially; any other type is its own name in CamelCase.
const ACTIVITY: Record<string, string> = {
  STRENGTH_TRAINING: "TraditionalStrengthTraining",
  WEIGHTLIFTING: "TraditionalStrengthTraining",
  RUNNING_TREADMILL: "Running",
  BIKING: "Cycling",
  BIKING_STATIONARY: "Cycling",
  SWIMMING_POOL: "Swimming",
  SWIMMING_OPEN_WATER: "Swimming",
  OTHER_WORKOUT: "Other",
};
const camel = (s: string) => s.toLowerCase().replace(/(^|_)(\w)/g, (_, __, c: string) => c.toUpperCase());

export const read: HealthApi["read"] = async (from, to) => {
  const m = hc();
  if (!m || !(await isAvailable())) throw new Error("Health Connect is not available on this device.");
  const { start, end } = dayBounds(from, to);
  const range: Range = { operator: "between", startTime: start.toISOString(), endTime: end.toISOString() };
  const perDay = async <T extends "Steps" | "ActiveCaloriesBurned" | "BasalMetabolicRate">(recordType: T, pick: (r: never) => number): Promise<HealthSample[]> => {
    // Aggregates remove the overlap between phone and watch that summing raw records would double count.
    const groups = await m.aggregateGroupByPeriod({ recordType, timeRangeFilter: range, timeRangeSlicer: { period: "DAYS", length: 1 } });
    return groups.map((g) => ({ start: g.startTime, value: pick(g.result as never) })).filter((s) => Number.isFinite(s.value) && s.value > 0);
  };
  const out: RawHealth = emptyRawHealth();
  // A type switched off in Health Connect is skipped (empty) instead of failing the whole sync.
  const have = await grantedTypes(m);
  const ifGranted = <T,>(type: (typeof RECORDS)[number], f: () => Promise<T[]>): Promise<T[]> => (have.has(type) ? f() : Promise.resolve([]));
  // Nights start the evening before `from`, so the first night is whole.
  const sleepRange: Range = { ...range, startTime: new Date(start.getTime() - 18 * 3600_000).toISOString() };
  const [steps, active, basal, rhr, sleep, weight, fat, sessions] = await Promise.all([
    ifGranted("Steps", () => perDay("Steps", (r: { COUNT_TOTAL: number }) => r.COUNT_TOTAL)),
    ifGranted("ActiveCaloriesBurned", () => perDay("ActiveCaloriesBurned", (r: { ACTIVE_CALORIES_TOTAL: { inKilocalories: number } }) => r.ACTIVE_CALORIES_TOTAL.inKilocalories)),
    ifGranted("BasalMetabolicRate", () => perDay("BasalMetabolicRate", (r: { BASAL_CALORIES_TOTAL: { inKilocalories: number } }) => r.BASAL_CALORIES_TOTAL.inKilocalories)),
    ifGranted("RestingHeartRate", () => all(m, "RestingHeartRate", range)),
    ifGranted("SleepSession", () => all(m, "SleepSession", sleepRange)),
    ifGranted("Weight", () => all(m, "Weight", range)),
    ifGranted("BodyFat", () => all(m, "BodyFat", range)),
    ifGranted("ExerciseSession", () => all(m, "ExerciseSession", range)),
  ]);
  out.steps = steps;
  out.activeKcal = active;
  out.basalKcal = basal;
  out.restingHr = rhr.map((r) => ({ start: r.time, value: r.beatsPerMinute }));
  out.weightKg = weight.map((r) => ({ start: r.time, value: r.weight.inKilograms }));
  out.bodyFatPct = fat.map((r) => ({ start: r.time, value: r.percentage }));
  out.sleep = sleep.flatMap((s): RawSleepSegment[] =>
    s.stages?.length
      ? s.stages.flatMap((g) => (STAGE[g.stage] ? [{ start: g.startTime, end: g.endTime, stage: STAGE[g.stage] }] : []))
      : [{ start: s.startTime, end: s.endTime, stage: "asleep" }],
  );
  const names = Object.fromEntries(Object.entries(m.ExerciseType).map(([name, n]) => [n, name]));
  const energyAndDistance = async (startTime: string, endTime: string) => {
    const noKcal = !have.has("ActiveCaloriesBurned");
    const timeRangeFilter = { operator: "between", startTime, endTime } as const;
    // A failed lookup leaves the number empty; the workout itself is still synced.
    const [kcal, dist] = await Promise.all([
      (noKcal ? Promise.reject(new Error("not allowed")) : m.aggregateRecord({ recordType: "ActiveCaloriesBurned", timeRangeFilter })).then((r) => r.ACTIVE_CALORIES_TOTAL.inKilocalories, () => null),
      (have.has("Distance") ? m.aggregateRecord({ recordType: "Distance", timeRangeFilter }) : Promise.reject(new Error("not allowed"))).then((r) => r.DISTANCE.inMeters, () => null),
    ]);
    return { kcal: kcal || null, distanceM: dist || null };
  };
  out.workouts = [];
  for (const s of sessions) {
    if (!s.metadata?.id) continue;
    const name = names[s.exerciseType] ?? "OTHER_WORKOUT";
    const w: RawWorkout = { id: s.metadata.id, start: s.startTime, end: s.endTime, activity: ACTIVITY[name] ?? camel(name), ...(await energyAndDistance(s.startTime, s.endTime)) };
    out.workouts.push(w);
  }
  return out;
};

export const sync: HealthApi["sync"] = makeSync("health_connect", read);
export const healthApi = { isAvailable, missingPermissions, getPermissionState, requestPermissions, read, sync } satisfies HealthApi;
export type { PermissionState, SyncResult } from "./types";
