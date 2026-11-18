import { PageTransition } from "@/components/PageTransition";
import { FoodDiary } from "@/components/food/FoodDiary";
import { PageHeader } from "@/components/ui";
import { activityBonus } from "@/lib/energy";
import { getEnergyContext } from "@/lib/energy-data";
import { AutoRefresh } from "@/components/AutoRefresh";
import { scheduleGarminSync } from "@/lib/garmin/background";
import { requireUserId, userToday } from "@/lib/session";
import {
  getAiUsageSince,
  getGarminDaily,
  getMeals,
  getRecentMeals,
  getSkippedMeals,
  getMenu,
} from "@/lib/queries";
import { addDaysStr } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Food" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function FoodPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const requested =
    typeof sp.date === "string" && DATE_RE.test(sp.date) ? sp.date : null;
  // Without ?date= the client picks "today" in its own timezone, which is at
  // most a day away from the server's — so load a 3-day window around it.
  const center = requested ?? (await userToday());
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [meals, energy, recentMeals, aiSpend, garminDays, userId, skipped, menu] = await Promise.all([
    getMeals(addDaysStr(center, -1), addDaysStr(center, 1)),
    getEnergyContext(),
    getRecentMeals(8),
    getAiUsageSince(monthStart),
    getGarminDaily(addDaysStr(center, -1), addDaysStr(center, 1)),
    requireUserId(),
    getSkippedMeals(addDaysStr(center, -1), addDaysStr(center, 1)),
    getMenu(),
  ]);
  const garminSyncing = scheduleGarminSync(userId, energy.garmin);
  const plan = energy.plan;
  const adjust = !!energy.garmin?.adjustForActivity && !!energy.targets && !plan.usingOverride;
  const garminByDate: Record<string, { burned: number | null; bonus: number }> = {};
  for (const d of garminDays) {
    garminByDate[d.date] = {
      burned: d.totalKcal,
      bonus: adjust ? activityBonus(d.activeKcal, energy.garminMaint?.avgActive ?? null) : 0,
    };
  }

  return (
    <PageTransition className="space-y-0">
      {garminSyncing && <AutoRefresh />}
      <PageHeader
        title="Food"
        subtitle="Take a photo and get the calories"
      />
      <FoodDiary
        meals={meals}
        recentMeals={recentMeals}
        aiSpend={{ calls: aiSpend.calls, costUsd: aiSpend.costUsd }}
        requestedDate={requested}
        targets={energy.targets}
        skipped={skipped}
        menu={menu}
        garminByDate={energy.garmin ? garminByDate : null}
        planMissing={plan.calorieTarget == null}
        macroSplitNote={plan.macroBasis === "percent"}
      />
    </PageTransition>
  );
}
