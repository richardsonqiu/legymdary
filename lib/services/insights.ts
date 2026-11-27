import type { InsightsResponse } from "@legymdary/shared";
import { buildAnalysis, latestDataDate } from "@/lib/analysis/service";
import { userToday } from "@/lib/session";
import { addDaysStr } from "@legymdary/shared";
import { UserError } from "./util";

/** The day card and 30-day series the web Insights page shows, as a compact DTO (the AI brief is not included). */
export async function insightsDto(userId: string, requested: string | null): Promise<InsightsResponse> {
  // A day further ahead than tomorrow has no data and would scan the whole history for nothing.
  if (requested && requested > addDaysStr(await userToday(), 1)) throw new UserError("Invalid date");
  const latest = await latestDataDate(userId);
  const date = requested ?? latest;
  const { card, series } = await buildAnalysis(userId, date);
  const n = card.lastNight;
  const y = card.yesterday;
  const r = card.readiness;
  return {
    date,
    latest,
    hasWearableData: card.coverage.garminDays + card.coverage.sleepDays + card.coverage.hrvDays > 0,
    readiness: r
      ? {
          score: r.score,
          band: r.band,
          label: r.label,
          confidence: r.confidence,
          contributors: r.contributors.map((c) => ({ label: c.label, score: c.score, detail: c.detail })),
        }
      : null,
    sleep:
      n.sleepHours != null || card.sleep
        ? {
            hours: n.sleepHours,
            needHours: n.sleepNeedHours,
            score: n.sleepScore,
            bedtime: n.bedtime,
            wake: n.wake,
            hrv: n.hrv,
            hrvUsual: n.hrvUsual,
            restingHr: n.restingHr,
            restingHrUsual: n.restingHrUsual,
            bodyBatteryAtWake: n.bodyBatteryAtWake,
            headline: card.sleep?.headline ?? null,
            verdict: card.sleep?.verdict ?? null,
          }
        : null,
    sleepDebtHours: card.sleepDebtHours,
    yesterday: {
      date: y.date,
      strain: y.strain,
      eatenKcal: y.eatenKcal,
      burnedKcal: y.burnedKcal,
      netKcal: y.netKcal,
      protein: y.protein,
      carbs: y.carbs,
      fat: y.fat,
      meals: y.meals,
      skippedMeals: y.skippedMeals,
      fullyLogged: y.fullyLogged,
      steps: y.steps,
      strengthSets: y.strengthSets,
      activities: y.activities.length,
    },
    energy7d: card.energy7d,
    flags: card.flags,
    patterns: card.patterns.map((p) => p.text),
    coverage: { sleepDays: card.coverage.sleepDays, hrvDays: card.coverage.hrvDays, loggedDays: card.coverage.loggedDays },
    series: series.map((s) => ({ date: s.date, readiness: s.readiness, hrv: s.hrv, rhr: s.rhr, sleepHours: s.sleepHours, eaten: s.eaten, burned: s.burned })),
  };
}
