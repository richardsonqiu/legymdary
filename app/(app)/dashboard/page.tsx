import Link from "next/link";
import { PageTransition } from "@/components/PageTransition";
import { AccountMenu } from "@/components/AccountMenu";
import { DashboardHeading } from "@/components/DashboardHeading";
import { StreaksCard } from "@/components/consistency/StreaksCard";
import { TodayGuide, type GuideInput } from "@/components/guide/TodayGuide";
import { compareScans, parseSegments, segmentBalance } from "@/lib/body-scan";
import { TodayFoodCard } from "@/components/food/TodayFoodCard";
import { EnergyBalanceCard } from "@/components/garmin/EnergyBalanceCard";
import { ReadinessCard } from "@/components/garmin/ReadinessCard";
import { WeeklyCheckin } from "@/components/WeeklyCheckin";
import { WorkoutSummary } from "@/components/WorkoutSummary";
import {
  DumbbellIcon,
  RulerIcon,
  ScaleIcon,
  SparkIcon,
  TrophyIcon,
  WatchIcon,
} from "@/components/icons";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import {
  getActiveWorkout,
  getDailyTotals,
  getLastFinishedWorkout,
  getLatestBodyStat,
  getPRsThisWeek,
  getWeeklyCheckin,
  getBodyScans,
  getConsistencyDays,
  getLatestGarminActivity,
} from "@/lib/queries";
import { GarminActivityList } from "@/components/garmin/GarminActivityList";
import { getEnergyContext } from "@/lib/energy-data";
import { AutoRefresh } from "@/components/AutoRefresh";
import { scheduleGarminSync } from "@/lib/garmin/background";
import { getSessionUser } from "@/lib/session";
import { addDaysStr, formatMedium, formatShort, kg, todayStr } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const serverToday = todayStr();
  const [
    consistencyDays,
    active,
    lastFinished,
    latestStat,
    prsThisWeek,
    user,
    foodTotals,
    energy,
    weekly,
    scans,
    latestActivity,
  ] = await Promise.all([
    getConsistencyDays(addDaysStr(serverToday, -380), addDaysStr(serverToday, 1)),
    getActiveWorkout(),
    getLastFinishedWorkout(),
    getLatestBodyStat(),
    getPRsThisWeek(),
    getSessionUser(),
    getDailyTotals(addDaysStr(serverToday, -1), addDaysStr(serverToday, 1)),
    getEnergyContext(),
    getWeeklyCheckin(),
    getBodyScans(),
    getLatestGarminActivity(),
  ]);
  const foodTargets = energy.targets;

  // ---- Inputs for the plain-language "Today" guide ----
  const { plan, body, goals } = energy;
  const [scanCur, scanPrev] = [scans[scans.length - 1], scans[scans.length - 2]];
  const scanChange = scanCur && scanPrev ? compareScans(scanPrev, scanCur) : null;
  const legGap = scanCur ? segmentBalance(parseSegments(scanCur.segmentalLean))?.upperLowerGap : null;
  const recentSleep = energy.garminDays.filter((d) => d.date >= addDaysStr(serverToday, -6) && d.sleepSeconds != null);
  const sleepDebt =
    recentSleep.length >= 3
      ? Math.round(recentSleep.reduce((a, d) => a + Math.max(0, 450 - d.sleepSeconds! / 60), 0) / 6) / 10
      : null;
  const guide: GuideInput = {
    weight: body.weight,
    weightDate: body.weightDate,
    bodyFat: body.bodyFat,
    bodyFatSource: body.bodyFatSource,
    scan: scanCur
      ? { date: scanCur.date, muscleChange: scanChange?.muscle ?? null, fatChange: scanChange?.fat ?? null, legAdvice: (legGap ?? 0) >= 8 }
      : null,
    goalText:
      plan.goalWeight != null
        ? `${plan.direction === "lose" ? "Get down to" : plan.direction === "gain" ? "Build up to" : "Stay at"} ${Math.round(plan.goalWeight * 10) / 10} kg${goals?.targetBodyFat ? ` at ${goals.targetBodyFat}% body fat` : ""}`
        : null,
    eta: plan.weeksToGoal != null ? addDaysStr(body.weightDate ?? serverToday, Math.ceil(plan.weeksToGoal * 7)) : null,
    weeklyRate: plan.direction === "maintain" ? null : Math.round(plan.weeklyRate * 10) / 10,
    direction: plan.direction,
    targets: foodTargets,
    hasGoal: !!goals && (goals.targetWeight != null || goals.targetBodyFat != null || goals.calorieOverride != null),
    totals: foodTotals,
    consistency: consistencyDays,
    readinessByDate: energy.readinessByDate,
    sleepDebtHours: sleepDebt,
    garminConnected: !!energy.garmin,
    hasMeal: consistencyDays.some((d) => d.meals > 0),
    hasWorkout: consistencyDays.some((d) => d.sets > 0 || d.garmin > 0),
    hasScan: scans.length > 0,
  };
  const garminSyncing = user?.id ? scheduleGarminSync(user.id, energy.garmin) : false;
  const garminByDate = new Map(energy.garminDays.map((d) => [d.date, d]));
  const energyRows = energy.intake.map((d) => ({
    date: d.date,
    eaten: d.calories,
    meals: d.count,
    burned: garminByDate.get(d.date)?.totalKcal ?? null,
  }));
  for (const g of energy.garminDays) {
    if (!energy.intake.some((d) => d.date === g.date)) {
      energyRows.push({ date: g.date, eaten: 0, meals: 0, burned: g.totalKcal });
    }
  }
  const firstName = user?.name?.split(" ")[0] ?? null;

  return (
    <PageTransition className="space-y-6">
      {garminSyncing && <AutoRefresh />}
      <header className="flex items-start justify-between gap-3">
        <DashboardHeading firstName={firstName} />
        <AccountMenu name={user?.name} email={user?.email} />
      </header>

      <TodayGuide g={guide} />

      <StreaksCard
        days={consistencyDays}
        active={active ? { name: active.name, count: active.exerciseCount } : null}
      />

      {/* Today's food */}
      <section>
        <SectionTitle help="macros"
          action={
            <Link href="/plan" transitionTypes={["nav-forward"]} className="text-xs text-zinc-400">
              Plan →
            </Link>
          }
        >
          Today&apos;s food
        </SectionTitle>
        <TodayFoodCard
          totals={foodTotals}
          targets={foodTargets}
          bonusByDate={energy.bonusByDate}
        />
      </section>

      {/* Garmin */}
      {energy.garmin ? (
        <>
          <section>
            <SectionTitle
              help="readiness"
              action={
                <Link href="/insights" transitionTypes={["nav-forward"]} className="text-xs text-zinc-400">
                  Insights →
                </Link>
              }
            >
              Readiness
            </SectionTitle>
            <ReadinessCard byDate={energy.readinessByDate} />
          </section>
          <section>
            <SectionTitle help="energy">Energy balance</SectionTitle>
            <EnergyBalanceCard rows={energyRows} />
          </section>
        </>
      ) : (
        <Link
          href="/garmin" transitionTypes={["nav-forward"]}
          className="flex items-center gap-3 rounded-2xl border border-dashed border-zinc-700 px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-900/50"
        >
          <WatchIcon className="h-5 w-5 shrink-0 text-zinc-500" />
          <span>
            <b>Connect Garmin</b>
            <span className="block text-xs text-zinc-500">
              See calories in vs out, recovery and your real maintenance calories.
            </span>
          </span>
        </Link>
      )}

      {/* Weekly check-in */}
      <section>
        <SectionTitle>This week</SectionTitle>
        <WeeklyCheckin data={weekly} targets={foodTargets} />
      </section>

      {/* Last workout */}
      <section>
        <SectionTitle
          action={
            <Link href="/history" transitionTypes={["nav-forward"]} className="text-xs text-zinc-400">
              History →
            </Link>
          }
        >
          Last workout
        </SectionTitle>
        {latestActivity || lastFinished ? (
          <div className="space-y-2">
            {/* Newest first: a Garmin activity (tap for full stats) and/or the last gym session. */}
            {latestActivity && (!lastFinished || latestActivity.date >= lastFinished.date) && (
              <GarminActivityList activities={[latestActivity]} />
            )}
            {lastFinished && (
              <Card>
                <WorkoutSummary workout={lastFinished} />
              </Card>
            )}
            {latestActivity && lastFinished && latestActivity.date < lastFinished.date && (
              <GarminActivityList activities={[latestActivity]} />
            )}
          </div>
        ) : (
          <EmptyState
            icon={<DumbbellIcon className="h-6 w-6" />}
            title="No workouts yet"
            description="Log a gym session on the Log tab, or connect Garmin to bring in runs, rides and more."
          />
        )}
      </section>

      {/* Latest body stats */}
      <section>
        <SectionTitle
          action={
            <Link href="/stats" transitionTypes={["nav-forward"]} className="text-xs text-zinc-400">
              Update →
            </Link>
          }
        >
          Latest body stats
        </SectionTitle>
        {latestStat ? (
          <div>
            <div className="grid grid-cols-3 gap-3">
              <BodyTile
                icon={<ScaleIcon className="h-4 w-4" />}
                label="Weight"
                value={
                  latestStat.weight != null ? `${kg(latestStat.weight)}` : "–"
                }
                unit="kg"
              />
              <BodyTile
                icon={<RulerIcon className="h-4 w-4" />}
                label="Waist"
                value={
                  latestStat.waist != null ? `${kg(latestStat.waist)}` : "–"
                }
                unit="cm"
              />
              <BodyTile
                icon={<SparkIcon className="h-4 w-4" />}
                label="Body fat"
                value={
                  latestStat.bodyFat != null ? `${kg(latestStat.bodyFat)}` : "–"
                }
                unit="%"
              />
            </div>
            <p className="mt-1.5 text-xs text-zinc-600">
              as of {formatMedium(latestStat.date)}
            </p>
          </div>
        ) : (
          <EmptyState
            icon={<ScaleIcon className="h-6 w-6" />}
            title="No body stats yet"
            description="Log your weight, waist and body fat on the Stats tab."
          />
        )}
      </section>

      {/* PRs this week */}
      <section>
        <SectionTitle
          action={
            <Link href="/prs" transitionTypes={["nav-forward"]} className="text-xs text-zinc-400">
              All PRs →
            </Link>
          }
        >
          PRs hit this week
        </SectionTitle>
        {prsThisWeek.length > 0 ? (
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
                      {kg(p.weight)}kg × {p.reps} · {formatShort(p.date)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">
                    {kg(p.e1rm)}kg
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    est 1RM
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
            No new PRs this week — go chase one. 💪
          </p>
        )}
      </section>
    </PageTransition>
  );
}

function BodyTile({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">
        {value}
        {value !== "–" && (
          <span className="ml-0.5 text-xs font-normal text-zinc-500">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
