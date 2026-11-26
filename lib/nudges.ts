/**
 * Picks at most one popup ("nudge") to show: a big-burn celebration, an
 * on-track cheer, or an off-track warning. Pure rules, no database.
 *
 * - burn: today's active calories are well above your usual. Earned =
 *   half the extra (watch estimates run high), capped at 600 kcal.
 * - onTrack: over the last 7 days your balance points the way your goal
 *   does (deficit to lose, surplus to gain) and the scale agrees or is flat.
 * - offTrack: 3 or more of the last 5 logged days were over target by 10%+
 *   (under, when gaining) and activity was at or below usual.
 */
import { isFullyLogged } from "@/lib/energy";
import { addDaysStr } from "@/lib/utils";

export type NudgeDay = {
  date: string;
  eaten: number;
  meals: number;
  skipped: number;
  target: number | null;
  burned: number | null;
  active: number | null;
};

export type Nudge =
  | {
      kind: "burn";
      id: string;
      extra: number;
      earned: number;
      /** Big-burn days so far this month, including today. */
      monthCount: number;
      claimed: number;
      canClaim: boolean;
    }
  | { kind: "onTrack"; id: string; weekBalance: number; kgChange: number | null; streak: number; direction: "lose" | "gain" }
  | { kind: "offTrack"; id: string; overDays: number; of: number; avgOver: number; direction: "lose" | "gain"; lowActivity: boolean };

const BIG_BURN = 250;

export function earnedFrom(active: number | null, avgActive: number | null) {
  if (active == null || avgActive == null) return { extra: 0, earned: 0 };
  const extra = Math.round(active - avgActive);
  if (extra < BIG_BURN) return { extra, earned: 0 };
  return { extra, earned: Math.min(600, Math.round((extra * 0.5) / 10) * 10) };
}

/** Days in a row (ending yesterday) logged and within target (lose: ≤ +5%; gain: ≥ −5%). */
export function targetStreak(days: NudgeDay[], today: string, direction: "lose" | "gain" | "maintain"): number {
  const by = new Map(days.map((d) => [d.date, d]));
  let n = 0;
  for (let d = addDaysStr(today, -1); ; d = addDaysStr(d, -1)) {
    const r = by.get(d);
    if (!r || r.target == null || !isFullyLogged({ date: d, calories: r.eaten, count: r.meals, skipped: r.skipped })) break;
    const ok = direction === "gain" ? r.eaten >= r.target * 0.95 : direction === "lose" ? r.eaten <= r.target * 1.05 : Math.abs(r.eaten - r.target) <= r.target * 0.1;
    if (!ok) break;
    n++;
    if (n > 365) break;
  }
  return n;
}

function slopePerWeek(ws: { date: string; weight: number }[]): number | null {
  if (ws.length < 3) return null;
  const x = ws.map((w) => Date.parse(`${w.date}T00:00:00Z`) / 86_400_000);
  const mx = x.reduce((a, b) => a + b, 0) / x.length;
  const my = ws.reduce((a, w) => a + w.weight, 0) / ws.length;
  const den = x.reduce((a, v) => a + (v - mx) ** 2, 0);
  if (!den || x[x.length - 1] - x[0] < 7) return null;
  return (x.reduce((a, v, i) => a + (v - mx) * (ws[i].weight - my), 0) / den) * 7;
}

export function pickNudge(input: {
  today: string;
  direction: "lose" | "gain" | "maintain";
  mode: "steady" | "adaptive";
  days: NudgeDay[];
  avgActive: number | null;
  avgBurn: number | null;
  weights: { date: string; weight: number }[];
  /** Bonus already on today's target. */
  todayBonus: number;
}): Nudge | null {
  const { today, direction } = input;
  const by = new Map(input.days.map((d) => [d.date, d]));
  const t = by.get(today);

  // 1) Big burn today: celebrate.
  const { extra, earned } = earnedFrom(t?.active ?? null, input.avgActive);
  if (earned > 0) {
    const month = today.slice(0, 7);
    const monthCount = input.days.filter((d) => d.date.startsWith(month) && earnedFrom(d.active, input.avgActive).earned > 0).length;
    return {
      kind: "burn",
      id: `burn:${today}`,
      extra,
      earned,
      monthCount,
      claimed: input.todayBonus,
      canClaim: input.mode === "steady",
    };
  }

  if (direction === "maintain") return null;

  // 2) Off track: most recent logged days miss the goal and activity is low.
  const logged = input.days
    .filter((d) => d.date < today && d.target != null && isFullyLogged({ date: d.date, calories: d.eaten, count: d.meals, skipped: d.skipped }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  if (logged.length >= 4) {
    const miss = logged.filter((d) => (direction === "lose" ? d.eaten > d.target! * 1.1 : d.eaten < d.target! * 0.9));
    const burns = logged.map((d) => d.burned).filter((b): b is number => b != null);
    const lowActivity =
      input.avgBurn != null && burns.length >= 2 ? burns.reduce((a, b) => a + b, 0) / burns.length <= input.avgBurn * 1.02 : true;
    if (miss.length >= 3 && (direction === "gain" || lowActivity)) {
      const avgOver = Math.round(miss.reduce((a, d) => a + (d.eaten - d.target!), 0) / miss.length);
      return { kind: "offTrack", id: `off:${today}`, overDays: miss.length, of: logged.length, avgOver, direction, lowActivity };
    }
  }

  // 3) On track this week: balance and scale point the right way.
  let bal = 0;
  let counted = 0;
  for (let d = addDaysStr(today, -7); d < today; d = addDaysStr(d, 1)) {
    const r = by.get(d);
    const burn = r?.burned ?? input.avgBurn;
    if (r && burn != null && isFullyLogged({ date: d, calories: r.eaten, count: r.meals, skipped: r.skipped })) {
      bal += r.eaten - burn;
      counted++;
    }
  }
  const slope = slopePerWeek(input.weights.filter((w) => w.date >= addDaysStr(today, -21)));
  const balanceOk = direction === "lose" ? bal < -500 : bal > 500;
  const scaleOk = slope == null || (direction === "lose" ? slope <= 0.05 : slope >= -0.05);
  if (counted >= 4 && balanceOk && scaleOk) {
    // Once a week (ISO-ish week key from the Monday).
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
    return {
      kind: "onTrack",
      id: `on:${addDaysStr(today, -dow)}`,
      weekBalance: Math.round(bal),
      kgChange: slope != null ? Math.round(slope * 10) / 10 : null,
      streak: targetStreak(input.days, today, direction),
      direction,
    };
  }
  return null;
}
