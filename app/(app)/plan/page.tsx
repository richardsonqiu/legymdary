import { userToday } from "@/lib/session";
import Link from "next/link";
import { PageTransition } from "@/components/PageTransition";
import { GoalsForm } from "@/components/plan/GoalsForm";
import { ProjectionChart } from "@/components/plan/ProjectionChart";
import { Card, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { getEnergyContext } from "@/lib/energy-data";
import { EnergyBalanceCard } from "@/components/garmin/EnergyBalanceCard";
import { paceOptions, weightTrendPerWeek, type Plan } from "@/lib/nutrition";
import { PaceChooser } from "@/components/plan/PaceChooser";
import { getBodyScans, getBodyStats, getDailyTotals } from "@/lib/queries";
import { addDaysStr, daysBetween, formatMedium, formatShort, kg } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goal" };

export default async function PlanPage() {
  const today = (await userToday());
  const [energy, stats, totals, scans] = await Promise.all([
    getEnergyContext(),
    getBodyStats(),
    getDailyTotals(addDaysStr(today, -14), today),
    getBodyScans(),
  ]);
  const latestScan = scans[scans.length - 1] ?? null;
  const garminByDate = new Map(energy.garminDays.map((d) => [d.date, d]));
  const energyRows = energy.intake.map((d) => ({
    date: d.date,
    eaten: d.calories,
    meals: d.count,
    skipped: d.skipped,
    burned: garminByDate.get(d.date)?.totalKcal ?? null,
  }));
  for (const g of energy.garminDays) {
    if (!energy.intake.some((d) => d.date === g.date)) energyRows.push({ date: g.date, eaten: 0, meals: 0, skipped: 0, burned: g.totalKcal });
  }
  const { goals, body, plan, measured, garminMaint } = energy;

  const weights = stats
    .filter((s) => s.weight != null && s.date >= addDaysStr(today, -90))
    .map((s) => ({ date: s.date, weight: s.weight as number }));
  const recent = weights.filter((w) => w.date >= addDaysStr(today, -28));
  const trend = weightTrendPerWeek(
    recent.map((w) => ({ day: daysBetween(recent[0].date, w.date), weight: w.weight })),
  );

  // Average intake over the last 7 days that have at least one meal (excl. today).
  const logged = totals.filter((t) => t.date < today).slice(-7);
  const avgIntake = logged.length
    ? Math.round(logged.reduce((a, t) => a + t.calories, 0) / logged.length)
    : null;

  const eta =
    plan.weeksToGoal != null
      ? addDaysStr(today, Math.ceil(plan.weeksToGoal * 7))
      : null;

  const paces = paceOptions(energy.planInput);
  const staleDays = body.weightDate ? daysBetween(body.weightDate, today) : null;

  const directionLabel =
    plan.direction === "lose" ? "Fat loss" : plan.direction === "gain" ? "Lean gain" : "Maintain";

  return (
    <PageTransition className="space-y-7">
      <PageHeader
        title="Goal"
        subtitle="Where you are heading, and what to eat each day"
      />

      {staleDays != null && staleDays > 21 && (
        <Link
          href="/stats"
          className="-mt-3 block rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
        >
          Your weight is from {formatMedium(body.weightDate!)}, {staleDays} days ago. Weigh in or add a new scan so the plan
          starts from today&apos;s numbers →
        </Link>
      )}

      {/* Targets */}
      <section>
        <SectionTitle help="maintenance">Daily targets</SectionTitle>
        {plan.calorieTarget != null ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Calories"
                value={`${plan.calorieTarget.toLocaleString("en-US")}`}
                sub={
                  plan.usingOverride
                    ? "custom target"
                    : plan.dailyDelta
                      ? `${plan.dailyDelta > 0 ? "+" : ""}${plan.dailyDelta} vs maintenance`
                      : "maintenance"
                }
              />
              <Stat
                label={directionLabel}
                value={
                  plan.direction === "maintain"
                    ? "–"
                    : `${plan.direction === "lose" ? "−" : "+"}${kg(plan.effectiveWeeklyRate)} kg`
                }
                sub={plan.direction === "maintain" ? "no weight goal set" : "per week"}
              />
            </div>
            {plan.protein != null && (
              <div className="grid grid-cols-3 gap-3">
                <MacroTile label="Protein" value={plan.protein} color="text-sky-300" />
                <MacroTile label="Carbs" value={plan.carbs} color="text-violet-300" />
                <MacroTile label="Fat" value={plan.fat} color="text-rose-300" />
              </div>
            )}
            <Card className="space-y-1.5 text-sm">
              {plan.tdee != null && (
                <Row
                  label={
                    plan.maintenanceSource === "measured"
                      ? "Maintenance · measured"
                      : plan.maintenanceSource === "garmin"
                        ? "Maintenance · Garmin avg"
                        : "Maintenance · formula"
                  }
                  value={`${plan.tdee.toLocaleString("en-US")} kcal`}
                />
              )}
              {plan.maintenanceSource !== "formula" && plan.formulaTdee != null && (
                <Row
                  label="Formula estimate (for reference)"
                  value={`${plan.formulaTdee.toLocaleString("en-US")} kcal`}
                />
              )}
              {plan.bmr != null && (
                <Row
                  label={`BMR · ${plan.bmrMethod === "katch-mcardle" ? "lean-mass formula" : "Mifflin-St Jeor"}`}
                  value={`${plan.bmr.toLocaleString("en-US")} kcal`}
                />
              )}
              {latestScan?.bmr != null && (
                <Row label={`BMR · measured (InBody, ${formatShort(latestScan.date)})`} value={`${Math.round(latestScan.bmr).toLocaleString("en-US")} kcal`} />
              )}
              {plan.leanMass != null && <Row label="Lean mass" value={`${kg(plan.leanMass)} kg`} />}
              {body.weight != null && (
                <Row
                  label="Current"
                  value={`${kg(body.weight)} kg${body.bodyFat != null ? ` · ${kg(body.bodyFat)}%` : ""}`}
                />
              )}
              {plan.goalWeight != null && (
                <Row
                  label="Goal"
                  value={`${kg(plan.goalWeight)} kg${
                    goals?.targetBodyFat != null ? ` · ${kg(goals.targetBodyFat)}%` : ""
                  }`}
                />
              )}
              {eta && plan.weeksToGoal != null && (
                <Row
                  label="Estimated arrival"
                  value={`${formatMedium(eta)} (${Math.ceil(plan.weeksToGoal)} wk)`}
                />
              )}
            </Card>
            <Notes plan={plan} goals={goals} />
            <MaintenanceNote
              source={plan.maintenanceSource}
              measured={measured}
              garminDays={garminMaint?.days ?? null}
              garminConnected={!!energy.garmin}
            />
          </div>
        ) : (
          <Card className="text-sm text-zinc-400">
            <p className="mb-1 font-medium text-zinc-200">A few details needed</p>
            <p>To calculate your calorie target, add: {plan.missing.join(", ")}.</p>
            <p className="mt-2 text-xs text-zinc-500">
              Adding your body fat % on the Progress tab makes this more accurate.
            </p>
          </Card>
        )}
      </section>

      {plan.direction !== "maintain" && paces.length > 0 && (
        <section>
          <SectionTitle>When do you want to get there?</SectionTitle>
          <PaceChooser
            options={paces}
            direction={plan.direction}
            currentRate={goals?.targetDate || plan.usingOverride ? null : plan.weeklyRate}
            currentDate={plan.targetDate}
            dateTooSoon={plan.dateTooSoon}
            today={today}
            overrideActive={plan.usingOverride}
          />
        </section>
      )}

      {energy.garmin && (
        <section>
          <SectionTitle help="energy">Eaten vs burned</SectionTitle>
          <EnergyBalanceCard rows={energyRows} />
        </section>
      )}

      {/* Progress check */}
      {(avgIntake != null || trend != null) && plan.calorieTarget != null && (
        <section>
          <SectionTitle>How it&apos;s going</SectionTitle>
          <Card className="space-y-1.5 text-sm">
            {avgIntake != null && (
              <Row
                label={`Avg intake · last ${logged.length} logged day${logged.length > 1 ? "s" : ""}`}
                value={`${avgIntake.toLocaleString("en-US")} kcal (${avgIntake - plan.calorieTarget >= 0 ? "+" : ""}${avgIntake - plan.calorieTarget})`}
              />
            )}
            {trend != null && (
              <Row
                label="Weight trend · 4 weeks"
                value={`${trend >= 0 ? "+" : ""}${kg(trend)} kg / week`}
              />
            )}
            {trend != null && plan.direction !== "maintain" && (
              <p className="pt-1 text-xs text-zinc-500">
                {trendVerdict(trend, plan.direction, plan.effectiveWeeklyRate)}
              </p>
            )}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Projection</SectionTitle>
        <Card>
          <ProjectionChart
            weights={weights}
            goalWeight={plan.goalWeight}
            weeklyRate={
              plan.weeksToGoal && plan.goalWeight != null && body.weight != null
                ? Math.abs(plan.goalWeight - body.weight) / plan.weeksToGoal
                : 0
            }
            direction={plan.direction}
            today={today}
            current={body.weight}
          />
        </Card>
      </section>

      <section>
        <SectionTitle>Your goal and details</SectionTitle>
        <GoalsForm goals={goals} currentWeight={body.weight} />
        <p className="mt-2 text-center text-xs text-zinc-600">
          Current weight and body fat come from your latest entries on the Progress tab.
          Estimates only, not medical advice.
        </p>
      </section>
    </PageTransition>
  );
}

function trendVerdict(trend: number, direction: "lose" | "gain", rate: number) {
  const actual = direction === "lose" ? -trend : trend;
  if (actual <= 0)
    return direction === "lose"
      ? "Weight isn't dropping yet. If that lasts 2 weeks, eat 150 to 200 kcal less a day, or check your logging."
      : "Weight isn't rising yet. If that lasts 2 weeks, eat 150 to 200 kcal more a day.";
  if (actual < rate * 0.6)
    return "Slower than planned. Give it a week. If it continues, change your calories by 100 to 150 a day.";
  if (actual > rate * 1.5)
    return direction === "lose"
      ? "Faster than planned. Eat a little more to protect your muscle."
      : "Faster than planned. Some of it may be fat, so eat a little less.";
  return "Right on track. Keep it up.";
}

function Notes({
  plan,
  goals,
}: {
  plan: Plan;
  goals: { targetWeight: number | null; targetBodyFat: number | null } | null;
}) {
  const notes: string[] = [];
  if (goals?.targetBodyFat != null && goals.targetWeight == null && plan.impliedWeightForBodyFat != null) {
    notes.push(
      `To reach ${kg(goals.targetBodyFat)}% body fat while keeping your lean mass, you'd weigh about ${kg(plan.impliedWeightForBodyFat)} kg. The plan aims for that.`,
    );
  }
  if (
    goals?.targetBodyFat != null &&
    goals.targetWeight != null &&
    plan.impliedBodyFatAtTarget != null
  ) {
    notes.push(
      `At ${kg(goals.targetWeight)} kg with your current lean mass you'd be ~${kg(plan.impliedBodyFatAtTarget)}% body fat` +
        (plan.impliedWeightForBodyFat != null
          ? `; ${kg(goals.targetBodyFat)}% would be ~${kg(plan.impliedWeightForBodyFat)} kg. Building muscle closes the gap.`
          : "."),
    );
  }
  if (goals?.targetBodyFat != null && plan.leanMass == null) {
    notes.push("Log your body fat % on the Progress tab to connect your body-fat goal to a target weight.");
  }
  if (plan.targetDatePassed) notes.push("Your goal date has passed. Pick a new pace or date below.");
  if (plan.rateWasCapped) notes.push("Your pace was capped to a sustainable maximum to protect muscle.");
  if (plan.calorieFloorApplied)
    notes.push("Your calories were raised to a safe minimum, so the goal takes a bit longer.");
  if (!notes.length) return null;
  return (
    <ul className="space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2.5 text-xs text-zinc-400">
      {notes.map((n) => (
        <li key={n}>• {n}</li>
      ))}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right tabular-nums text-zinc-200">{value}</span>
    </div>
  );
}

function MacroTile({
  label,
  value,
  color,
}: {
  label: string;
  value: number | null;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>
        {value ?? "–"}
        <span className="ml-0.5 text-xs font-normal text-zinc-500">g</span>
      </div>
    </div>
  );
}

function MaintenanceNote({
  source,
  measured,
  garminDays,
  garminConnected,
}: {
  source: Plan["maintenanceSource"];
  measured: Awaited<ReturnType<typeof getEnergyContext>>["measured"];
  garminDays: number | null;
  garminConnected: boolean;
}) {
  let text: React.ReactNode;
  if (source === "measured" && measured) {
    text = (
      <>
        <b className="text-zinc-200">From your own data:</b>{" "}
        {Math.round(measured.avgIntake).toLocaleString("en-US")} kcal a day over {measured.loggedDays} logged days,
        with weight changing {measured.trendKgPerWeek >= 0 ? "+" : "−"}
        {kg(Math.abs(measured.trendKgPerWeek))} kg a week. It updates as you log.
      </>
    );
  } else if (source === "garmin") {
    text = (
      <>
        <b className="text-zinc-200">From Garmin:</b> your average daily burn over {garminDays} days. Log
        food for 10 days and weigh in regularly to get a number measured from your own results.
      </>
    );
  } else {
    text = (
      <>
        <b className="text-zinc-200">Formula estimate.</b>{" "}
        {garminConnected
          ? "After 5 days of Garmin data, your real burn replaces it."
          : (
            <>
              <Link href="/garmin" transitionTypes={["nav-forward"]} className="underline">Connect Garmin</Link>, or log food
              for 10 days and weigh in regularly, to get your real number.
            </>
          )}
      </>
    );
  }
  return (
    <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-2.5 text-xs text-zinc-400">
      {text}
    </p>
  );
}
