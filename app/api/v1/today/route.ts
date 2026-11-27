import type { TodayResponse } from "@legymdary/shared";
import { hasHealthConnectData } from "@/lib/apple-health/store";
import { getEnergyContext } from "@/lib/energy-data";
import { getActiveWorkout, getDailyTotals, getMealSlots } from "@/lib/queries";
import { userToday } from "@/lib/session";
import { dateParam, ok, route } from "@/lib/services/http";
import { homeRecovery } from "@/lib/services/home-recovery";

/** Food totals against the day's target, meal slots, readiness and the open workout. */
export const GET = route(async (request, { userId }) => {
  const today = await userToday();
  const date = dateParam(new URL(request.url), "date", today);
  const [energy, totals, slots, active, hc] = await Promise.all([
    getEnergyContext(),
    getDailyTotals(date, date),
    getMealSlots(date),
    getActiveWorkout(),
    hasHealthConnectData(userId),
  ]);
  const eaten = totals[0] ?? { date, calories: 0, protein: 0, carbs: 0, fat: 0, count: 0, skipped: 0 };
  let scores: TodayResponse["scores"] = null;
  if (date === today) {
    const { card, noSleepLastNight } = await homeRecovery(userId, energy, today);
    const r = card?.readiness ?? null;
    scores = {
      readiness: r
        ? {
            score: r.score,
            band: r.band,
            label: r.label,
            factors: [...r.contributors].sort((a, b) => b.weight - a.weight).slice(0, 3).map((c) => ({ label: c.label, score: c.score })),
          }
        : null,
      sleepScore: card?.lastNight.sleepScore ?? null,
      sleepHours: card?.lastNight.sleepHours != null ? Math.round(card.lastNight.sleepHours * 10) / 10 : null,
      battery: card?.bodyBattery?.wake ?? null,
      steps: energy.garminDays.find((d) => d.date === today)?.steps ?? null,
      stepGoal: 8000,
      noSleepLastNight,
      source: energy.garmin || energy.oura || energy.healthConnect || hc ? "sync" : energy.appleHealth ? "apple_upload" : "none",
    };
  }
  const body: TodayResponse = {
    date,
    eaten,
    targets: date === today ? energy.targets : (energy.targetsByDate[date] ?? null),
    bonus: energy.bonusByDate[date] ?? 0,
    logged: slots.logged,
    skipped: slots.skipped,
    readiness: energy.readinessByDate[date] ?? null,
    wearable: energy.wearable || hc,
    steps: energy.garminDays.find((d) => d.date === date)?.steps ?? null,
    activeWorkoutId: active?.id ?? null,
    scores,
  };
  return ok(body);
});
