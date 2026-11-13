import Link from "next/link";
import { PageTransition } from "@/components/PageTransition";
import { AccountMenu } from "@/components/AccountMenu";
import { DashboardHeading } from "@/components/DashboardHeading";
import { StreakCard } from "@/components/StreakCard";
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
  getWorkoutDates,
} from "@/lib/queries";
import { getEnergyContext } from "@/lib/energy-data";
import { syncGarminInBackgroundIfStale } from "@/lib/garmin/background";
import { getSessionUser } from "@/lib/session";
import { addDaysStr, formatMedium, formatShort, kg, todayStr } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const serverToday = todayStr();
  const [
    workoutDates,
    active,
    lastFinished,
    latestStat,
    prsThisWeek,
    user,
    foodTotals,
    energy,
    weekly,
  ] = await Promise.all([
    getWorkoutDates(),
    getActiveWorkout(),
    getLastFinishedWorkout(),
    getLatestBodyStat(),
    getPRsThisWeek(),
    getSessionUser(),
    getDailyTotals(addDaysStr(serverToday, -1), addDaysStr(serverToday, 1)),
    getEnergyContext(),
    getWeeklyCheckin(),
  ]);
  const foodTargets = energy.targets;
  if (user?.id && energy.garmin) await syncGarminInBackgroundIfStale(user.id);
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
      <header className="flex items-start justify-between gap-3">
        <DashboardHeading firstName={firstName} />
        <AccountMenu name={user?.name} email={user?.email} />
      </header>

      <StreakCard
        workoutDates={workoutDates}
        active={
          active ? { name: active.name, count: active.exerciseCount } : null
        }
      />

      {/* Today's food */}
      <section>
        <SectionTitle
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
              action={
                <Link href="/garmin" transitionTypes={["nav-forward"]} className="text-xs text-zinc-400">
                  Garmin →
                </Link>
              }
            >
              Readiness
            </SectionTitle>
            <ReadinessCard byDate={energy.readinessByDate} />
          </section>
          <section>
            <SectionTitle>Energy balance</SectionTitle>
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
        {lastFinished ? (
          <Card>
            <WorkoutSummary workout={lastFinished} />
          </Card>
        ) : (
          <EmptyState
            icon={<DumbbellIcon className="h-6 w-6" />}
            title="No workouts yet"
            description="Start your first session to begin your gym diary."
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
