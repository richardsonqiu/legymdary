/**
 * Morning sleep summary. Pure rules over the day's rows (no AI call), so it is
 * instant and free the moment you wake up. Every sentence is built from your
 * own numbers: stages vs typical ranges, timing vs your usual bedtime, and
 * recovery signals (HRV, resting heart rate, Body Battery).
 */
import type { DayRow } from "@/lib/analysis/extract";
import { baselineAt, sleepDebtHours, sleepNeedMin } from "@/lib/analysis/metrics";

export type StageKey = "deep" | "rem" | "light" | "awake";
export type Stage = {
  key: StageKey;
  minutes: number;
  /** Share of time asleep (awake: share of time in bed). */
  pct: number;
  /** Typical healthy range in percent, when one is commonly used. */
  typical: [number, number] | null;
  status: "low" | "ok" | "high" | null;
};

export type SleepVerdict = "excellent" | "good" | "fair" | "poor";
export type Driver = { tone: "good" | "bad"; text: string };

export type SleepSummary = {
  date: string;
  hours: number;
  /** Exact minutes asleep (hours is rounded to 0.1 h). */
  minutes: number;
  needHours: number;
  pctOfNeed: number;
  score: number | null;
  verdict: SleepVerdict;
  headline: string;
  stages: Stage[];
  /** Minutes asleep as a share of minutes in bed. */
  efficiency: number | null;
  awakeMin: number | null;
  awakeCount: number | null;
  restless: number | null;
  bed: string | null;
  wake: string | null;
  /** Minutes later (+) or earlier (−) than your usual bedtime. */
  bedVsUsualMin: number | null;
  vsUsual: { score: number | null; hours: number | null };
  recovery: {
    hrv: number | null;
    hrvUsual: number | null;
    rhr: number | null;
    rhrUsual: number | null;
    bodyBatteryCharged: number | null;
    bodyBatteryWake: number | null;
  };
  /** How Garmin rated each part of its score, when Garmin provides it. */
  parts: { label: string; rating: string }[];
  drivers: Driver[];
  tip: string | null;
  /** Last 7 nights, oldest first. */
  week: { date: string; score: number | null; hours: number | null }[];
  weekAvgScore: number | null;
  prevWeekAvgScore: number | null;
};

const TYPICAL: Partial<Record<StageKey, [number, number]>> = { deep: [13, 23], rem: [20, 25] };
const PART_LABEL: Record<string, string> = {
  duration: "Duration",
  stress: "Stress",
  wakeups: "Wake-ups",
  deep: "Deep sleep",
  rem: "REM",
  light: "Light sleep",
  restfulness: "Restfulness",
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function hoursMinutes(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h === 0 ? `${mm} min` : mm === 0 ? `${h} h` : `${h} h ${mm} min`;
}

const clock = (min: number | null) => {
  if (min == null) return null;
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Garmin's own bands: 90+ excellent, 80 to 89 good, 60 to 79 fair, below 60 poor. */
function verdictFor(score: number | null, qualifier: string | null, pctOfNeed: number): SleepVerdict {
  const q = qualifier?.toUpperCase();
  if (q === "EXCELLENT" || q === "GOOD" || q === "FAIR" || q === "POOR") return q.toLowerCase() as SleepVerdict;
  if (score != null) return score >= 90 ? "excellent" : score >= 80 ? "good" : score >= 60 ? "fair" : "poor";
  return pctOfNeed >= 95 ? "good" : pctOfNeed >= 80 ? "fair" : "poor";
}

/** Summary of the night that ended on rows[i]'s morning, or null if there is no sleep data. */
export function buildSleepSummary(rows: DayRow[], i: number): SleepSummary | null {
  const r = rows[i];
  if (!r || r.sleepSec == null || r.sleepSec <= 0) return null;

  const asleepMin = r.sleepSec / 60;
  const needMin = sleepNeedMin(r);
  const pctOfNeed = Math.round((asleepMin / needMin) * 100);
  const awakeMin = r.awakeSec != null ? r.awakeSec / 60 : null;
  const inBed = asleepMin + (awakeMin ?? 0);

  // Stages
  const stages: Stage[] = [];
  const addStage = (key: Exclude<StageKey, "awake">, sec: number | null) => {
    if (sec == null) return;
    const pct = (sec / r.sleepSec!) * 100;
    const t = TYPICAL[key] ?? null;
    stages.push({
      key,
      minutes: Math.round(sec / 60),
      pct: Math.round(pct),
      typical: t,
      status: t ? (pct < t[0] ? "low" : pct > t[1] ? "high" : "ok") : null,
    });
  };
  addStage("deep", r.deepSec);
  addStage("rem", r.remSec);
  addStage("light", r.lightSec);
  if (awakeMin != null) {
    stages.push({ key: "awake", minutes: Math.round(awakeMin), pct: Math.round((awakeMin / inBed) * 100), typical: null, status: null });
  }
  const stage = (k: StageKey) => stages.find((s) => s.key === k);

  const efficiency = awakeMin != null ? Math.round((asleepMin / inBed) * 100) : null;

  // vs your usual (previous 14 nights)
  const prior = rows.slice(Math.max(0, i - 14), i);
  const priorScores = prior.map((d) => d.sleepScore).filter((v): v is number => v != null);
  const priorHours = prior.map((d) => d.sleepSec).filter((v): v is number => v != null).map((s) => s / 3600);
  const usualScore = priorScores.length >= 5 ? avg(priorScores) : null;
  const usualHours = priorHours.length >= 5 ? avg(priorHours) : null;
  const bedB = baselineAt(rows, i, "bedtimeMin", 14, 5);
  const bedVsUsual = r.bedtimeMin != null && bedB ? Math.round(r.bedtimeMin - bedB.mean) : null;

  const hrvB = baselineAt(rows, i, "hrv");
  const rhrKey = r.sleepAvgHr != null ? "sleepAvgHr" : "rhr";
  const rhrB = baselineAt(rows, i, rhrKey);
  const rhr = (r[rhrKey] as number | null) ?? null;

  const verdict = verdictFor(r.sleepScore, r.sleepQualifier, pctOfNeed);
  const word = verdict === "excellent" ? "excellent" : verdict;
  const hoursTxt = hoursMinutes(asleepMin);
  const headline =
    `You slept ${hoursTxt}` +
    (r.sleepScore != null ? `, score ${r.sleepScore} (${word}).` : ".") +
    ` That is ${pctOfNeed}% of the ${hoursMinutes(needMin)} you need` +
    (usualScore != null && r.sleepScore != null
      ? `, and ${Math.abs(Math.round(r.sleepScore - usualScore)) < 3 ? "about the same as" : r.sleepScore > usualScore ? "better than" : "below"} your usual.`
      : ".");

  // Drivers: what helped and what hurt, most important first.
  const bad: Driver[] = [];
  const good: Driver[] = [];
  const gap = needMin - asleepMin;
  if (gap >= 45) bad.push({ tone: "bad", text: `${hoursTxt} is ${hoursMinutes(gap)} under your need` });
  else if (gap <= 0) good.push({ tone: "good", text: "You met your sleep need" });

  const deep = stage("deep");
  if (deep?.status === "low") bad.push({ tone: "bad", text: `Deep sleep was ${deep.pct}% (typical ${deep.typical![0]} to ${deep.typical![1]}%)` });
  else if (deep && deep.pct >= 17) good.push({ tone: "good", text: `Deep sleep was solid at ${deep.pct}%` });
  const rem = stage("rem");
  if (rem?.status === "low") bad.push({ tone: "bad", text: `REM sleep was ${rem.pct}% (typical ${rem.typical![0]} to ${rem.typical![1]}%)` });
  else if (rem && rem.pct >= 20) good.push({ tone: "good", text: `REM sleep was good at ${rem.pct}%` });

  if (awakeMin != null && awakeMin >= 40) {
    bad.push({ tone: "bad", text: `You were awake for ${Math.round(awakeMin)} min${r.awakeCount ? ` across ${r.awakeCount} wake-ups` : ""}` });
  } else if (awakeMin != null && awakeMin <= 15) {
    good.push({ tone: "good", text: `Very little time awake (${Math.round(awakeMin)} min)` });
  }
  if (bedVsUsual != null && bedVsUsual >= 45) bad.push({ tone: "bad", text: `You went to bed ${hoursMinutes(bedVsUsual)} later than usual` });
  else if (bedVsUsual != null && Math.abs(bedVsUsual) <= 20) good.push({ tone: "good", text: "Bedtime was close to your usual" });

  if (r.hrv != null && hrvB && r.hrv < hrvB.mean * 0.85) bad.push({ tone: "bad", text: `HRV was low (${r.hrv} vs ${Math.round(hrvB.mean)} usual)` });
  else if (r.hrv != null && hrvB && r.hrv >= hrvB.mean) good.push({ tone: "good", text: `HRV was at or above usual (${r.hrv} vs ${Math.round(hrvB.mean)})` });
  if (rhr != null && rhrB && rhr >= rhrB.mean + 5) bad.push({ tone: "bad", text: `Resting heart rate was up (${Math.round(rhr)} vs ${Math.round(rhrB.mean)} usual)` });
  if (r.sleepSpo2Low != null && r.sleepSpo2Low < 88) bad.push({ tone: "bad", text: `Oxygen dipped to ${r.sleepSpo2Low}% overnight` });
  if (r.bbCharged != null && r.bbCharged >= 60) good.push({ tone: "good", text: `Body Battery gained ${r.bbCharged} overnight` });
  else if (r.bbCharged != null && r.bbCharged < 30 && asleepMin >= 6.5 * 60) bad.push({ tone: "bad", text: `Body Battery gained only ${r.bbCharged} despite the hours` });

  const drivers = [...bad.slice(0, 4), ...good.slice(0, bad.length >= 3 ? 1 : 2)];

  // One next step, from the biggest problem.
  const debt = sleepDebtHours(rows, i);
  let tip: string | null = null;
  if (debt != null && debt >= 2 && r.bedtimeMin != null) {
    // Start from your usual bedtime (or last night's, if earlier) and go a bit earlier.
    const base = bedB ? Math.min(r.bedtimeMin, bedB.mean) : r.bedtimeMin;
    tip = `You are ${r1(debt)} h short this week. Try to be in bed by ${clock(base - 30)} tonight.`;
  } else if (bedVsUsual != null && bedVsUsual >= 45 && bedB) {
    tip = `Aim for bed around ${clock(bedB.mean)} tonight to get back on your usual schedule.`;
  } else if (deep?.status === "low") {
    tip = "Deep sleep drops with late meals, alcohol and a warm room. Try finishing dinner 3 hours before bed.";
  } else if (awakeMin != null && awakeMin >= 40) {
    tip = "To cut wake-ups, keep the room dark and cool, and avoid caffeine after 2 pm.";
  } else if (verdict === "excellent" || verdict === "good") {
    tip = "Keep the same bedtime tonight to hold this up.";
  }

  const week = rows.slice(Math.max(0, i - 6), i + 1).map((d) => ({
    date: d.date,
    score: d.sleepScore,
    hours: d.sleepSec != null ? r1(d.sleepSec / 3600) : null,
  }));
  const wk = (from: number, to: number) => {
    const v = rows.slice(Math.max(0, from), to).map((d) => d.sleepScore).filter((x): x is number => x != null);
    return v.length >= 3 ? Math.round(avg(v)!) : null;
  };

  return {
    date: r.date,
    hours: r1(asleepMin / 60),
    minutes: Math.round(asleepMin),
    needHours: r1(needMin / 60),
    pctOfNeed,
    score: r.sleepScore,
    verdict,
    headline,
    stages,
    efficiency,
    awakeMin: awakeMin != null ? Math.round(awakeMin) : null,
    awakeCount: r.awakeCount,
    restless: r.restlessMoments,
    bed: clock(r.bedtimeMin),
    wake: clock(r.wakeMin),
    bedVsUsualMin: bedVsUsual,
    vsUsual: { score: usualScore != null ? Math.round(usualScore) : null, hours: usualHours != null ? r1(usualHours) : null },
    recovery: {
      hrv: r.hrv,
      hrvUsual: hrvB ? Math.round(hrvB.mean) : null,
      rhr: rhr != null ? Math.round(rhr) : null,
      rhrUsual: rhrB ? Math.round(rhrB.mean) : null,
      bodyBatteryCharged: r.bbCharged,
      bodyBatteryWake: r.bbWake,
    },
    parts: r.sleepParts.map((p) => ({ label: PART_LABEL[p.key] ?? p.key, rating: p.rating.toLowerCase() })),
    drivers,
    tip,
    week,
    weekAvgScore: wk(i - 6, i + 1),
    prevWeekAvgScore: wk(i - 13, i - 6),
  };
}
