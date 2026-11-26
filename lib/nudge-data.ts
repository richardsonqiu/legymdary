import type { EnergyContext } from "@/lib/energy-data";
import { pickNudge, type Nudge, type NudgeDay, addDaysStr } from "@legymdary/shared";

/** The popup to show (if any), from data the page already loaded. */
export function nudgeFrom(energy: EnergyContext, today: string): Nudge | null {
  if (energy.plan.calorieTarget == null) return null;
  const intake = new Map(energy.intake.map((d) => [d.date, d]));
  const burn = new Map(energy.garminDays.map((d) => [d.date, d]));
  const days: NudgeDay[] = [];
  for (let d = addDaysStr(today, -35); d <= today; d = addDaysStr(d, 1)) {
    const i = intake.get(d);
    const g = burn.get(d);
    const t = d === today ? energy.targets : energy.targetsByDate[d];
    days.push({
      date: d,
      eaten: i?.calories ?? 0,
      meals: i?.count ?? 0,
      skipped: i?.skipped ?? 0,
      target: t ? t.calories + (energy.bonusByDate[d] ?? 0) : null,
      burned: g?.totalKcal != null && g.totalKcal > 800 ? g.totalKcal : null,
      active: g?.activeKcal ?? null,
    });
  }
  return pickNudge({
    today,
    direction: energy.plan.direction,
    mode: energy.targetMode,
    days,
    avgActive: energy.garminMaint?.avgActive ?? null,
    avgBurn: energy.garminMaint?.kcal ?? energy.plan.tdee ?? null,
    weights: energy.weights,
    todayBonus: energy.bonusByDate[today] ?? 0,
  });
}
