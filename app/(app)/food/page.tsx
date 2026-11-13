import Link from "next/link";
import { FoodDiary } from "@/components/food/FoodDiary";
import { TargetIcon } from "@/components/icons";
import { PageHeader, buttonClass } from "@/components/ui";
import { activityBonus } from "@/lib/energy";
import { getEnergyContext } from "@/lib/energy-data";
import { syncGarminInBackgroundIfStale } from "@/lib/garmin/background";
import { requireUserId } from "@/lib/session";
import {
  getAiUsageSince,
  getGarminDaily,
  getMeals,
  getRecentMeals,
} from "@/lib/queries";
import { addDaysStr, todayStr } from "@/lib/utils";

export const dynamic = "force-dynamic";

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
  const center = requested ?? todayStr();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [meals, energy, recentMeals, aiSpend, garminDays, userId] = await Promise.all([
    getMeals(addDaysStr(center, -1), addDaysStr(center, 1)),
    getEnergyContext(),
    getRecentMeals(8),
    getAiUsageSince(monthStart),
    getGarminDaily(addDaysStr(center, -1), addDaysStr(center, 1)),
    requireUserId(),
  ]);
  if (energy.garmin) await syncGarminInBackgroundIfStale(userId);
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
    <div>
      <PageHeader
        title="Food"
        subtitle="Snap what you eat — AI estimates the calories"
        action={
          <Link href="/plan" className={buttonClass("secondary", "sm")}>
            <TargetIcon className="h-4 w-4" /> Plan
          </Link>
        }
      />
      <FoodDiary
        meals={meals}
        recentMeals={recentMeals}
        aiSpend={{ calls: aiSpend.calls, costUsd: aiSpend.costUsd }}
        requestedDate={requested}
        targets={energy.targets}
        garminByDate={energy.garmin ? garminByDate : null}
        planMissing={plan.calorieTarget == null}
      />
    </div>
  );
}
