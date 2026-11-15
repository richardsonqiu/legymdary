import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { garminActivities, garminRaw } from "@/db/schema";

/**
 * Server-only. Everything we know about one Garmin activity, merged from the
 * stored summary, the detailed activity record and its workout steps, with
 * plain-language explanations for the jargon.
 */

type Json = Record<string, unknown>;
const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Json)[k] : undefined), o);
const num = (o: unknown, ...paths: string[]) => {
  for (const p of paths) {
    const v = get(o, p);
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
};
const str = (o: unknown, ...paths: string[]) => {
  for (const p of paths) {
    const v = get(o, p);
    if (typeof v === "string" && v) return v;
  }
  return null;
};

export const ZONES = [
  { n: 1, name: "Warm-up", hint: "very easy, recovery" },
  { n: 2, name: "Easy", hint: "conversational, builds endurance" },
  { n: 3, name: "Aerobic", hint: "steady, improves fitness" },
  { n: 4, name: "Threshold", hint: "hard, raises your limit" },
  { n: 5, name: "Maximum", hint: "all-out, short bursts" },
] as const;

/** Garmin's Training Effect scale (0–5) in plain words. */
export function trainingEffectWords(te: number | null) {
  if (te == null) return null;
  if (te < 1) return "No real training effect";
  if (te < 2) return "Light, recovery work";
  if (te < 3) return "Maintaining your fitness";
  if (te < 4) return "Improving your fitness";
  if (te < 5) return "Highly improving your fitness";
  return "Very hard, needs extra recovery";
}

export type ActivityView = {
  id: string;
  name: string;
  type: string | null;
  typeLabel: string;
  date: string | null;
  startLocal: string | null;
  location: string | null;
  durationSec: number | null;
  movingSec: number | null;
  distanceKm: number | null;
  paceMinPerKm: number | null; // for foot sports
  speedKmh: number | null; // for others
  maxSpeedKmh: number | null;
  elevationGain: number | null;
  elevationLoss: number | null;
  calories: number | null;
  avgHr: number | null;
  maxHr: number | null;
  minHr: number | null;
  zonesSec: (number | null)[];
  aerobicTE: number | null;
  anaerobicTE: number | null;
  teLabel: string | null;
  load: number | null;
  vo2max: number | null;
  cadenceAvg: number | null;
  cadenceMax: number | null;
  cadenceUnit: string | null;
  powerAvg: number | null;
  powerMax: number | null;
  powerNorm: number | null;
  strideCm: number | null;
  groundContactMs: number | null;
  verticalOscCm: number | null;
  tempMin: number | null;
  tempMax: number | null;
  bodyBatteryImpact: number | null;
  sweatMl: number | null;
  intensityModerate: number | null;
  intensityVigorous: number | null;
  sets: { name: string; sets: number | null; reps: number | null; maxWeightKg: number | null; volumeKg: number | null }[];
  steps: { name: string; detail: string }[];
  splits: { n: number; distanceKm: number | null; durationSec: number | null; paceMinPerKm: number | null; avgHr: number | null; elevationGain: number | null }[];
};

const FOOT = /running|walking|hiking|trail|treadmill|track|street/i;
const titleCase = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export async function getActivityView(userId: string, activityId: string): Promise<ActivityView | null> {
  const [raw, [typed]] = await Promise.all([
    db
      .select({ dataset: garminRaw.dataset, payload: garminRaw.payload, date: garminRaw.date })
      .from(garminRaw)
      .where(
        and(
          eq(garminRaw.userId, userId),
          eq(garminRaw.key, activityId),
          inArray(garminRaw.dataset, ["activities", "activity_detail", "activity_workouts"]),
        ),
      ),
    db
      .select()
      .from(garminActivities)
      .where(and(eq(garminActivities.userId, userId), eq(garminActivities.activityId, activityId)))
      .limit(1),
  ]);
  const parse = (ds: string) => {
    const r = raw.find((x) => x.dataset === ds);
    try {
      return r ? (JSON.parse(r.payload) as unknown) : null;
    } catch {
      return null;
    }
  };
  const s = parse("activities") as Json | null; // summarized activity
  const d = parse("activity_detail") as Json | null; // full activity
  const w = parse("activity_workouts");
  if (!s && !d && !typed) return null;
  const sum = (d?.summaryDTO ?? null) as Json | null;

  const type = str(s, "activityType.typeKey") ?? str(d, "activityTypeDTO.typeKey") ?? typed?.type ?? null;
  const foot = !!type && FOOT.test(type);
  const durationSec = num(s, "duration") ?? num(sum, "duration") ?? typed?.durationSec ?? null;
  const distanceM = num(s, "distance") ?? num(sum, "distance") ?? typed?.distanceM ?? null;
  const avgSpeed = num(s, "averageSpeed") ?? num(sum, "averageMovingSpeed", "averageSpeed");
  const maxSpeed = num(s, "maxSpeed") ?? num(sum, "maxSpeed");
  const distanceKm = distanceM != null && distanceM > 0 ? distanceM / 1000 : null;
  const speedKmh = avgSpeed != null && avgSpeed > 0 ? avgSpeed * 3.6 : distanceKm && durationSec ? distanceKm / (durationSec / 3600) : null;

  const runCad = num(s, "averageRunningCadenceInStepsPerMinute") ?? num(sum, "averageRunCadence");
  const bikeCad = num(sum, "averageBikeCadence");
  const swimCad = num(s, "averageSwimCadenceInStrokesPerMinute") ?? num(sum, "averageSwimCadence");

  const exSets = Array.isArray(s?.summarizedExerciseSets) ? (s!.summarizedExerciseSets as Json[]) : [];
  const workouts = Array.isArray(w) ? (w as Json[]) : [];
  const splitsRaw = Array.isArray(d?.splitSummaries) ? (d!.splitSummaries as Json[]) : [];

  return {
    id: activityId,
    name: str(s, "activityName") ?? str(d, "activityName") ?? typed?.name ?? "Activity",
    type,
    typeLabel: type ? titleCase(type) : "Activity",
    date: typed?.date ?? raw[0]?.date ?? null,
    startLocal: str(s, "startTimeLocal") ?? str(sum, "startTimeLocal") ?? typed?.startTimeLocal ?? null,
    location: str(s, "locationName") ?? str(d, "locationName"),
    durationSec,
    movingSec: num(s, "movingDuration") ?? num(sum, "movingDuration"),
    distanceKm,
    paceMinPerKm: foot && speedKmh ? 60 / speedKmh : null,
    speedKmh: !foot ? speedKmh : null,
    maxSpeedKmh: maxSpeed != null ? maxSpeed * 3.6 : null,
    elevationGain: num(s, "elevationGain") ?? num(sum, "elevationGain"),
    elevationLoss: num(s, "elevationLoss") ?? num(sum, "elevationLoss"),
    calories: num(s, "calories") ?? num(sum, "calories") ?? typed?.calories ?? null,
    avgHr: num(s, "averageHR") ?? num(sum, "averageHR") ?? typed?.avgHr ?? null,
    maxHr: num(s, "maxHR") ?? num(sum, "maxHR"),
    minHr: num(sum, "minHR"),
    zonesSec: [1, 2, 3, 4, 5].map((z) => num(s, `hrTimeInZone_${z}`)),
    aerobicTE: num(s, "aerobicTrainingEffect") ?? num(sum, "trainingEffect"),
    anaerobicTE: num(s, "anaerobicTrainingEffect") ?? num(sum, "anaerobicTrainingEffect"),
    teLabel: str(s, "trainingEffectLabel"),
    load: num(s, "activityTrainingLoad") ?? typed?.trainingLoad ?? null,
    vo2max: num(s, "vO2MaxValue"),
    cadenceAvg: runCad ?? bikeCad ?? swimCad,
    cadenceMax: num(s, "maxRunningCadenceInStepsPerMinute") ?? num(sum, "maxRunCadence", "maxBikeCadence", "maxSwimCadence"),
    cadenceUnit: runCad != null ? "steps/min" : bikeCad != null ? "rpm" : swimCad != null ? "strokes/min" : null,
    powerAvg: num(s, "avgPower") ?? num(sum, "averagePower"),
    powerMax: num(s, "maxPower") ?? num(sum, "maxPower"),
    powerNorm: num(s, "normPower") ?? num(sum, "normalizedPower"),
    strideCm: num(s, "avgStrideLength") ?? num(sum, "strideLength"),
    groundContactMs: num(s, "avgGroundContactTime") ?? num(sum, "groundContactTime"),
    verticalOscCm: num(s, "avgVerticalOscillation") ?? num(sum, "verticalOscillation"),
    tempMin: num(s, "minTemperature") ?? num(sum, "minTemperature"),
    tempMax: num(s, "maxTemperature") ?? num(sum, "maxTemperature"),
    bodyBatteryImpact: num(s, "differenceBodyBattery"),
    sweatMl: num(s, "waterEstimated"),
    intensityModerate: num(s, "moderateIntensityMinutes"),
    intensityVigorous: num(s, "vigorousIntensityMinutes"),
    sets: exSets.map((x) => {
      const vol = num(x, "volume");
      const mw = num(x, "maxWeight");
      return {
        name: titleCase(str(x, "subCategory") ?? str(x, "category") ?? "Exercise"),
        sets: num(x, "sets"),
        reps: num(x, "reps"),
        // Garmin reports weights in grams.
        maxWeightKg: mw != null ? (mw > 1000 ? mw / 1000 : mw) : null,
        volumeKg: vol != null ? (vol > 100000 ? vol / 1000 : vol) : null,
      };
    }),
    steps: workouts.flatMap((wk) =>
      (Array.isArray(wk.steps) ? (wk.steps as Json[]) : []).map((st) => {
        const reps = num(st, "durationValue");
        const wt = num(st, "exerciseWeightValue", "weight");
        return {
          name: titleCase(str(st, "exerciseName") ?? str(st, "name") ?? str(st, "exerciseCategory") ?? "Step"),
          detail: [
            reps != null ? `${reps} ${str(st, "durationType") === "REPS" || !str(st, "durationType") ? "reps" : str(st, "durationType")!.toLowerCase()}` : null,
            wt != null ? `${wt > 1000 ? wt / 1000 : wt} kg` : null,
            str(st, "intensity")?.toLowerCase() ?? null,
          ]
            .filter(Boolean)
            .join(" · "),
        };
      }),
    ),
    splits: splitsRaw.slice(0, 40).map((sp, i) => {
      const dist = num(sp, "distance");
      const dur = num(sp, "duration", "movingDuration");
      const spd = num(sp, "averageSpeed", "averageMovingSpeed");
      return {
        n: i + 1,
        distanceKm: dist != null ? dist / 1000 : null,
        durationSec: dur,
        paceMinPerKm: foot && spd ? 60 / (spd * 3.6) : foot && dist && dur ? dur / 60 / (dist / 1000) : null,
        avgHr: num(sp, "averageHR"),
        elevationGain: num(sp, "elevationGain"),
      };
    }),
  };
}
