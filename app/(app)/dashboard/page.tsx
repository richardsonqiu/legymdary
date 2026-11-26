import Link from "next/link";
import { PageTransition } from "@/components/PageTransition";
import { AccountMenu } from "@/components/AccountMenu";
import { DashboardHeading } from "@/components/DashboardHeading";
import { StreaksCard } from "@/components/consistency/StreaksCard";
import { TodayGuide, type GuideInput } from "@/components/guide/TodayGuide";
import { SleepSummaryCard } from "@/components/insights/SleepSummaryCard";
import { RecapBanner } from "@/components/recap/RecapTiles";
import {
  TodayScores,
  type TodayScoresInput,
} from "@/components/score/TodayScores";
import { buildAnalysis, latestDataDate } from "@/lib/analysis/service";
import { sceneFor, sceneStyle } from "@/lib/scenes";
import { compareScans, parseSegments, segmentBalance } from "@/lib/body-scan";
import { WorkoutSummary } from "@/components/WorkoutSummary";
import { DumbbellIcon, TrophyIcon, WatchIcon, CalendarIcon, ChevronRightIcon } from "@/components/icons";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import {
  getActiveWorkout,
  getDailyTotals,
  getLastFinishedWorkout,
  getPRsThisWeek,
  getBodyScans,
  getConsistencyDays,
  getLatestGarminActivity,
  getMealSlots,
} from "@/lib/queries";
import { GarminActivityList } from "@/components/garmin/GarminActivityList";
import { getEnergyContext } from "@/lib/energy-data";
import { AutoRefresh } from "@/components/AutoRefresh";
import { scheduleGarminSync } from "@/lib/garmin/background";
import { scheduleOuraSync } from "@/lib/oura/background";
import { NudgePopup } from "@/components/nudge/NudgePopup";
import { nudgeFrom } from "@/lib/nudge-data";
import { getSessionUser, userToday } from "@/lib/session";
import {
  addDaysStr,
  formatShort,
  kg,
} from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

export default async function DashboardPage() {
  const serverToday = (await userToday());
  const [
    consistencyDays,
    active,
    lastFinished,
    prsThisWeek,
    user,
    foodTotals,
    energy,
    scans,
    latestActivity,
    slots,
  ] = await Promise.all([
    getConsistencyDays(
      addDaysStr(serverToday, -380),
      addDaysStr(serverToday, 1),
    ),
    getActiveWorkout(),
    getLastFinishedWorkout(),
    getPRsThisWeek(),
    getSessionUser(),
    getDailyTotals(addDaysStr(serverToday, -1), addDaysStr(serverToday, 1)),
    getEnergyContext(),
    getBodyScans(),
    getLatestGarminActivity(),
    getMealSlots(serverToday),
  ]);
  const foodTargets = energy.targets;

  // ---- Score rings + readiness hero (recovery needs Garmin) ----
  let card: Awaited<ReturnType<typeof buildAnalysis>>["card"] | null = null;
  if (energy.wearable && user?.id) {
    const latest = await latestDataDate(user.id);
    // Only show recovery for last night (or the night before if today's sync hasn't landed yet).
    if (latest >= addDaysStr(serverToday, -1))
      card = (await buildAnalysis(user.id, latest)).card;
  }
  const todayGarmin =
    energy.garminDays.find((d) => d.date === serverToday) ?? null;
  const todayFood = foodTotals.find((d) => d.date === serverToday);
  const scores: TodayScoresInput = {
    readiness: card?.readiness ?? null,
    sleepScore: card?.lastNight.sleepScore ?? null,
    sleepHours:
      card?.lastNight.sleepHours != null
        ? Math.round(card.lastNight.sleepHours * 10) / 10
        : null,
    eaten: Math.round(todayFood?.calories ?? 0),
    kcalTarget: foodTargets?.calories ?? null,
    steps: todayGarmin?.steps ?? null,
    stepGoal: 8000,
    battery: card?.bodyBattery?.wake ?? null,
    garminConnected: !!energy.garmin || !!energy.oura,
    appleHealth: !energy.garmin && !energy.oura && !!energy.appleHealth,
  };

  // ---- Inputs for the plain-language "Today" guide ----
  const { plan, body, goals } = energy;
  const [scanCur, scanPrev] = [
    scans[scans.length - 1],
    scans[scans.length - 2],
  ];
  const scanChange =
    scanCur && scanPrev ? compareScans(scanPrev, scanCur) : null;
  const legGap = scanCur
    ? segmentBalance(parseSegments(scanCur.segmentalLean))?.upperLowerGap
    : null;
  const recentSleep = energy.garminDays.filter(
    (d) => d.date >= addDaysStr(serverToday, -6) && d.sleepSeconds != null,
  );
  const sleepDebt =
    recentSleep.length >= 3
      ? Math.round(
          recentSleep.reduce(
            (a, d) => a + Math.max(0, 450 - d.sleepSeconds! / 60),
            0,
          ) / 6,
        ) / 10
      : null;
  const guide: GuideInput = {
    weight: body.weight,
    weightDate: body.weightDate,
    bodyFat: body.bodyFat,
    bodyFatSource: body.bodyFatSource,
    scan: scanCur
      ? {
          date: scanCur.date,
          muscleChange: scanChange?.muscle ?? null,
          fatChange: scanChange?.fat ?? null,
          legAdvice: (legGap ?? 0) >= 8,
        }
      : null,
    goalText:
      plan.goalWeight != null
        ? `${Math.round(plan.goalWeight * 10) / 10} kg${goals?.targetBodyFat ? ` at ${goals.targetBodyFat}% body fat` : ""}`
        : null,
    eta:
      plan.weeksToGoal != null
        ? addDaysStr(serverToday, Math.ceil(plan.weeksToGoal * 7))
        : null,
    weeklyRate:
      plan.direction === "maintain"
        ? null
        : Math.round(plan.effectiveWeeklyRate * 10) / 10,
    direction: plan.direction,
    targets: foodTargets,
    hasGoal:
      !!goals &&
      (goals.targetWeight != null ||
        goals.targetBodyFat != null ||
        goals.calorieOverride != null),
    totals: foodTotals,
    consistency: consistencyDays,
    readinessByDate: energy.readinessByDate,
    sleepDebtHours: sleepDebt,
    garminConnected: energy.wearable,
    loggedSlots: slots.logged,
    skippedSlots: slots.skipped,
    hasMeal: consistencyDays.some((d) => d.meals > 0),
    hasWorkout: consistencyDays.some((d) => d.sets > 0 || d.garmin > 0),
    hasScan: scans.length > 0,
  };
  const garminSyncing = user?.id
    ? [scheduleGarminSync(user.id, energy.garmin), scheduleOuraSync(user.id, energy.oura)].some(Boolean)
    : false;
  const firstName = user?.name?.split(" ")[0] ?? null;

  return (
    <PageTransition className="relative isolate space-y-6">
      {/* Dawn landscape behind the top of Home, fading into the page. */}
      <div
        aria-hidden
        className="home-backdrop pointer-events-none absolute -inset-x-4 -top-[max(1.5rem,env(safe-area-inset-top))] -z-10 h-[680px]"
        style={sceneStyle(sceneFor(serverToday))}
      />
      {garminSyncing && <AutoRefresh />}
      <header className="flex items-start justify-between gap-3">
        <DashboardHeading firstName={firstName} />
        <AccountMenu name={user?.name} email={user?.email} />
      </header>

      <TodayScores s={scores} />

      <RecapBanner
        today={serverToday}
        hasWeek={consistencyDays.some(
          (d) =>
            d.date >= addDaysStr(serverToday, -7 - ((new Date(`${serverToday}T12:00:00`).getDay() + 6) % 7)) &&
            d.date < addDaysStr(serverToday, -((new Date(`${serverToday}T12:00:00`).getDay() + 6) % 7)) &&
            (d.sets > 0 || d.garmin > 0 || d.meals > 0 || d.skipped > 0),
        )}
        hasMonth={consistencyDays.some(
          (d) => d.date.slice(0, 7) === addDaysStr(`${serverToday.slice(0, 7)}-01`, -1).slice(0, 7) && (d.sets > 0 || d.garmin > 0 || d.meals > 0),
        )}
      />

      {card?.sleep && <SleepSummaryCard s={card.sleep} compact />}

      <NudgePopup nudge={nudgeFrom(energy, serverToday)} />
      {energy.review?.decision === "pending" && energy.review.suggested != null && (
        <Link
          href="/plan#review"
          transitionTypes={["nav-forward"]}
          className="press flex items-center gap-3 rounded-2xl border border-sky-300/25 bg-sky-300/[0.07] px-4 py-3 text-sm"
        >
          <CalendarIcon className="h-5 w-5 shrink-0 text-sky-200" />
          <span className="min-w-0 flex-1">
            <b>{energy.review.cadence === "monthly" ? "Monthly" : "Weekly"} review ready</b>
            <span className="block text-xs tabular-nums text-sky-100/80">
              {energy.review.current.toLocaleString("en-US")} → {energy.review.suggested.toLocaleString("en-US")} kcal suggested
            </span>
          </span>
          <ChevronRightIcon className="h-4 w-4 text-sky-200/70" />
        </Link>
      )}
      <TodayGuide g={guide} />

      <StreaksCard
        days={consistencyDays}
        active={
          active ? { name: active.name, count: active.exerciseCount } : null
        }
      />

      {!energy.wearable && (
        <Link
          href="/connect"
          transitionTypes={["nav-forward"]}
          className="flex items-center gap-3 rounded-2xl border border-dashed border-zinc-700 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-900/50"
        >
          <WatchIcon className="h-5 w-5 shrink-0 text-zinc-500" />
          <span>
            <b>Connect Garmin or Apple Watch</b>
            <span className="block text-xs text-zinc-500">
              See calories in vs out, recovery and your real maintenance
              calories.
            </span>
          </span>
        </Link>
      )}

      {/* Last workout */}
      <section>
        <SectionTitle
          action={
            <Link
              href="/history"
              transitionTypes={["nav-forward"]}
              className="text-xs text-zinc-400"
            >
              History →
            </Link>
          }
        >
          Last workout
        </SectionTitle>
        {latestActivity || lastFinished ? (
          <div className="space-y-2">
            {/* Newest first: a Garmin activity (tap for full stats) and/or the last gym session. */}
            {latestActivity &&
              (!lastFinished || latestActivity.date >= lastFinished.date) && (
                <GarminActivityList activities={[latestActivity]} />
              )}
            {lastFinished && (
              <Card>
                <WorkoutSummary workout={lastFinished} />
              </Card>
            )}
            {latestActivity &&
              lastFinished &&
              latestActivity.date < lastFinished.date && (
                <GarminActivityList activities={[latestActivity]} />
              )}
          </div>
        ) : (
          <EmptyState
            icon={<DumbbellIcon className="h-6 w-6" />}
            title="No workouts yet"
            description="Log a gym session in Workout, or connect Garmin to bring in runs, rides and more."
          />
        )}
      </section>

      {/* PRs this week */}
      {prsThisWeek.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link
                href="/prs"
                transitionTypes={["nav-forward"]}
                className="text-xs text-zinc-400"
              >
                All PRs →
              </Link>
            }
          >
            PRs hit this week
          </SectionTitle>
          <ul className="space-y-2">
            {prsThisWeek.map((p) => (
              <li
                key={p.exerciseId}
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100/10 text-zinc-200">
                    <TrophyIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {p.exerciseName}
                    </div>
                    <div className="text-xs tabular-nums text-zinc-500">
                      {kg(p.weight)} kg × {p.reps} · {formatShort(p.date)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">
                    {kg(p.e1rm)} kg
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    est 1RM
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageTransition>
  );
}
