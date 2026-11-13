import Link from "next/link";
import { GoalsForm } from "@/components/plan/GoalsForm";
import { ProjectionChart } from "@/components/plan/ProjectionChart";
import { ArrowLeftIcon } from "@/components/icons";
import { Card, PageHeader, SectionTitle, Stat } from "@/components/ui";
import { computePlan, planInputFrom, weightTrendPerWeek } from "@/lib/nutrition";
import {
  getBodyStats,
  getDailyTotals,
  getGoals,
  getLatestBodyValues,
} from "@/lib/queries";
import { addDaysStr, daysBetween, formatMedium, kg, todayStr } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const today = todayStr();
  const [goals, body, stats, totals] = await Promise.all([
    getGoals(),
    getLatestBodyValues(),
    getBodyStats(),
    getDailyTotals(addDaysStr(today, -14), today),
  ]);
  const plan = computePlan(planInputFrom(goals, body));

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
      ? addDaysStr(body.weightDate ?? today, Math.ceil(plan.weeksToGoal * 7))
      : null;

  const directionLabel =
    plan.direction === "lose" ? "Fat loss" : plan.direction === "gain" ? "Lean gain" : "Maintain";

  return (
    <div className="space-y-7">
      <PageHeader
        title="Plan"
        subtitle="Weight & body-fat goal → daily targets"
        action={
          <Link
            href="/food"
            className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            <ArrowLeftIcon className="h-4 w-4" /> Food
          </Link>
        }
      />

      {/* Targets */}
      <section>
        <SectionTitle>Daily targets</SectionTitle>
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
                    ? "—"
                    : `${plan.direction === "lose" ? "−" : "+"}${kg(plan.weeklyRate)} kg`
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
                  label="Maintenance (TDEE)"
                  value={`${plan.tdee.toLocaleString("en-US")} kcal`}
                />
              )}
              {plan.bmr != null && (
                <Row
                  label={`BMR · ${plan.bmrMethod === "katch-mcardle" ? "lean-mass formula" : "Mifflin-St Jeor"}`}
                  value={`${plan.bmr.toLocaleString("en-US")} kcal`}
                />
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
          </div>
        ) : (
          <Card className="text-sm text-zinc-400">
            <p className="mb-1 font-medium text-zinc-200">A few details needed</p>
            <p>To calculate your calorie target, add: {plan.missing.join(", ")}.</p>
            <p className="mt-2 text-xs text-zinc-500">
              Tip: logging your body fat % on the Stats tab gives a more accurate,
              lean-mass-based estimate.
            </p>
          </Card>
        )}
      </section>

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
                {trendVerdict(trend, plan.direction, plan.weeklyRate)}
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
            weeklyRate={plan.weeklyRate}
            direction={plan.direction}
          />
        </Card>
      </section>

      <section>
        <SectionTitle>Your goal</SectionTitle>
        <GoalsForm goals={goals} currentWeight={body.weight} />
        <p className="mt-2 text-center text-xs text-zinc-600">
          Current weight and body fat come from your latest entries on the Stats tab.
          Estimates only — not medical advice.
        </p>
      </section>
    </div>
  );
}

function trendVerdict(trend: number, direction: "lose" | "gain", rate: number) {
  const actual = direction === "lose" ? -trend : trend;
  if (actual <= 0)
    return direction === "lose"
      ? "Weight isn't dropping yet. If this holds for 2+ weeks, trim ~150–200 kcal/day or check your logging."
      : "Weight isn't rising yet. If this holds for 2+ weeks, add ~150–200 kcal/day.";
  if (actual < rate * 0.6)
    return "Slower than planned. Give it another week — if it persists, adjust by ~100–150 kcal/day.";
  if (actual > rate * 1.5)
    return direction === "lose"
      ? "Faster than planned — consider eating a bit more to protect muscle and training performance."
      : "Faster than planned — some of that may be fat; consider a slightly smaller surplus.";
  return "Right on track. Keep it up.";
}

function Notes({
  plan,
  goals,
}: {
  plan: ReturnType<typeof computePlan>;
  goals: { targetWeight: number | null; targetBodyFat: number | null } | null;
}) {
  const notes: string[] = [];
  if (goals?.targetBodyFat != null && goals.targetWeight == null && plan.impliedWeightForBodyFat != null) {
    notes.push(
      `To reach ${kg(goals.targetBodyFat)}% body fat while keeping your lean mass, you'd weigh about ${kg(plan.impliedWeightForBodyFat)} kg — the plan aims for that.`,
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
    notes.push("Log your body fat % on the Stats tab to connect your body-fat goal to a target weight.");
  }
  if (plan.rateWasCapped) notes.push("Your pace was capped to a sustainable maximum to protect muscle.");
  if (plan.calorieFloorApplied)
    notes.push("Your target was raised to a safe minimum — the goal will take a bit longer.");
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
