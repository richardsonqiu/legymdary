import { workoutType } from "../apple-health/parse";
import type { AhBatch, AhDay, AhSleep, AhWeighIn, AhWorkout } from "../apple-health/types";
import type { HealthBatchRequest, HealthSource } from "../api/health";

/**
 * Platform-neutral readings from HealthKit or Health Connect. Each platform file
 * (apps/mobile/src/health/health.ios.ts and .android.ts) only reads the OS store and fills this
 * shape; everything that turns it into the server's batch lives here, so the two stay identical.
 * `start`/`time` strings are ISO 8601 with a "Z" or an offset ("+0800" and "+08:00" both work).
 */
export type HealthSample = { start: string; value: number };
export type SleepStageName = "inBed" | "asleep" | "awake" | "light" | "deep" | "rem";
export type RawSleepSegment = { start: string; end: string; stage: SleepStageName };
export type RawWorkout = {
  /** The OS record id (a UUID); cleaned to fit the server's id pattern. */
  id: string;
  start: string;
  end: string;
  /** Apple workout activity name, e.g. "Running" or "TraditionalStrengthTraining". */
  activity: string;
  kcal: number | null;
  distanceM: number | null;
};
export type RawHealth = {
  /** One value per day is expected (summed by day here when there are several). */
  steps: HealthSample[];
  activeKcal: HealthSample[];
  basalKcal: HealthSample[];
  restingHr: HealthSample[];
  hrv: HealthSample[];
  sleep: RawSleepSegment[];
  weightKg: HealthSample[];
  bodyFatPct: HealthSample[];
  workouts: RawWorkout[];
};

export const emptyRawHealth = (): RawHealth => ({
  steps: [], activeKcal: [], basalKcal: [], restingHr: [], hrv: [], sleep: [], weightKg: [], bodyFatPct: [], workouts: [],
});

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hms = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
/** Parses ISO strings including HealthKit's "+0800" offsets, which Hermes may not accept. */
export function parseHealthTime(iso: string): Date {
  return new Date(iso.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
}
/** The device-zone calendar date of an instant. */
export const localDate = (iso: string) => ymd(parseHealthTime(iso));
const localTs = (d: Date) => `${ymd(d)} ${hms(d)}`;
const round = (v: number, p = 0) => Math.round(v * 10 ** p) / 10 ** p;

function groupByDay(samples: HealthSample[], from: string, to: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const s of samples) {
    if (!Number.isFinite(s.value)) continue;
    const date = localDate(s.start);
    if (date < from || date > to) continue;
    const list = out.get(date) ?? [];
    list.push(s.value);
    out.set(date, list);
  }
  return out;
}
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => sum(xs) / xs.length;

/** Total length of the union of intervals, so overlapping samples from two sources are not counted twice. */
function unionSec(spans: [number, number][]): number {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -Infinity;
  for (const [s, e] of sorted) {
    if (e <= end) continue;
    total += e - Math.max(s, end);
    end = e;
  }
  return total / 1000;
}

/** A gap longer than this between sleep segments starts a new night. */
const NIGHT_GAP_MS = 3 * 3600_000;

function sleepNights(segments: RawSleepSegment[], from: string, to: string): AhSleep[] {
  const segs = segments
    .map((s) => ({ stage: s.stage, a: parseHealthTime(s.start).getTime(), b: parseHealthTime(s.end).getTime() }))
    .filter((s) => Number.isFinite(s.a) && Number.isFinite(s.b) && s.b > s.a)
    .sort((x, y) => x.a - y.a);
  const nights: (typeof segs)[] = [];
  let latest = -Infinity;
  let cur: typeof segs = [];
  for (const s of segs) {
    if (cur.length && s.a - latest > NIGHT_GAP_MS) {
      nights.push(cur);
      cur = [];
    }
    cur.push(s);
    latest = Math.max(latest, s.b);
  }
  if (cur.length) nights.push(cur);
  // A night and a nap that end on the same day make ONE row: the server keys sleep by date.
  const merged = new Map<string, typeof segs>();
  for (const night of nights) {
    const date = ymd(new Date(Math.max(...night.map((s) => s.b))));
    merged.set(date, [...(merged.get(date) ?? []), ...night]);
  }
  const out: AhSleep[] = [];
  for (const [date, night] of merged) {
    const start = new Date(Math.min(...night.map((s) => s.a)));
    const end = new Date(Math.max(...night.map((s) => s.b)));
    if (date < from || date > to) continue;
    const of = (...stages: SleepStageName[]) => unionSec(night.filter((s) => stages.includes(s.stage)).map((s) => [s.a, s.b]));
    const hasStages = night.some((s) => s.stage === "light" || s.stage === "deep" || s.stage === "rem");
    const asleepSec = of("asleep", "light", "deep", "rem");
    if (asleepSec <= 0) continue; // only "in bed" or "awake": not a night of sleep
    out.push({
      date,
      startLocal: localTs(start),
      endLocal: localTs(end),
      startUtc: start.toISOString(),
      asleepSec: round(asleepSec),
      inBedSec: round(Math.max(of("inBed"), of("inBed", "asleep", "awake", "light", "deep", "rem"))),
      deepSec: hasStages ? round(of("deep")) : null,
      remSec: hasStages ? round(of("rem")) : null,
      lightSec: hasStages ? round(of("light")) : null,
      awakeSec: hasStages ? round(of("awake")) : null,
      awakeCount: null,
      avgHr: null,
      respiration: null,
      spo2Avg: null,
      spo2Low: null,
    });
  }
  return out;
}

function lastByDay(samples: HealthSample[], from: string, to: string, ok: (v: number) => boolean): Map<string, number> {
  const best = new Map<string, { t: number; v: number }>();
  for (const s of samples) {
    const date = localDate(s.start);
    const t = parseHealthTime(s.start).getTime();
    if (date < from || date > to || !Number.isFinite(s.value) || !ok(s.value)) continue;
    if ((best.get(date)?.t ?? -Infinity) <= t) best.set(date, { t, v: s.value });
  }
  return new Map([...best].map(([d, b]) => [d, b.v]));
}

/** Turns readings for the dates from..to (YYYY-MM-DD, device zone, inclusive) into one server batch. */
export function buildAhBatch(raw: RawHealth, from: string, to: string): AhBatch {
  const steps = groupByDay(raw.steps, from, to);
  const active = groupByDay(raw.activeKcal, from, to);
  const basal = groupByDay(raw.basalKcal, from, to);
  const rhr = groupByDay(raw.restingHr, from, to);
  const hrv = groupByDay(raw.hrv, from, to);
  const dates = [...new Set([...steps.keys(), ...active.keys(), ...basal.keys(), ...rhr.keys(), ...hrv.keys()])].sort();
  const days: AhDay[] = dates.map((date) => ({
    date,
    steps: steps.has(date) ? round(sum(steps.get(date)!)) : null,
    activeKcal: active.has(date) ? round(sum(active.get(date)!)) : null,
    basalKcal: basal.has(date) ? round(sum(basal.get(date)!)) : null,
    exerciseMin: null,
    restingHr: rhr.has(date) ? round(avg(rhr.get(date)!)) : null,
    hrv: hrv.has(date) ? round(avg(hrv.get(date)!), 1) : null,
    hrvWeekly: null,
  }));

  const weights = lastByDay(raw.weightKg, from, to, (kg) => kg > 20 && kg < 400);
  const fats = lastByDay(raw.bodyFatPct, from, to, (p) => p > 2 && p < 75);
  const body: AhWeighIn[] = [...new Set([...weights.keys(), ...fats.keys()])].sort().map((date) => ({
    date,
    weight: weights.has(date) ? round(weights.get(date)!, 1) : null,
    bodyFat: fats.has(date) ? round(fats.get(date)!, 1) : null,
  }));

  const workouts: AhWorkout[] = [];
  for (const w of raw.workouts) {
    const a = parseHealthTime(w.start);
    const b = parseHealthTime(w.end);
    const date = ymd(a);
    if (Number.isNaN(a.getTime()) || date < from || date > to) continue;
    const { type, name } = workoutType(`HKWorkoutActivityType${w.activity}`);
    workouts.push({
      id: w.id, // given the source prefix by buildBatchRequests
      date,
      startLocal: localTs(a),
      type,
      name,
      durationSec: Number.isNaN(b.getTime()) ? null : round((b.getTime() - a.getTime()) / 1000),
      kcal: w.kcal != null ? round(w.kcal) : null,
      distanceM: w.distanceM != null ? round(w.distanceM) : null,
      avgHr: null,
      maxHr: null,
      minHr: null,
      zonesSec: null,
    });
  }
  return { days, sleep: sleepNights(raw.sleep, from, to), workouts, body };
}

const PREFIX: Record<HealthSource, string> = { apple: "apple-", health_connect: "hc-" };
const CHUNK = 300;
const MAX = 400;

/**
 * Splits readings into requests for POST /api/v1/health/batch (each part within the server's limits).
 * Workouts of the window all go in the LAST request together with `workoutRange`: the server removes
 * stored workouts of that source in the range that are not in that request.
 * shortcut: with more than 400 workouts in one window they are spread out and workoutRange is left off, so
 * a re-id'd workout can duplicate; the sync window is days, not years.
 */
export function buildBatchRequests(raw: RawHealth, source: HealthSource, from: string, to: string): HealthBatchRequest[] {
  const batch = buildAhBatch(raw, from, to);
  const prefix = PREFIX[source];
  // Dashes are dropped so a 36-char UUID fits the server's 34-char id pattern whole.
  const workouts = batch.workouts.map((w) => ({ ...w, id: `${prefix}${w.id.replace(/^(apple|hc)-/, "").replace(/\W/g, "").slice(0, 34)}` }));
  const oneRange = workouts.length <= MAX;
  const parts = Math.max(Math.ceil(batch.days.length / CHUNK), Math.ceil(batch.sleep.length / CHUNK), Math.ceil(batch.body.length / CHUNK), oneRange ? 1 : Math.ceil(workouts.length / MAX), 1);
  return Array.from({ length: parts }, (_, i) => {
    const last = i === parts - 1;
    const req: HealthBatchRequest = {
      source,
      days: batch.days.slice(i * CHUNK, (i + 1) * CHUNK),
      sleep: batch.sleep.slice(i * CHUNK, (i + 1) * CHUNK),
      body: batch.body.slice(i * CHUNK, (i + 1) * CHUNK),
      workouts: oneRange ? (last ? workouts : []) : workouts.slice(i * MAX, (i + 1) * MAX),
    };
    // No workouts read (denied or none): never ask the server to delete stored ones.
    if (oneRange && last && workouts.length > 0) req.workoutRange = { from, to };
    return req;
  });
}
