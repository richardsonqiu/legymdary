/**
 * Pure analysis math (see docs/analysis-plan.md). Every score is computed
 * deterministically from DayRows; the AI only narrates the results.
 */
import type { DayRow } from "@/lib/analysis/extract";
import { isFullyLogged } from "@/lib/energy";

/* ------------------------------------------------------------------ */
/* Basics                                                              */
/* ------------------------------------------------------------------ */

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export function sd(xs: number[]) {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (x: number, x0: number, y0: number, x1: number, y1: number) =>
  y0 + (clamp((x - x0) / (x1 - x0), 0, 1) * (y1 - y0));
const round = (v: number, p = 0) => Math.round(v * 10 ** p) / 10 ** p;
/** Piecewise-linear map through (x, y) points sorted by x; clamps at the ends. */
function curve(x: number, pts: [number, number][]) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) {
    if (x <= pts[k][0]) return lerp(x, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
  }
  return pts[pts.length - 1][1];
}

type NumKey = { [K in keyof DayRow]: DayRow[K] extends number | null ? K : never }[keyof DayRow];

export type Baseline = { mean: number; sd: number; n: number };

/** Personal baseline from the `window` days before index i (excludes the day itself). */
export function baselineAt(rows: DayRow[], i: number, key: NumKey, window = 28, minN = 10): Baseline | null {
  const vals: number[] = [];
  for (let j = Math.max(0, i - window); j < i; j++) {
    const v = rows[j][key];
    if (typeof v === "number") vals.push(v);
  }
  if (vals.length < minN) return null;
  const s = sd(vals);
  return { mean: mean(vals), sd: Number.isFinite(s) && s > 0 ? s : Math.max(1e-6, Math.abs(mean(vals)) * 0.05), n: vals.length };
}
export const zScore = (v: number | null, b: Baseline | null) =>
  v == null || !b ? null : clamp((v - b.mean) / b.sd, -3, 3);

/* ------------------------------------------------------------------ */
/* Sleep                                                               */
/* ------------------------------------------------------------------ */

export const DEFAULT_SLEEP_NEED_MIN = 450; // 7.5 h fallback

export function sleepNeedMin(r: DayRow) {
  return r.sleepNeedMin && r.sleepNeedMin > 240 && r.sleepNeedMin < 720 ? r.sleepNeedMin : DEFAULT_SLEEP_NEED_MIN;
}

/** Hours of sleep owed over the last 7 nights (≥ 0). */
export function sleepDebtHours(rows: DayRow[], i: number) {
  let debt = 0;
  let n = 0;
  for (let j = Math.max(0, i - 6); j <= i; j++) {
    const r = rows[j];
    if (r.sleepSec == null) continue;
    debt += sleepNeedMin(r) - r.sleepSec / 60;
    n++;
  }
  return n >= 3 ? Math.max(0, debt / 60) : null;
}

/** Standard deviation (minutes) of bed and wake times over 7 nights. */
export function sleepConsistency(rows: DayRow[], i: number) {
  const bed: number[] = [];
  const wake: number[] = [];
  for (let j = Math.max(0, i - 6); j <= i; j++) {
    if (rows[j].bedtimeMin != null) bed.push(rows[j].bedtimeMin!);
    if (rows[j].wakeMin != null) wake.push(rows[j].wakeMin!);
  }
  if (bed.length < 4) return null;
  return { bedSd: round(sd(bed)), wakeSd: wake.length >= 4 ? round(sd(wake)) : null };
}

/* ------------------------------------------------------------------ */
/* Load / strain                                                       */
/* ------------------------------------------------------------------ */

/** Combined daily load: Garmin cardio load + app strength volume (10,000 kg·reps ≈ 100). */
export const dailyLoad = (r: DayRow) => (r.cardioLoad ?? 0) + r.strengthVolume / 100;

/** EWMA acute (7d) and chronic (28d) load and their ratio, as of index i (inclusive). */
export function loadBalance(rows: DayRow[], i: number) {
  // Start where training data starts (Garmin activities or logged strength),
  // so a history that begins mid-window doesn't fake a "spike".
  const first = rows.findIndex((r) => r.cardioLoad != null || r.strengthSets > 0);
  if (first < 0 || i - first < 27) return null;
  const la = 2 / (7 + 1);
  const lc = 2 / (28 + 1);
  const seed = mean(rows.slice(first, first + 7).map(dailyLoad));
  let acute = seed;
  let chronic = seed;
  for (let j = first; j <= i; j++) {
    const l = dailyLoad(rows[j]);
    acute = la * l + (1 - la) * acute;
    chronic = lc * l + (1 - lc) * chronic;
  }
  return { acute: round(acute, 1), chronic: round(chronic, 1), ratio: chronic > 1 ? round(acute / chronic, 2) : null };
}

/** WHOOP-style 0–21 strain, scaled so your 90th-percentile day ≈ 16. */
export function strain(rows: DayRow[], i: number) {
  const loads = rows.slice(Math.max(0, i - 90), i + 1).map(dailyLoad).filter((l) => l > 0).sort((a, b) => a - b);
  const p90 = loads.length >= 5 ? loads[Math.floor(loads.length * 0.9) - 1] ?? loads[loads.length - 1] : 150;
  const k = Math.max(40, p90 / -Math.log(1 - 16 / 21));
  return round(21 * (1 - Math.exp(-dailyLoad(rows[i]) / k)), 1);
}

/* ------------------------------------------------------------------ */
/* Readiness (0–100)                                                   */
/* ------------------------------------------------------------------ */

export type Contributor = {
  key: "hrv" | "rhr" | "sleep" | "sleepBalance" | "loadBalance" | "breathing";
  label: string;
  score: number; // 0–100
  weight: number;
  detail: string;
};

export type Readiness = {
  score: number;
  band: "push" | "normal" | "easy";
  label: string;
  confidence: "high" | "medium" | "low";
  contributors: Contributor[];
};

export function readinessAt(rows: DayRow[], i: number): Readiness | null {
  const r = rows[i];
  const c: Contributor[] = [];

  const hb = baselineAt(rows, i, "hrv");
  const hz = zScore(r.hrv, hb);
  if (hz != null && hb) {
    // Best around baseline-to-slightly-above; drops when low; mild penalty for unusual spikes.
    // Normal night-to-night noise (≈ ±0.5 SD) keeps the score high; unusual spikes get a mild penalty.
    const s = curve(hz, [[-3, 0], [-2, 30], [-1, 75], [-0.25, 100], [2.5, 100], [3, 85]]);
    c.push({ key: "hrv", label: "HRV", score: s, weight: 30, detail: `${r.hrv} ms vs ${round(hb.mean)} ms usual` });
  }

  const rhrVal = r.sleepAvgHr ?? r.rhr;
  const rb = baselineAt(rows, i, r.sleepAvgHr != null ? "sleepAvgHr" : "rhr");
  const rz = zScore(rhrVal, rb);
  if (rz != null && rb) {
    c.push({
      key: "rhr",
      label: "Resting HR",
      score: curve(rz, [[0.25, 100], [1, 75], [2, 30], [3, 0]]),
      weight: 20,
      detail: `${round(rhrVal!)} bpm vs ${round(rb.mean)} usual`,
    });
  }

  if (r.sleepScore != null) {
    c.push({ key: "sleep", label: "Sleep", score: curve(r.sleepScore, [[40, 0], [60, 55], [80, 100]]), weight: 20, detail: `score ${r.sleepScore}` });
  } else if (r.sleepSec != null) {
    const perf = r.sleepSec / 60 / sleepNeedMin(r);
    c.push({ key: "sleep", label: "Sleep", score: curve(perf, [[0.6, 0], [0.8, 60], [0.95, 100]]), weight: 20, detail: `${round(r.sleepSec / 3600, 1)} h` });
  }

  const debt = sleepDebtHours(rows, i);
  if (debt != null) {
    c.push({ key: "sleepBalance", label: "Sleep balance", score: curve(debt, [[0, 100], [2, 80], [5, 30], [8, 0]]), weight: 10, detail: `${round(debt, 1)} h owed (7 days)` });
  }

  const lb = i > 0 ? loadBalance(rows, i - 1) : null;
  if (lb?.ratio != null) {
    const x = lb.ratio;
    const s = x < 0.6 ? 70 : x <= 1.3 ? 100 : x <= 1.5 ? lerp(x, 1.3, 100, 1.5, 40) : lerp(x, 1.5, 40, 1.8, 0);
    c.push({ key: "loadBalance", label: "Load balance", score: s, weight: 10, detail: `acute:chronic ${x}` });
  }

  const respB = baselineAt(rows, i, "sleepRespiration");
  const respZ = zScore(r.sleepRespiration, respB);
  if (respZ != null || r.sleepSpo2Low != null) {
    const bad = (respZ != null && respZ > 2) || (r.sleepSpo2Low != null && r.sleepSpo2Low < 88);
    c.push({
      key: "breathing",
      label: "Breathing",
      score: bad ? 0 : 100,
      weight: 10,
      detail: [
        r.sleepRespiration != null ? `${round(r.sleepRespiration, 1)} br/min` : null,
        r.sleepSpo2Low != null ? `SpO2 low ${r.sleepSpo2Low}%` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  if (!c.some((x) => x.key === "hrv" || x.key === "rhr" || x.key === "sleep")) return null;
  const wsum = c.reduce((a, x) => a + x.weight, 0);
  const score = Math.round(c.reduce((a, x) => a + x.score * x.weight, 0) / wsum);
  const core = ["hrv", "rhr", "sleep"].filter((k) => c.some((x) => x.key === k)).length;
  return {
    score,
    band: score >= 70 ? "push" : score >= 45 ? "normal" : "easy",
    label: score >= 70 ? "Ready to push" : score >= 45 ? "Train as planned" : "Take it easy",
    confidence: core === 3 && wsum >= 80 ? "high" : core >= 2 ? "medium" : "low",
    contributors: c.map((x) => ({ ...x, score: Math.round(x.score), weight: Math.round((x.weight / wsum) * 100) })),
  };
}

/* ------------------------------------------------------------------ */
/* Watch-outs (deterministic flags)                                    */
/* ------------------------------------------------------------------ */

export type Flag = { level: "info" | "warn"; text: string };

export function flagsAt(rows: DayRow[], i: number, ctx: { proteinTarget: number | null }): Flag[] {
  const flags: Flag[] = [];
  // HRV suppressed 3+ days.
  let low = 0;
  for (let j = i; j >= Math.max(0, i - 6); j--) {
    const z = zScore(rows[j].hrv, baselineAt(rows, j, "hrv"));
    if (z != null && z < -1) low++;
    else break;
  }
  if (low >= 3) flags.push({ level: "warn", text: `HRV has been below your usual range for ${low} days in a row.` });

  // Same window as the card/readiness: training through yesterday (today is still in progress).
  const lb = i > 0 ? loadBalance(rows, i - 1) : null;
  if (lb?.ratio != null && lb.ratio > 1.5) flags.push({ level: "warn", text: `Training load spike: acute:chronic ratio ${lb.ratio} (above 1.5).` });

  const r = rows[i];
  const respZ = zScore(r.sleepRespiration, baselineAt(rows, i, "sleepRespiration"));
  const rhrZ = zScore(r.sleepAvgHr ?? r.rhr, baselineAt(rows, i, r.sleepAvgHr != null ? "sleepAvgHr" : "rhr"));
  if (respZ != null && rhrZ != null && respZ > 1.5 && rhrZ > 1.5) {
    flags.push({ level: "warn", text: "Breathing rate and resting HR are both well above usual — a common sign of illness or heavy fatigue." });
  }
  if (r.sleepSpo2Low != null && r.sleepSpo2Low < 88) {
    flags.push({ level: "warn", text: `Lowest overnight SpO2 was ${r.sleepSpo2Low}%. If this repeats, consider checking with a doctor.` });
  }
  const debt = sleepDebtHours(rows, i);
  if (debt != null && debt >= 5) flags.push({ level: "warn", text: `Sleep debt is ${round(debt, 1)} h over the last week.` });

  const week = rows.slice(Math.max(0, i - 7), i);
  const logged = week.filter((d) => isFullyLogged({ date: d.date, calories: d.intakeKcal, count: d.mealCount })).length;
  if (week.length >= 5 && logged < 4) flags.push({ level: "info", text: `Only ${logged} of the last ${week.length} days are fully logged — nutrition insights are less reliable.` });
  if (ctx.proteinTarget) {
    const short = week.filter((d) => d.mealCount > 0 && d.protein < ctx.proteinTarget! * 0.8).length;
    if (short >= 4) flags.push({ level: "info", text: `Protein was under 80% of target on ${short} of the last ${week.length} days.` });
  }
  return flags;
}

/* ------------------------------------------------------------------ */
/* Personal patterns (lagged Spearman correlations)                    */
/* ------------------------------------------------------------------ */

function ranks(xs: number[]) {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let k = 0; k < idx.length; ) {
    let e = k;
    while (e + 1 < idx.length && idx[e + 1][0] === idx[k][0]) e++;
    for (let t = k; t <= e; t++) r[idx[t][1]] = (k + e) / 2 + 1;
    k = e + 1;
  }
  return r;
}
function pearson(a: number[], b: number[]) {
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let dbb = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    dbb += (b[i] - mb) ** 2;
  }
  return da && dbb ? num / Math.sqrt(da * dbb) : 0;
}
// Standard normal CDF (Abramowitz–Stegun).
function phi(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export type Pattern = { text: string; rho: number; n: number; p: number };

type Candidate = {
  x: (r: DayRow) => number | null;
  y: (r: DayRow) => number | null;
  lag: 0 | 1;
  pos: string; // sentence when rho > 0
  neg: string; // sentence when rho < 0
};

const CANDIDATES: Candidate[] = [
  {
    // Eating late (day d) vs that night's sleep, which Garmin dates d+1.
    x: (r) => (r.lastMealMin != null ? r.lastMealMin : null),
    y: (r) => r.sleepScore,
    lag: 1,
    pos: "Later last meals go with better sleep scores",
    neg: "Later last meals go with lower sleep scores",
  },
  {
    x: (r) => (r.mealCount ? r.intakeKcal : null),
    y: (r) => r.sleepScore,
    lag: 1,
    pos: "Higher-calorie days go with better sleep",
    neg: "Higher-calorie days go with worse sleep",
  },
  {
    x: (r) => (r.mealCount ? (r.alcohol ? 1 : 0) : null),
    y: (r) => r.hrv,
    lag: 1,
    pos: "Days with alcohol go with higher next-night HRV",
    neg: "Days with alcohol go with lower next-night HRV",
  },
  {
    x: (r) => dailyLoad(r),
    y: (r) => r.hrv,
    lag: 1,
    pos: "Harder training days go with higher HRV the next night",
    neg: "Harder training days go with lower HRV the next night",
  },
  {
    x: (r) => (r.mealCount ? r.protein : null),
    y: (r) => r.sleepScore,
    lag: 1,
    pos: "Higher-protein days go with better sleep",
    neg: "Higher-protein days go with worse sleep",
  },
  {
    x: (r) => r.steps,
    y: (r) => r.sleepScore,
    lag: 1,
    pos: "More active days (steps) go with better sleep",
    neg: "More active days (steps) go with worse sleep",
  },
  {
    x: (r) => (r.sleepSec != null ? r.sleepSec / 3600 : null),
    y: (r) => r.stressAvg,
    lag: 0,
    pos: "Longer sleep goes with higher daytime stress",
    neg: "Longer sleep goes with lower daytime stress",
  },
  {
    x: (r) => (r.sleepSec != null ? r.sleepSec / 3600 : null),
    y: (r) => (r.mealCount ? r.intakeKcal : null),
    lag: 0,
    pos: "Longer sleep goes with eating more that day",
    neg: "Shorter sleep goes with eating more that day",
  },
];

export function personalPatterns(rows: DayRow[]): Pattern[] {
  const out: Pattern[] = [];
  for (const c of CANDIDATES) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i + c.lag < rows.length; i++) {
      const x = c.x(rows[i]);
      const y = c.y(rows[i + c.lag]);
      if (x != null && y != null) {
        xs.push(x);
        ys.push(y);
      }
    }
    const n = xs.length;
    const distinct = new Set(xs);
    if (n < 12) continue;
    if (distinct.size === 2) {
      // Yes/no inputs (e.g. alcohol): need enough days in both groups.
      const [a, b] = [...distinct];
      if (xs.filter((v) => v === a).length < 4 || xs.filter((v) => v === b).length < 4) continue;
    } else if (distinct.size < 3) continue;
    const rho = pearson(ranks(xs), ranks(ys));
    const z = Math.atanh(clamp(rho, -0.999, 0.999)) * Math.sqrt(n - 3);
    const p = 2 * (1 - phi(Math.abs(z)));
    if (Math.abs(rho) >= 0.35 && p < 0.05) {
      out.push({ text: `${rho > 0 ? c.pos : c.neg} (n=${n}, ρ=${round(rho, 2)})`, rho: round(rho, 2), n, p: round(p, 3) });
    }
  }
  return out.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho)).slice(0, 4);
}
