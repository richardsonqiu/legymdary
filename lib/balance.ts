/**
 * Calorie balance over a week, month or year: what you ate minus what you
 * burned, on days with a full food log, turned into an estimated weight
 * change (7,700 kcal ≈ 1 kg) and set against what the scale did.
 * Pure functions (no database), shared by the server page and tests.
 */
import { isFullyLogged } from "@/lib/energy";
import { KCAL_PER_KG } from "@/lib/nutrition";
import { addDaysStr } from "@/lib/utils";

export type BalanceDay = { date: string; eaten: number; meals: number; skipped: number; burned: number | null };
export type Period = "week" | "month" | "year";
export const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, year: 365 };

export type Balance = {
  period: Period;
  from: string;
  to: string;
  days: number;
  /** Days with a full food log and a burn figure. */
  counted: number;
  eaten: number;
  burned: number;
  /** eaten − burned over counted days (negative = deficit). */
  balance: number;
  avgDaily: number | null;
  /** Estimated change from the balance, kg. */
  estimateKg: number | null;
  /** Weight change on the scale over the period (trend line), kg. */
  scale: { change: number; from: number; to: number; weighIns: number } | null;
  /** Days the estimate and the scale are compared over. */
  compareDays: number;
  /** Burn came from the plan's maintenance estimate (no watch data). */
  estimatedBurn: boolean;
  bars: { label: string; value: number | null; date: string }[];
};

/** Least-squares slope (kg/day) of weigh-ins. */
function slope(points: { x: number; y: number }[]): number | null {
  if (points.length < 2) return null;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  const my = points.reduce((a, p) => a + p.y, 0) / n;
  const den = points.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  if (!den) return null;
  return points.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / den;
}

const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function computeBalance(
  period: Period,
  today: string,
  days: BalanceDay[],
  weights: { date: string; weight: number }[],
  /** Used as the burn on days without watch data (the plan's maintenance), or null. */
  fallbackBurn: number | null,
): Balance {
  const n = PERIOD_DAYS[period];
  const to = addDaysStr(today, -1); // complete days only
  const from = addDaysStr(today, -n);
  const by = new Map(days.map((d) => [d.date, d]));
  let eaten = 0;
  let burned = 0;
  let counted = 0;
  let estimatedBurn = false;
  const perDay: { date: string; value: number | null }[] = [];
  for (let d = from; d <= to; d = addDaysStr(d, 1)) {
    const r = by.get(d);
    const full = r && isFullyLogged({ date: d, calories: r.eaten, count: r.meals, skipped: r.skipped });
    const burn = r?.burned != null && r.burned > 800 ? r.burned : fallbackBurn;
    if (full && burn != null) {
      if (r!.burned == null || r!.burned <= 800) estimatedBurn = true;
      eaten += r!.eaten;
      burned += burn;
      counted++;
      perDay.push({ date: d, value: r!.eaten - burn });
    } else perDay.push({ date: d, value: null });
  }
  const balance = Math.round(eaten - burned);

  let bars: Balance["bars"];
  if (period === "year") {
    const months = new Map<string, number[]>();
    for (const p of perDay) {
      const k = p.date.slice(0, 7);
      if (!months.has(k)) months.set(k, []);
      if (p.value != null) months.get(k)!.push(p.value);
    }
    bars = [...months.entries()].map(([k, v]) => ({
      date: `${k}-01`,
      label: MONTHS[Number(k.slice(5, 7)) - 1],
      value: v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null,
    }));
  } else {
    bars = perDay.map((p) => ({ date: p.date, label: String(Number(p.date.slice(8, 10))), value: p.value != null ? Math.round(p.value) : null }));
  }

  const ws = weights.filter((w) => w.date >= from && w.date <= today).sort((x, y) => x.date.localeCompare(y.date));
  const sl = slope(ws.map((w) => ({ x: dayNum(w.date), y: w.weight })));
  const span = ws.length >= 2 ? dayNum(ws[ws.length - 1].date) - dayNum(ws[0].date) : 0;
  // Compare over the stretch the weigh-ins cover (the whole period when they span most of it).
  const compareDays = span >= n * 0.6 ? n : Math.max(1, span);
  const scale =
    sl != null && span >= Math.min(5, n - 2)
      ? {
          change: Math.round(sl * compareDays * 10) / 10,
          from: ws[0].weight,
          to: ws[ws.length - 1].weight,
          weighIns: ws.length,
        }
      : null;

  return {
    period,
    from,
    to,
    days: n,
    counted,
    eaten: Math.round(eaten),
    burned: Math.round(burned),
    balance,
    avgDaily: counted ? Math.round(balance / counted) : null,
    // Scale the counted days up to the whole period so it compares with the scale.
    estimateKg: counted >= 3 ? Math.round(((balance / counted) * compareDays * 10) / KCAL_PER_KG) / 10 : null,
    compareDays,
    scale,
    estimatedBurn,
    bars,
  };
}

/** A plain sentence comparing the logs' estimate with the scale. */
export function balanceVerdict(b: Balance, direction: "lose" | "gain" | "maintain"): string | null {
  if (b.estimateKg == null || !b.scale) return null;
  const e = b.estimateKg;
  const a = b.scale.change;
  const close = Math.abs(a - e) <= Math.max(0.3, Math.abs(e) * 0.5);
  if (close) return "Your scale agrees with your food log and burn. Keep going.";
  if (direction === "gain") {
    return a < e
      ? "You gained less than your logs suggest. Hard training days burn more than they seem; try eating a little more on those days."
      : "You gained more than your logs suggest. Often water or a few unlogged snacks; it evens out over a few weeks.";
  }
  return a > e
    ? "The scale moved less than your logs suggest. Common reasons: unlogged snacks or drinks, bigger portions than logged, or water held after hard training or salty meals."
    : "The scale dropped more than your logs suggest. Often water; it evens out over a few weeks.";
}
