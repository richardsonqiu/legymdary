import { addDaysStr } from "@legymdary/shared";
import { buildAnalysis, latestDataDate } from "@/lib/analysis/service";
import type { EnergyContext } from "@/lib/energy-data";

/**
 * Last night's recovery card for Home (web and mobile).
 *
 * Shows the newest night. The night before only stands in while today's sync
 * hasn't landed; once today's data is in without a night, the watch wasn't
 * worn to bed and `noSleepLastNight` is set instead.
 */
export async function homeRecovery(
  userId: string,
  energy: EnergyContext,
  today: string,
): Promise<{ card: Awaited<ReturnType<typeof buildAnalysis>>["card"] | null; noSleepLastNight: boolean }> {
  if (!energy.wearable) return { card: null, noSleepLastNight: false };
  const todaySynced = energy.garminDays.some((d) => d.date === today);
  const latest = await latestDataDate(userId);
  if (latest >= today || (latest === addDaysStr(today, -1) && !todaySynced)) {
    return { card: (await buildAnalysis(userId, latest)).card, noSleepLastNight: false };
  }
  return { card: null, noSleepLastNight: todaySynced };
}
