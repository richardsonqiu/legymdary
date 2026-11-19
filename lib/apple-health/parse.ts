import type { AhDay, AhSleep, AhSummary, AhWeighIn, AhWorkout } from "@/lib/apple-health/types";

/**
 * Streaming reader for Apple Health's `export.xml`. Runs in the browser (and
 * in Node for tests): feed it text chunks with `push`, then `finish` reduces
 * everything to daily rows, nights, workouts and weigh-ins.
 *
 * It is a tag scanner, not a full XML parser: it only looks at the start tags
 * it needs (`Record`, `Workout`, `WorkoutStatistics`, `WorkoutZone`,
 * `ActivitySummary`), so a 1–2 GB export is read in well under a minute.
 *
 * How Apple's data is merged:
 * - Steps / energy / exercise minutes are written by several devices (iPhone
 *   and Watch both count steps). Per day we take the largest single-source
 *   total rather than the sum, so carrying both never doubles a day.
 *   Apple's own Activity rings (`ActivitySummary`) win for active energy and
 *   exercise minutes when present.
 * - Sleep: each source's segments are joined into sessions (gaps under an
 *   hour); a night is dated by the morning it ends, and the longest session
 *   per morning is kept. Stages (Core/Deep/REM) map to light/deep/REM.
 * - Records nested inside a `<Workout>` repeat top-level records, so they are
 *   skipped.
 */

const P = "HKQuantityTypeIdentifier";
const SUM_TYPES = new Set([`${P}StepCount`, `${P}ActiveEnergyBurned`, `${P}BasalEnergyBurned`, `${P}AppleExerciseTime`]);
const SAMPLE_TYPES = new Set([
  `${P}HeartRate`,
  `${P}RestingHeartRate`,
  `${P}HeartRateVariabilitySDNN`,
  `${P}RespiratoryRate`,
  `${P}OxygenSaturation`,
]);
const BODY_TYPES = new Set([`${P}BodyMass`, `${P}BodyFatPercentage`]);
const SLEEP = "HKCategoryTypeIdentifierSleepAnalysis";

type SleepKind = "inbed" | "asleep" | "core" | "deep" | "rem" | "awake";
const SLEEP_KIND: Record<string, SleepKind> = {
  HKCategoryValueSleepAnalysisInBed: "inbed",
  HKCategoryValueSleepAnalysisAsleep: "asleep",
  HKCategoryValueSleepAnalysisAsleepUnspecified: "asleep",
  HKCategoryValueSleepAnalysisAsleepCore: "core",
  HKCategoryValueSleepAnalysisAsleepDeep: "deep",
  HKCategoryValueSleepAnalysisAsleepREM: "rem",
  HKCategoryValueSleepAnalysisAwake: "awake",
};

type Seg = { s: number; e: number; endLocal: string; startLocal: string; kind: SleepKind };
type Series = { t: number[]; v: number[] };
type OpenWorkout = {
  activity: string;
  startLocal: string;
  startMs: number;
  durationSec: number | null;
  kcal: number | null;
  distanceM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  minHr: number | null;
  zones: number[];
  inHrZones: boolean;
};

/* ---------------- small helpers ---------------- */

function attr(tag: string, name: string): string | null {
  const key = ` ${name}="`;
  const i = tag.indexOf(key);
  if (i < 0) return null;
  const s = i + key.length;
  const e = tag.indexOf('"', s);
  return e < 0 ? null : tag.slice(s, e);
}

function decode(s: string): string {
  return s.indexOf("&") < 0
    ? s
    : s
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

/** "2023-08-04 20:00:00 +0800" → epoch ms. */
export function parseTs(s: string): number {
  const ms = Date.UTC(
    +s.slice(0, 4),
    +s.slice(5, 7) - 1,
    +s.slice(8, 10),
    +s.slice(11, 13),
    +s.slice(14, 16),
    +s.slice(17, 19),
  );
  const sign = s.charCodeAt(20) === 45 ? -1 : 1; // '-'
  const off = sign * (+s.slice(21, 23) * 60 + +s.slice(23, 25));
  return ms - (Number.isFinite(off) ? off : 0) * 60_000;
}

const kcalOf = (v: number, unit: string | null) => (unit === "kJ" ? v / 4.184 : v);
function metres(v: number, unit: string | null): number {
  switch (unit) {
    case "km":
      return v * 1000;
    case "mi":
      return v * 1609.344;
    case "yd":
      return v * 0.9144;
    case "ft":
      return v * 0.3048;
    case "cm":
      return v / 100;
    default:
      return v;
  }
}
function seconds(v: number, unit: string | null): number {
  if (unit === "s") return v;
  if (unit === "hr" || unit === "h") return v * 3600;
  return v * 60; // "min" is Apple's default
}
const round = (v: number | null, p = 0) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** p) / 10 ** p);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const TYPE_OVERRIDES: Record<string, string> = {
  FunctionalStrengthTraining: "strength_training",
  TraditionalStrengthTraining: "strength_training",
  HighIntensityIntervalTraining: "hiit",
  Swimming: "lap_swimming",
  Climbing: "rock_climbing",
  CardioDance: "dance",
  SocialDance: "dance",
  MixedCardio: "cardio",
  CoreTraining: "core_training",
  MindAndBody: "breathwork",
};
const NAME_OVERRIDES: Record<string, string> = {
  FunctionalStrengthTraining: "Functional strength",
  TraditionalStrengthTraining: "Strength training",
  HighIntensityIntervalTraining: "HIIT",
  CardioDance: "Cardio dance",
};
/** HKWorkoutActivityTypeFunctionalStrengthTraining → strength_training (Garmin-style key). */
export function workoutType(hk: string): { type: string; name: string } {
  const raw = hk.replace(/^HKWorkoutActivityType/, "") || "Other";
  const snake = raw.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  const words = snake.replace(/_/g, " ");
  return {
    type: TYPE_OVERRIDES[raw] ?? snake,
    name: NAME_OVERRIDES[raw] ?? words.charAt(0).toUpperCase() + words.slice(1),
  };
}

/** Sorts a time series in place by time and returns index helpers. */
function sortSeries(s: Series) {
  const idx = s.t.map((_, i) => i).sort((a, b) => s.t[a] - s.t[b]);
  s.t = idx.map((i) => s.t[i]);
  s.v = idx.map((i) => s.v[i]);
}
function lowerBound(arr: number[], x: number) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function window(s: Series, from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = lowerBound(s.t, from); i < s.t.length && s.t[i] <= to; i++) out.push(s.v[i]);
  return out;
}

/* ---------------- the parser ---------------- */

export function createAppleHealthParser(opts: { since?: string } = {}) {
  const since = opts.since ?? "0000-00-00";
  let buf = "";
  let records = 0;
  const sourceCount = new Map<string, number>();

  /** `${date}|${type}` → source → total */
  const sums = new Map<string, Map<string, number>>();
  const rings = new Map<string, { active: number | null; exercise: number | null }>();
  const series: Record<string, Series> = {};
  for (const t of SAMPLE_TYPES) series[t] = { t: [], v: [] };
  const restingByDate = new Map<string, number[]>();
  const hrvByDate = new Map<string, number[]>();
  const weightByDate = new Map<string, { t: number; v: number }>();
  const fatByDate = new Map<string, { t: number; v: number }>();
  const sleepBySource = new Map<string, Seg[]>();
  const workouts: OpenWorkout[] = [];
  let open: OpenWorkout | null = null;
  let inWorkout = false;

  function onRecord(tag: string) {
    const type = attr(tag, "type");
    if (!type) return;
    const isSum = SUM_TYPES.has(type);
    const isSample = !isSum && SAMPLE_TYPES.has(type);
    const isBody = !isSum && !isSample && BODY_TYPES.has(type);
    const isSleep = type === SLEEP;
    if (!isSum && !isSample && !isBody && !isSleep) return;
    const start = attr(tag, "startDate");
    if (!start || start.length < 25 || start.slice(0, 10) < since) return;
    const date = start.slice(0, 10);
    const source = decode(attr(tag, "sourceName") ?? "Unknown");
    records++;
    sourceCount.set(source, (sourceCount.get(source) ?? 0) + 1);

    if (isSleep) {
      const kind = SLEEP_KIND[attr(tag, "value") ?? ""];
      const end = attr(tag, "endDate");
      if (!kind || !end || end.length < 25) return;
      const segs = sleepBySource.get(source) ?? [];
      segs.push({ s: parseTs(start), e: parseTs(end), startLocal: start.slice(0, 19), endLocal: end.slice(0, 19), kind });
      sleepBySource.set(source, segs);
      return;
    }

    const raw = Number(attr(tag, "value"));
    if (!Number.isFinite(raw)) return;
    const unit = attr(tag, "unit");

    if (isSum) {
      const v = type.endsWith("EnergyBurned") ? kcalOf(raw, unit) : type.endsWith("ExerciseTime") ? seconds(raw, unit) / 60 : raw;
      const key = `${date}|${type}`;
      let m = sums.get(key);
      if (!m) sums.set(key, (m = new Map()));
      m.set(source, (m.get(source) ?? 0) + v);
      return;
    }
    if (isBody) {
      const t = parseTs(start);
      if (type.endsWith("BodyMass")) {
        const kg = unit === "lb" ? raw * 0.45359237 : unit === "g" ? raw / 1000 : raw;
        if (kg > 20 && kg < 400 && (weightByDate.get(date)?.t ?? -Infinity) <= t) weightByDate.set(date, { t, v: kg });
      } else {
        const pct = unit === "%" && raw <= 1 ? raw * 100 : raw;
        if (pct > 2 && pct < 75 && (fatByDate.get(date)?.t ?? -Infinity) <= t) fatByDate.set(date, { t, v: pct });
      }
      return;
    }
    // Samples
    if (type.endsWith("RestingHeartRate")) {
      restingByDate.set(date, [...(restingByDate.get(date) ?? []), raw]);
      return;
    }
    const v = type.endsWith("OxygenSaturation") && raw <= 1 ? raw * 100 : raw;
    const s = series[type];
    s.t.push(parseTs(start));
    s.v.push(v);
    if (type.endsWith("SDNN")) hrvByDate.set(date, [...(hrvByDate.get(date) ?? []), v]);
  }

  function onWorkoutOpen(tag: string) {
    const start = attr(tag, "startDate");
    if (!start || start.length < 25 || start.slice(0, 10) < since) {
      open = null;
      return;
    }
    const d = Number(attr(tag, "duration"));
    const e = Number(attr(tag, "totalEnergyBurned"));
    const dist = Number(attr(tag, "totalDistance"));
    open = {
      activity: attr(tag, "workoutActivityType") ?? "HKWorkoutActivityTypeOther",
      startLocal: start.slice(0, 19),
      startMs: parseTs(start),
      durationSec: Number.isFinite(d) && d > 0 ? seconds(d, attr(tag, "durationUnit")) : null,
      kcal: Number.isFinite(e) && e > 0 ? kcalOf(e, attr(tag, "totalEnergyBurnedUnit")) : null,
      distanceM: Number.isFinite(dist) && dist > 0 ? metres(dist, attr(tag, "totalDistanceUnit")) : null,
      avgHr: null,
      maxHr: null,
      minHr: null,
      zones: [],
      inHrZones: false,
    };
    records++;
  }

  function onWorkoutStat(tag: string) {
    if (!open) return;
    const type = attr(tag, "type") ?? "";
    const unit = attr(tag, "unit");
    if (type === `${P}ActiveEnergyBurned`) {
      const v = Number(attr(tag, "sum"));
      if (Number.isFinite(v) && v > 0) open.kcal = Math.max(open.kcal ?? 0, kcalOf(v, unit));
    } else if (type.startsWith(`${P}Distance`)) {
      const v = Number(attr(tag, "sum"));
      if (Number.isFinite(v) && v > 0) open.distanceM = Math.max(open.distanceM ?? 0, metres(v, unit));
    } else if (type === `${P}HeartRate`) {
      const avg = Number(attr(tag, "average"));
      const max = Number(attr(tag, "maximum"));
      const min = Number(attr(tag, "minimum"));
      if (Number.isFinite(avg) && avg > 0) open.avgHr = avg;
      if (Number.isFinite(max) && max > 0) open.maxHr = max;
      if (Number.isFinite(min) && min > 0) open.minHr = min;
    }
  }

  function onTag(tag: string) {
    // tag is the text between '<' and '>' (exclusive).
    const c = tag.charCodeAt(0);
    if (c === 82 /* R */ && tag.startsWith("Record ")) {
      if (!inWorkout) onRecord(tag);
    } else if (c === 87 /* W */) {
      if (tag.startsWith("Workout ")) {
        if (inWorkout) closeWorkout(); // a missing </Workout> must not swallow the rest of the file
        inWorkout = true;
        onWorkoutOpen(tag);
        if (tag.endsWith("/")) closeWorkout();
      } else if (tag.startsWith("WorkoutStatistics ")) onWorkoutStat(tag);
      else if (tag.startsWith("WorkoutZoneGroup ")) {
        if (open) open.inHrZones = attr(tag, "type") === `${P}HeartRate` && open.zones.length === 0;
      } else if (tag.startsWith("WorkoutZone ")) {
        if (open?.inHrZones) {
          const d = Number(attr(tag, "duration"));
          open.zones.push(Number.isFinite(d) ? seconds(d, attr(tag, "durationUnit")) : 0);
        }
      }
    } else if (c === 47 /* / */) {
      if (tag === "/Workout") closeWorkout();
      else if (tag === "/WorkoutZoneGroup" && open) open.inHrZones = false;
    } else if (c === 65 /* A */ && tag.startsWith("ActivitySummary ")) {
      const date = attr(tag, "dateComponents");
      if (!date || date < since) return;
      const a = Number(attr(tag, "activeEnergyBurned"));
      const ex = Number(attr(tag, "appleExerciseTime"));
      rings.set(date, {
        active: Number.isFinite(a) && a > 0 ? kcalOf(a, attr(tag, "activeEnergyBurnedUnit")) : null,
        exercise: Number.isFinite(ex) && ex > 0 ? ex : null,
      });
    }
  }

  function closeWorkout() {
    if (open) workouts.push(open);
    open = null;
    inWorkout = false;
  }

  function push(text: string) {
    buf = buf ? buf + text : text;
    let pos = 0;
    for (;;) {
      const lt = buf.indexOf("<", pos);
      if (lt < 0) {
        pos = buf.length;
        break;
      }
      const gt = buf.indexOf(">", lt + 1);
      if (gt < 0) {
        pos = lt;
        break;
      }
      onTag(buf.slice(lt + 1, gt));
      pos = gt + 1;
    }
    buf = buf.slice(pos);
  }

  /* ---------------- reduce ---------------- */

  function buildSleep(): AhSleep[] {
    const hr = series[`${P}HeartRate`];
    const resp = series[`${P}RespiratoryRate`];
    const spo2 = series[`${P}OxygenSaturation`];
    const hrv = series[`${P}HeartRateVariabilitySDNN`];
    for (const s of [hr, resp, spo2, hrv]) sortSeries(s);

    const best = new Map<string, AhSleep & { _s: number; _e: number }>();
    for (const segs of sleepBySource.values()) {
      segs.sort((a, b) => a.s - b.s);
      let session: Seg[] = [];
      let sessionEnd = -Infinity;
      const flush = () => {
        if (!session.length) return;
        const night = summariseSession(session);
        if (night) {
          const cur = best.get(night.date);
          if (!cur || night.asleepSec > cur.asleepSec) best.set(night.date, night);
        }
        session = [];
      };
      for (const seg of segs) {
        if (seg.s - sessionEnd > 60 * 60_000) flush();
        session.push(seg);
        sessionEnd = Math.max(sessionEnd, seg.e);
      }
      flush();
    }

    const out: AhSleep[] = [];
    for (const n of [...best.values()].sort((a, b) => a.date.localeCompare(b.date))) {
      const { _s, _e, ...night } = n;
      const hrs = window(hr, _s, _e);
      const rs = window(resp, _s, _e);
      const ox = window(spo2, _s, _e);
      night.avgHr = round(mean(hrs));
      night.respiration = round(mean(rs), 1);
      night.spo2Avg = round(mean(ox));
      night.spo2Low = ox.length ? round(Math.min(...ox)) : null;
      out.push(night);
      const hv = window(hrv, _s, _e + 30 * 60_000); // watch often samples just after waking
      if (hv.length) nightHrv.set(night.date, mean(hv)!);
    }
    return out;
  }
  const nightHrv = new Map<string, number>();

  /** Union length of intervals (ms), for overlapping segments of the same kind. */
  function unionMs(iv: [number, number][]): number {
    if (!iv.length) return 0;
    iv.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let [cs, ce] = iv[0];
    for (const [s, e] of iv.slice(1)) {
      if (s > ce) {
        total += ce - cs;
        cs = s;
        ce = e;
      } else ce = Math.max(ce, e);
    }
    return total + (ce - cs);
  }

  function summariseSession(segs: Seg[]): (AhSleep & { _s: number; _e: number }) | null {
    const asleepKinds = segs.filter((s) => s.kind !== "inbed" && s.kind !== "awake");
    if (!asleepKinds.length) return null; // in-bed only (e.g. phone bedtime) is not sleep
    const of = (k: SleepKind) => unionMs(segs.filter((s) => s.kind === k).map((s) => [s.s, s.e]));
    const asleepMs = unionMs(asleepKinds.map((s) => [s.s, s.e]));
    if (asleepMs < 20 * 60_000) return null;
    const first = asleepKinds.reduce((a, b) => (b.s < a.s ? b : a));
    const last = asleepKinds.reduce((a, b) => (b.e > a.e ? b : a));
    const all = segs.reduce((a, b) => ({ s: Math.min(a.s, b.s), e: Math.max(a.e, b.e) }), { s: Infinity, e: -Infinity });
    const staged = segs.some((s) => s.kind === "core" || s.kind === "deep" || s.kind === "rem");
    const awake = segs.filter((s) => s.kind === "awake");
    const awakeInside = awake.filter((a) => a.s >= first.s && a.e <= last.e);
    return {
      date: last.endLocal.slice(0, 10),
      startLocal: first.startLocal,
      endLocal: last.endLocal,
      startUtc: new Date(first.s).toISOString().slice(0, 19),
      asleepSec: Math.round(asleepMs / 1000),
      inBedSec: Math.round((all.e - all.s) / 1000),
      deepSec: staged ? Math.round(of("deep") / 1000) : null,
      remSec: staged ? Math.round(of("rem") / 1000) : null,
      lightSec: staged ? Math.round((of("core") + of("asleep")) / 1000) : null,
      awakeSec: awake.length ? Math.round(unionMs(awakeInside.map((s) => [s.s, s.e])) / 1000) : null,
      awakeCount: awake.length ? awakeInside.length : null,
      avgHr: null,
      respiration: null,
      spo2Avg: null,
      spo2Low: null,
      _s: first.s,
      _e: last.e,
    };
  }

  function finish(): AhSummary {
    if (buf) push(""); // flush complete tags
    buf = "";
    const sleep = buildSleep();

    const dates = new Set<string>();
    for (const k of sums.keys()) dates.add(k.slice(0, 10));
    for (const d of rings.keys()) dates.add(d);
    for (const d of restingByDate.keys()) dates.add(d);
    for (const d of hrvByDate.keys()) dates.add(d);

    const maxOf = (date: string, type: string) => {
      const m = sums.get(`${date}|${P}${type}`);
      return m && m.size ? Math.max(...m.values()) : null;
    };
    const sorted = [...dates].sort();
    const hrvSeries: { date: string; v: number }[] = [];
    const days: AhDay[] = [];
    for (const date of sorted) {
      const ring = rings.get(date);
      const hrv = nightHrv.get(date) ?? mean(hrvByDate.get(date) ?? []);
      if (hrv != null) hrvSeries.push({ date, v: hrv });
      const weekly = hrvSeries.filter((h) => h.date > addDays(date, -7));
      const day: AhDay = {
        date,
        steps: round(maxOf(date, "StepCount")),
        activeKcal: round(ring?.active ?? maxOf(date, "ActiveEnergyBurned")),
        basalKcal: round(maxOf(date, "BasalEnergyBurned")),
        exerciseMin: round(ring?.exercise ?? maxOf(date, "AppleExerciseTime")),
        restingHr: round(mean(restingByDate.get(date) ?? [])),
        hrv: round(hrv),
        hrvWeekly: weekly.length >= 3 ? round(mean(weekly.map((h) => h.v))) : null,
      };
      if (Object.entries(day).some(([k, v]) => k !== "date" && v != null && v !== 0)) days.push(day);
    }

    const seen = new Set<string>();
    const outWorkouts: AhWorkout[] = workouts
      .sort((a, b) => a.startMs - b.startMs)
      .map((w) => {
        const base = `apple-${w.startLocal.slice(0, 10).replace(/-/g, "")}-${w.startLocal.slice(11, 19).replace(/:/g, "")}`;
        let id = base;
        for (let i = 2; seen.has(id); i++) id = `${base}-${i}`;
        seen.add(id);
        const { type, name } = workoutType(w.activity);
        return {
          id,
          date: w.startLocal.slice(0, 10),
          startLocal: w.startLocal,
          type,
          name,
          durationSec: round(w.durationSec),
          kcal: round(w.kcal),
          distanceM: round(w.distanceM),
          avgHr: round(w.avgHr),
          maxHr: round(w.maxHr),
          minHr: round(w.minHr),
          zonesSec: w.zones.length === 5 ? w.zones.map((z) => Math.round(z)) : null,
        };
      });

    const bodyDates = [...new Set([...weightByDate.keys(), ...fatByDate.keys()])].sort();
    const body: AhWeighIn[] = bodyDates.map((date) => ({
      date,
      weight: round(weightByDate.get(date)?.v ?? null, 1),
      bodyFat: round(fatByDate.get(date)?.v ?? null, 1),
    }));

    const allDates = [...sorted, ...sleep.map((s) => s.date), ...outWorkouts.map((w) => w.date), ...bodyDates].sort();
    return {
      from: allDates[0] ?? null,
      to: allDates[allDates.length - 1] ?? null,
      days,
      sleep,
      workouts: outWorkouts,
      body,
      sources: [...sourceCount.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s),
      records,
    };
  }

  return { push, finish };
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
