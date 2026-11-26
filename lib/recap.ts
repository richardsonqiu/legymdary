/**
 * Data for the week / month / year recap stories. One pass over the analysis
 * rows (Garmin + food + gym + body) for the period and the one before it,
 * turned into plain numbers and short sentences. No AI call.
 */
import { addDays, addMonths, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { extractDays, type DayRow } from "@/lib/analysis/extract";
import { getAllPRs } from "@/lib/queries";
import { isFullyLogged } from "@legymdary/shared";

export type RecapPeriod = "week" | "month" | "year";

export type RecapRange = {
  period: RecapPeriod;
  from: string;
  to: string;
  /** Range of the same length just before, for "vs last week" lines. */
  prevFrom: string;
  prevTo: string;
  /** "9 to 15 Nov", "October", "2026" */
  label: string;
  /** "week", "month", "year" in a sentence. */
  noun: string;
  /** The period is still running (data to date only). */
  partial: boolean;
};

const ds = (d: Date) => format(d, "yyyy-MM-dd");

/** The range for a recap. Default: last full week, last full month, this year so far. */
export function recapRange(period: RecapPeriod, today: string, anchor?: string | null): RecapRange {
  const t = parseISO(today);
  if (period === "week") {
    const start = anchor ? startOfWeek(parseISO(anchor), { weekStartsOn: 1 }) : addDays(startOfWeek(t, { weekStartsOn: 1 }), -7);
    const end = addDays(start, 6);
    const prevStart = addDays(start, -7);
    const sameMonth = format(start, "MMM") === format(end, "MMM");
    return {
      period,
      from: ds(start),
      to: ds(end),
      prevFrom: ds(prevStart),
      prevTo: ds(addDays(prevStart, 6)),
      label: sameMonth ? `${format(start, "d")} to ${format(end, "d MMM")}` : `${format(start, "d MMM")} to ${format(end, "d MMM")}`,
      noun: "week",
      partial: ds(end) >= today,
    };
  }
  if (period === "month") {
    const start = anchor ? startOfMonth(parseISO(anchor)) : startOfMonth(addMonths(t, -1));
    const end = endOfMonth(start);
    const prevStart = startOfMonth(addMonths(start, -1));
    return {
      period,
      from: ds(start),
      to: ds(end),
      prevFrom: ds(prevStart),
      prevTo: ds(endOfMonth(prevStart)),
      label: format(start, "MMMM"),
      noun: "month",
      partial: ds(end) >= today,
    };
  }
  const year = anchor ? parseISO(anchor).getFullYear() : t.getFullYear();
  return {
    period,
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    prevFrom: `${year - 1}-01-01`,
    prevTo: `${year - 1}-12-31`,
    label: String(year),
    noun: "year",
    partial: `${year}-12-31` >= today,
  };
}

export type Recap = {
  range: RecapRange;
  hasData: boolean;
  training: {
    activeDays: number;
    days: number;
    prevActiveDays: number;
    sessions: number;
    gymSessions: number;
    minutes: number;
    prevMinutes: number;
    kcal: number;
    sets: number;
    volumeKg: number;
    /** Share of training minutes by activity type, biggest first. */
    types: { name: string; minutes: number; pct: number }[];
    longest: { name: string; date: string; minutes: number } | null;
    /** Active minutes per weekday (Mon..Sun) or per month (Jan..Dec) for a year. */
    rhythm: { label: string; minutes: number }[];
    bestRhythm: string | null;
    /** One value per day: 0 nothing, 1 food only, 2 trained, 3 trained and food. */
    grid: { date: string; v: 0 | 1 | 2 | 3 }[];
  };
  prs: { count: number; best: { name: string; weight: number; reps: number; date: string } | null };
  food: {
    daysLogged: number;
    meals: number;
    skipped: number;
    avgKcal: number | null;
    avgProtein: number | null;
    goTo: { name: string; count: number } | null;
    biggest: { name: string; kcal: number; date: string } | null;
  };
  sleep: {
    nights: number;
    avgHours: number | null;
    avgScore: number | null;
    prevAvgHours: number | null;
    best: { date: string; score: number; hours: number | null } | null;
  };
  steps: { total: number; avgPerDay: number | null; best: { date: string; steps: number } | null };
  battery: { avgWake: number | null };
  weight: { start: number | null; end: number | null; change: number | null };
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);
const r1 = (v: number) => Math.round(v * 10) / 10;

const hasStrengthActivity = (r: DayRow) => r.activities.some((a) => /strength|weight/i.test(a.type ?? ""));
const isActive = (r: DayRow) => r.strengthSets > 0 || r.activities.some((a) => a.min >= 15);
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Builds the recap for a range. Rows for the days after today are ignored. */
export async function buildRecap(userId: string, range: RecapRange, today: string, mealNames: { date: string; name: string; calories: number }[]): Promise<Recap> {
  const to = range.to < today ? range.to : today;
  const prevTo = range.prevTo;
  const [{ rows: all }, prs] = await Promise.all([extractDays(userId, range.prevFrom, to), getAllPRs()]);
  const rows = all.filter((r) => r.date >= range.from && r.date <= to);
  const prev = all.filter((r) => r.date >= range.prevFrom && r.date <= prevTo);

  // ---------- Training ----------
  const typeMin = new Map<string, number>();
  let longest: Recap["training"]["longest"] = null;
  let kcal = 0;
  let sessions = 0;
  for (const r of rows) {
    for (const a of r.activities) {
      sessions++;
      kcal += a.kcal ?? 0;
      const name = a.type ? titleCase(a.type) : "Other";
      typeMin.set(name, (typeMin.get(name) ?? 0) + a.min);
      if (!longest || a.min > longest.minutes) longest = { name: a.name, date: r.date, minutes: Math.round(a.min) };
    }
    // A gym session the watch also recorded counts once (the watch has its real minutes).
    if (r.strengthSets > 0 && !hasStrengthActivity(r)) {
      sessions++;
      // Gym sessions logged in the app: about 2.5 min per working set.
      typeMin.set("Gym", (typeMin.get("Gym") ?? 0) + r.strengthSets * 2.5);
    }
  }
  const minutesOf = (rs: DayRow[]) =>
    Math.round(sum(rs.flatMap((r) => r.activities.map((a) => a.min))) + sum(rs.map((r) => (hasStrengthActivity(r) ? 0 : r.strengthSets * 2.5))));
  const minutes = minutesOf(rows);
  const typeTotal = sum([...typeMin.values()]) || 1;
  const types = [...typeMin.entries()]
    .map(([name, m]) => ({ name, minutes: Math.round(m), pct: Math.round((m / typeTotal) * 100) }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 4);

  const rhythm =
    range.period === "year"
      ? Array.from({ length: 12 }, (_, m) => ({
          label: format(new Date(2000, m, 1), "MMM"),
          minutes: minutesOf(rows.filter((r) => Number(r.date.slice(5, 7)) === m + 1)),
        }))
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, k) => ({
          label,
          minutes: minutesOf(rows.filter((r) => (parseISO(r.date).getDay() + 6) % 7 === k)),
        }));
  const top = [...rhythm].sort((a, b) => b.minutes - a.minutes)[0];
  const bestRhythm = top && top.minutes > 0 ? top.label : null;

  const grid = rows.map((r) => {
    const t = isActive(r);
    const f = r.mealCount > 0 || r.skippedCount > 0;
    return { date: r.date, v: (t && f ? 3 : t ? 2 : f ? 1 : 0) as 0 | 1 | 2 | 3 };
  });

  // ---------- PRs (current records set in this period) ----------
  const prsIn = prs.filter((p) => p.date >= range.from && p.date <= to);
  const bestPr = prsIn.sort((a, b) => b.e1rm - a.e1rm)[0];

  // ---------- Food ----------
  const logged = rows.filter((r) => isFullyLogged({ date: r.date, calories: r.intakeKcal, count: r.mealCount, skipped: r.skippedCount }));
  const names = mealNames.filter((m) => m.date >= range.from && m.date <= to);
  const counts = new Map<string, number>();
  for (const m of names) counts.set(m.name, (counts.get(m.name) ?? 0) + 1);
  const goToEntry = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const biggest = [...names].sort((a, b) => b.calories - a.calories)[0];

  // ---------- Sleep, steps, battery, weight ----------
  const slept = rows.filter((r) => r.sleepSec != null);
  const scored = slept.filter((r) => r.sleepScore != null);
  const bestNight = [...scored].sort((a, b) => b.sleepScore! - a.sleepScore!)[0];
  const stepDays = rows.filter((r) => r.steps != null && r.steps > 0);
  const bestSteps = [...stepDays].sort((a, b) => b.steps! - a.steps!)[0];
  const weighed = rows.filter((r) => r.weight != null);

  const activeDays = rows.filter(isActive).length;
  const hasData = activeDays > 0 || logged.length > 0 || slept.length > 0 || stepDays.length > 0;

  return {
    range,
    hasData,
    training: {
      activeDays,
      days: rows.length,
      prevActiveDays: prev.filter(isActive).length,
      sessions,
      gymSessions: rows.filter((r) => r.strengthSets > 0).length,
      minutes,
      prevMinutes: minutesOf(prev),
      kcal: Math.round(kcal),
      sets: sum(rows.map((r) => r.strengthSets)),
      volumeKg: Math.round(sum(rows.map((r) => r.strengthVolume))),
      types,
      longest,
      rhythm,
      bestRhythm,
      grid,
    },
    prs: {
      count: prsIn.length,
      best: bestPr ? { name: bestPr.exerciseName, weight: bestPr.weight, reps: bestPr.reps, date: bestPr.date } : null,
    },
    food: {
      daysLogged: rows.filter((r) => r.mealCount > 0 || r.skippedCount > 0).length,
      meals: sum(rows.map((r) => r.mealCount)),
      skipped: sum(rows.map((r) => r.skippedCount)),
      avgKcal: logged.length ? Math.round(avg(logged.map((r) => r.intakeKcal))!) : null,
      avgProtein: logged.length ? Math.round(avg(logged.map((r) => r.protein))!) : null,
      goTo: goToEntry && goToEntry[1] >= 2 ? { name: goToEntry[0], count: goToEntry[1] } : null,
      biggest: biggest ? { name: biggest.name, kcal: Math.round(biggest.calories), date: biggest.date } : null,
    },
    sleep: {
      nights: slept.length,
      avgHours: slept.length ? r1(avg(slept.map((r) => r.sleepSec! / 3600))!) : null,
      avgScore: scored.length ? Math.round(avg(scored.map((r) => r.sleepScore!))!) : null,
      prevAvgHours: (() => {
        const p = prev.filter((r) => r.sleepSec != null);
        return p.length ? r1(avg(p.map((r) => r.sleepSec! / 3600))!) : null;
      })(),
      best: bestNight ? { date: bestNight.date, score: bestNight.sleepScore!, hours: bestNight.sleepSec ? r1(bestNight.sleepSec / 3600) : null } : null,
    },
    steps: {
      total: Math.round(sum(stepDays.map((r) => r.steps!))),
      avgPerDay: stepDays.length ? Math.round(avg(stepDays.map((r) => r.steps!))!) : null,
      best: bestSteps ? { date: bestSteps.date, steps: Math.round(bestSteps.steps!) } : null,
    },
    battery: { avgWake: (() => { const v = rows.map((r) => r.bbWake).filter((x): x is number => x != null); return v.length ? Math.round(avg(v)!) : null; })() },
    weight: {
      start: weighed[0]?.weight ?? null,
      end: weighed[weighed.length - 1]?.weight ?? null,
      change: weighed.length >= 2 ? r1(weighed[weighed.length - 1].weight! - weighed[0].weight!) : null,
    },
  };
}
