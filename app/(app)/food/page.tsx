import { PageTransition } from "@/components/PageTransition";
import { FoodDiary } from "@/components/food/FoodDiary";
import { PageHeader } from "@/components/ui";
import { activityBonus, addDaysStr, mealRegularity } from "@legymdary/shared";
import { getEnergyContext } from "@/lib/energy-data";
import { AutoRefresh } from "@/components/AutoRefresh";
import { scheduleGarminSync } from "@/lib/garmin/background";
import { scheduleOuraSync } from "@/lib/oura/background";
import { NudgePopup } from "@/components/nudge/NudgePopup";
import { nudgeFrom } from "@/lib/nudge-data";
import { requireUserId, userToday } from "@/lib/session";
import {
  getTimedMeals,
  getGarminDaily,
  getMeals,
  getRecentMeals,
  getSkippedMeals,
  getMenu,
} from "@/lib/queries";
import { MealRhythm } from "@/components/meal/MealRhythm";

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
  const serverToday = await userToday();
  const center = requested ?? serverToday;
  const [meals, energy, recentMeals, garminDays, userId, skipped, menu] = await Promise.all([
    getMeals(addDaysStr(center, -1), addDaysStr(center, 1)),
    getEnergyContext(),
    getRecentMeals(40),
    getGarminDaily(addDaysStr(center, -1), addDaysStr(center, 1)),
    requireUserId(),
    getSkippedMeals(addDaysStr(center, -1), addDaysStr(center, 1)),
    getMenu(),
  ]);
  const timed = await getTimedMeals(addDaysStr(center, -13), center);
  const regularity = mealRegularity(timed);
  const garminSyncing = [scheduleGarminSync(userId, energy.garmin), scheduleOuraSync(userId, energy.oura)].some(Boolean);
  const plan = energy.plan;
  const adjust = !!energy.garmin?.adjustForActivity && !!energy.targets && !plan.usingOverride;
  const garminByDate: Record<string, { burned: number | null; bonus: number }> = {};
  for (const d of garminDays) {
    garminByDate[d.date] = {
      burned: d.totalKcal,
      // Past days keep the bonus they were given (locked with their target).
      bonus:
        d.date < serverToday && energy.targetsByDate[d.date]
          ? (energy.bonusByDate[d.date] ?? 0)
          : (energy.bonusByDate[d.date] ??
            (adjust ? activityBonus(d.activeKcal, energy.garminMaint?.avgActive ?? null) : 0)),
    };
  }

  return (
    <PageTransition className="space-y-0">
      {garminSyncing && <AutoRefresh />}
      {!requested && <NudgePopup nudge={nudgeFrom(energy, serverToday)} />}
      <PageHeader
        title="Food"
        eyebrow="Fuel"
        subtitle="Snap a meal or describe it"
        image="salmon"
        imagePosition="center 55%"
      />
      <FoodDiary
        meals={meals}
        recentMeals={recentMeals}
        requestedDate={requested}
        targets={energy.targets}
        targetsByDate={energy.targetsByDate}
        targetChange={energy.targetChange}
        targetMode={energy.targetMode}
        skipped={skipped}
        menu={menu}
        garminByDate={energy.wearable ? garminByDate : null}
        planMissing={plan.calorieTarget == null}
        macroSplitNote={plan.macroBasis === "percent"}
        editId={typeof sp.edit === "string" && /^\d{1,9}$/.test(sp.edit) ? Number(sp.edit) : null}
      />
      <MealRhythm
        date={center}
        meals={timed.filter((m) => m.date === center)}
        week={timed.filter((m) => m.date >= addDaysStr(center, -6))}
        regularity={regularity}
      />
    </PageTransition>
  );
}
