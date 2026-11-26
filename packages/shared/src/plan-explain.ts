/**
 * Turns a plan into the steps behind it, with the user's own numbers, for
 * the "How we got your number" card. Mirrors computePlan in lib/nutrition.ts.
 */
import { ACTIVITY_LEVELS, KCAL_PER_KG, type Plan, type PlanInput } from "./nutrition";

export type ExplainStep = {
  key: "body" | "bmr" | "maintenance" | "goal" | "floor" | "target" | "locked";
  title: string;
  /** The headline number for the step (kcal unless the step says otherwise). */
  value: string;
  /** The working, e.g. "370 + 21.6 × 41.0 kg lean mass". */
  math?: string;
  /** One short line of why. */
  note?: string;
  tone?: "plus" | "minus" | "neutral";
};

export type MacroLine = { key: "protein" | "fat" | "carbs"; grams: number; kcal: number; math: string; note: string };

const f0 = (n: number) => Math.round(n).toLocaleString("en-US");
const f1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const f2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function explainPlan(
  plan: Plan,
  input: PlanInput,
  ctx: {
    measured: { kcal: number; avgIntake: number; trendKgPerWeek: number; loggedDays: number; windowDays: number } | null;
    watch: { kcal: number; days: number } | null;
    /** The target in force today (steady / reviewed). */
    locked: { calories: number; protein: number | null; carbs: number | null; fat: number | null } | null;
  },
): { steps: ExplainStep[]; macros: MacroLine[] } {
  const steps: ExplainStep[] = [];
  const w = input.weight;

  // 1. Body
  const parts = [
    w != null ? `${f1(w)} kg` : null,
    input.bodyFat != null ? `${f1(input.bodyFat)}% fat` : null,
    input.heightCm ? `${Math.round(input.heightCm)} cm` : null,
    input.age ? `${input.age} y` : null,
    input.sex,
  ].filter(Boolean);
  steps.push({
    key: "body",
    title: "You",
    value: parts.join(" · "),
    note: plan.leanMass != null ? `Lean mass ${f1(plan.leanMass)} kg (weight × (1 − body fat))` : undefined,
    tone: "neutral",
  });

  // 2. BMR
  if (plan.bmr != null) {
    steps.push({
      key: "bmr",
      title: "Resting burn (BMR)",
      value: `${f0(plan.bmr)} kcal`,
      math:
        plan.bmrMethod === "katch-mcardle" && plan.leanMass != null
          ? `370 + 21.6 × ${f1(plan.leanMass)} kg lean mass`
          : w != null && input.heightCm && input.age
            ? `10 × ${f1(w)} + 6.25 × ${Math.round(input.heightCm)} − 5 × ${input.age} ${input.sex === "male" ? "+ 5" : "− 161"}`
            : undefined,
      note:
        plan.bmrMethod === "katch-mcardle"
          ? "Katch-McArdle equation: uses your lean mass, the most accurate when body fat is known"
          : "Mifflin-St Jeor equation: from weight, height, age and sex",
      tone: "neutral",
    });
  }

  // 3. Maintenance
  if (plan.tdee != null) {
    const level = input.activityLevel ? ACTIVITY_LEVELS[input.activityLevel] : null;
    if (plan.maintenanceSource === "measured" && ctx.measured) {
      const m = ctx.measured;
      steps.push({
        key: "maintenance",
        title: "Daily burn (measured)",
        value: `${f0(plan.tdee)} kcal`,
        math:
          m.trendKgPerWeek <= 0
            ? `${f0(m.avgIntake)} eaten + ${f2(-m.trendKgPerWeek)} kg/wk lost × 7,700 ÷ 7`
            : `${f0(m.avgIntake)} eaten − ${f2(m.trendKgPerWeek)} kg/wk gained × 7,700 ÷ 7`,
        note: `What you ate on ${m.loggedDays} logged days vs how your weight moved over ${Math.round(m.windowDays / 7)} weeks`,
        tone: "plus",
      });
    } else if (plan.maintenanceSource === "garmin" && ctx.watch) {
      steps.push({
        key: "maintenance",
        title: "Daily burn (watch)",
        value: `${f0(plan.tdee)} kcal`,
        math: `average of ${ctx.watch.days} days`,
        note: plan.formulaTdee != null ? `Your watch's total burn. The formula alone would say ${f0(plan.formulaTdee)}` : "Your watch's total daily burn",
        tone: "plus",
      });
    } else if (plan.bmr != null && level) {
      steps.push({
        key: "maintenance",
        title: "Daily burn (estimate)",
        value: `${f0(plan.tdee)} kcal`,
        math: `${f0(plan.bmr)} × ${level.factor} (${level.label.toLowerCase()})`,
        note: "BMR × activity level. Log food and weigh-ins, or connect a watch, to measure it instead",
        tone: "plus",
      });
    }
  }

  // 4. Goal adjustment
  if (plan.tdee != null && !plan.usingOverride) {
    if (plan.direction === "maintain") {
      steps.push({ key: "goal", title: "Goal", value: "± 0 kcal", note: "At your goal: eat what you burn", tone: "neutral" });
    } else {
      const lose = plan.direction === "lose";
      const how = plan.targetDate
        ? `to reach your goal by ${plan.targetDate}`
        : input.weeklyRate
          ? "your chosen pace"
          : `default pace (${lose ? "0.5" : "0.25"}% of body weight a week)`;
      const raw = (plan.weeklyRate * KCAL_PER_KG) / 7;
      steps.push({
        key: "goal",
        title: lose ? "Deficit to lose" : "Surplus to gain",
        value: `${lose ? "−" : "+"}${f0(raw)} kcal`,
        math: `${f2(plan.weeklyRate)} kg/wk × 7,700 ÷ 7`,
        note: `${how}${plan.rateWasCapped || plan.dateTooSoon ? ", capped at the safe maximum" : ""}. About 7,700 kcal is 1 kg of body fat`,
        tone: lose ? "minus" : "plus",
      });
    }
  }

  // 5. Safety floor
  if (plan.calorieFloorApplied && plan.calorieTarget != null) {
    const min = input.sex === "female" ? 1200 : 1500;
    steps.push({
      key: "floor",
      title: "Safety floor",
      value: `${f0(plan.calorieTarget)} kcal`,
      math: `max(BMR ${plan.bmr != null ? f0(plan.bmr) : "–"}, ${f0(min)})`,
      note: `Never below your resting burn, so the pace slows to ${f2(plan.effectiveWeeklyRate)} kg/wk`,
      tone: "neutral",
    });
  }

  // 6. Target
  if (plan.calorieTarget != null) {
    steps.push({
      key: "target",
      title: plan.usingOverride ? "Your custom target" : "Daily target",
      value: `${f0(plan.calorieTarget)} kcal`,
      math: plan.usingOverride || plan.tdee == null ? undefined : `${f0(plan.tdee)} ${plan.dailyDelta < 0 ? "−" : "+"} ${f0(Math.abs(plan.dailyDelta))}, rounded to 10`,
      tone: "neutral",
    });
  }
  if (ctx.locked != null && plan.calorieTarget != null && Math.round(ctx.locked.calories) !== plan.calorieTarget) {
    steps.push({
      key: "locked",
      title: "Today's locked target",
      value: `${f0(ctx.locked.calories)} kcal`,
      note: `Set at your last review. Today's numbers give ${f0(plan.calorieTarget)}; it updates at the next review`,
      tone: "neutral",
    });
  }

  // Macros
  const macros: MacroLine[] = [];
  const g = {
    protein: ctx.locked?.protein ?? plan.protein,
    fat: ctx.locked?.fat ?? plan.fat,
    carbs: ctx.locked?.carbs ?? plan.carbs,
  };
  if (g.protein != null && g.fat != null && g.carbs != null) {
    if (plan.macroBasis === "bodyweight" && w != null) {
      const perKg = plan.direction === "lose" ? 2.0 : 1.8;
      macros.push({
        key: "protein",
        grams: g.protein,
        kcal: g.protein * 4,
        math: `${perKg.toFixed(1)} g × ${f1(w)} kg`,
        note: plan.direction === "lose" ? "Higher while losing, to keep muscle" : "Enough to build and keep muscle",
      });
      macros.push({
        key: "fat",
        grams: g.fat,
        kcal: g.fat * 9,
        math: `max(25% of calories, 0.6 g × ${f1(w)} kg)`,
        note: "For hormones and vitamin absorption",
      });
      macros.push({ key: "carbs", grams: g.carbs, kcal: g.carbs * 4, math: "the calories left ÷ 4", note: "Fuel for training" });
    } else {
      macros.push({ key: "protein", grams: g.protein, kcal: g.protein * 4, math: "25% of calories ÷ 4", note: "Standard split until you log your weight" });
      macros.push({ key: "fat", grams: g.fat, kcal: g.fat * 9, math: "30% of calories ÷ 9", note: "Standard split" });
      macros.push({ key: "carbs", grams: g.carbs, kcal: g.carbs * 4, math: "45% of calories ÷ 4", note: "Standard split" });
    }
  }
  return { steps, macros };
}
