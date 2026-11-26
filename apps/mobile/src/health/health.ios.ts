import { emptyRawHealth, type HealthSample, type RawHealth, type RawSleepSegment, type SleepStageName } from "@legymdary/shared";
import * as SecureStore from "expo-secure-store";
import { iosAskedKey, makeSync } from "./sync";
import type { HealthApi } from "./types";

/** Apple Health through react-native-health (HealthKit). Mapping to the server batch is in @legymdary/shared. */
type Kit = typeof import("react-native-health").default;

/** Loaded on first use so a build without the native module (Expo Go) still opens; the screen then says "not available". */
function kit(): Kit | null {
  try {
    const k = (require("react-native-health") as { default?: Kit }).default ?? (require("react-native-health") as Kit);
    return typeof k?.initHealthKit === "function" ? k : null;
  } catch {
    return null;
  }
}

const PERMISSIONS = ["StepCount", "ActiveEnergyBurned", "BasalEnergyBurned", "RestingHeartRate", "HeartRateVariability", "SleepAnalysis", "BodyMass", "BodyFatPercentage", "Workout"];

export const healthName = "Apple Health";

export const isAvailable: HealthApi["isAvailable"] = () =>
  new Promise((resolve) => {
    const k = kit();
    if (!k) return resolve(false);
    k.isAvailable((err, ok) => resolve(!err && ok));
  });

export const requestPermissions: HealthApi["requestPermissions"] = () =>
  new Promise((resolve, reject) => {
    const k = kit();
    if (!k) return resolve(false);
    k.initHealthKit({ permissions: { read: PERMISSIONS as never, write: [] } }, (err) => {
      if (err) return reject(new Error(String(err)));
      void SecureStore.setItemAsync(iosAskedKey, "1").then(() => resolve(true), () => resolve(true));
    });
  });

// HealthKit does not reveal which reads were allowed, so "granted" means the sheet was shown once.
export const getPermissionState: HealthApi["getPermissionState"] = async () => {
  if (!(await isAvailable())) return "unavailable";
  return (await SecureStore.getItemAsync(iosAskedKey).catch(() => null)) ? "granted" : "needed";
};

type Call<T> = (cb: (err: unknown, results: T) => void) => void;
const ask = <T,>(fn: Call<T>) =>
  new Promise<T>((resolve, reject) => fn((err, results) => (err ? reject(new Error(typeof err === "string" ? err : "Apple Health read failed")) : resolve(results))));

type Value = { value: number; startDate: string; endDate: string };
const samples = (list: Value[] | undefined, scale = 1): HealthSample[] => (list ?? []).map((v) => ({ start: v.startDate, value: v.value * scale }));

const STAGE: Record<string, SleepStageName> = { INBED: "inBed", ASLEEP: "asleep", UNSPECIFIED: "asleep", AWAKE: "awake", CORE: "light", DEEP: "deep", REM: "rem" };
const MILE_M = 1609.344;

export const read: HealthApi["read"] = async (from, to) => {
  const k = kit();
  if (!k) throw new Error("Apple Health is not available in this build.");
  const out: RawHealth = emptyRawHealth();
  // Nights start the evening before `from`, so the first night is whole.
  const start = new Date(`${from}T00:00:00`);
  const opts = { startDate: start.toISOString(), endDate: new Date(`${to}T23:59:59`).toISOString() };
  const sleepOpts = { ...opts, startDate: new Date(start.getTime() - 18 * 3600_000).toISOString() };
  const [steps, active, basal, rhr, hrv, sleep, weight, fat, workouts] = await Promise.all([
    ask<Value[]>((cb) => k.getDailyStepCountSamples(opts, cb)),
    ask<Value[]>((cb) => k.getActiveEnergyBurned(opts, cb as never)),
    ask<Value[]>((cb) => k.getBasalEnergyBurned(opts, cb as never)),
    ask<Value[]>((cb) => k.getRestingHeartRateSamples(opts, cb as never)),
    ask<Value[]>((cb) => k.getHeartRateVariabilitySamples(opts, cb as never)),
    ask<{ value: unknown; startDate: string; endDate: string }[]>((cb) => k.getSleepSamples(sleepOpts, cb as never)),
    ask<Value[]>((cb) => k.getWeightSamples({ ...opts, unit: "gram" as never }, cb as never)),
    ask<Value[]>((cb) => k.getBodyFatPercentageSamples(opts, cb as never)),
    ask<{ results?: unknown; data: { id: string; activityName: string; calories: number; distance: number; start: string; end: string }[] }>((cb) => k.getAnchoredWorkouts({ ...opts, type: "Workout" as never }, cb as never)),
  ]);
  out.steps = samples(steps);
  out.activeKcal = samples(active);
  out.basalKcal = samples(basal);
  out.restingHr = samples(rhr);
  out.hrv = samples(hrv, 1000); // seconds to ms
  out.weightKg = samples(weight, 0.001);
  out.bodyFatPct = samples(fat).map((s) => (s.value <= 1 ? { ...s, value: s.value * 100 } : s)); // a fraction in some versions
  out.sleep = sleep.flatMap((s): RawSleepSegment[] => {
    const stage = STAGE[String(s.value).toUpperCase()];
    return stage ? [{ start: s.startDate, end: s.endDate, stage }] : [];
  });
  out.workouts = workouts.data.map((w) => ({
    id: w.id,
    start: w.start,
    end: w.end,
    activity: w.activityName,
    kcal: Number.isFinite(w.calories) && w.calories > 0 ? w.calories : null,
    distanceM: Number.isFinite(w.distance) && w.distance > 0 ? w.distance * MILE_M : null, // react-native-health reports miles
  }));
  return out;
};

export const sync: HealthApi["sync"] = makeSync("apple", read);
export const healthApi = { isAvailable, getPermissionState, requestPermissions, read, sync } satisfies HealthApi;
export type { PermissionState, SyncResult } from "./types";
