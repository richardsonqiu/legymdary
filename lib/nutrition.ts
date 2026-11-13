/**
 * Pure energy / goal math shared by server and client. No DB access here.
 *
 * - BMR: Katch-McArdle when body fat is known (uses lean mass), otherwise
 *   Mifflin-St Jeor (needs sex, age, height).
 * - TDEE = BMR × activity multiplier.
 * - ~7,700 kcal per kg of body-weight change.
 */

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const ACTIVITY_LEVELS = {
  sedentary: { label: "Sedentary", hint: "Desk job, little exercise", factor: 1.2 },
  light: { label: "Light", hint: "Training 1–3 days / week", factor: 1.375 },
  moderate: { label: "Moderate", hint: "Training 3–5 days / week", factor: 1.55 },
  very: { label: "Very active", hint: "Hard training 6–7 days / week", factor: 1.725 },
  extra: { label: "Athlete", hint: "Physical job + daily training", factor: 1.9 },
} as const;
export type ActivityLevel = keyof typeof ACTIVITY_LEVELS;

export const KCAL_PER_KG = 7700;

export type MealItem = {
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type Macros = { calories: number; protein: number; carbs: number; fat: number };

export function sumMacros(rows: Macros[]): Macros {
  return rows.reduce(
    (a, r) => ({
      calories: a.calories + (r.calories || 0),
      protein: a.protein + (r.protein || 0),
      carbs: a.carbs + (r.carbs || 0),
      fat: a.fat + (r.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Guess a meal type from the local hour of day. */
export function mealTypeForHour(h: number): MealType {
  if (h >= 4 && h < 11) return "breakfast";
  if (h >= 11 && h < 15) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

export type PlanInput = {
  sex: "male" | "female" | null;
  age: number | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  weight: number | null; // current, kg
  bodyFat: number | null; // current, %
  targetWeight: number | null;
  targetBodyFat: number | null;
  weeklyRate: number | null; // kg / week (absolute)
  calorieOverride: number | null;
};

export type Plan = {
  /** Missing inputs that block a calorie target. Empty when the plan is complete. */
  missing: string[];
  bmr: number | null;
  bmrMethod: "katch-mcardle" | "mifflin-st-jeor" | null;
  tdee: number | null;
  leanMass: number | null;
  /** The weight the plan steers to (explicit target, or implied by body-fat goal). */
  goalWeight: number | null;
  /** Weight that would hit the body-fat goal if lean mass is kept. */
  impliedWeightForBodyFat: number | null;
  /** Body fat at the target weight if lean mass is kept. */
  impliedBodyFatAtTarget: number | null;
  direction: "lose" | "gain" | "maintain";
  weeklyRate: number; // kg/week actually used
  rateWasCapped: boolean;
  dailyDelta: number; // kcal, negative for a deficit
  calorieTarget: number | null;
  calorieFloorApplied: boolean;
  usingOverride: boolean;
  protein: number | null; // g
  fat: number | null; // g
  carbs: number | null; // g
  weeksToGoal: number | null;
};

const round = (n: number, step = 1) => Math.round(n / step) * step;

export function computePlan(i: PlanInput): Plan {
  const missing: string[] = [];
  const w = i.weight;
  const leanMass = w != null && i.bodyFat != null ? w * (1 - i.bodyFat / 100) : null;

  // --- BMR ---
  let bmr: number | null = null;
  let bmrMethod: Plan["bmrMethod"] = null;
  if (leanMass != null) {
    bmr = 370 + 21.6 * leanMass;
    bmrMethod = "katch-mcardle";
  } else if (w != null && i.heightCm && i.age && i.sex) {
    bmr = 10 * w + 6.25 * i.heightCm - 5 * i.age + (i.sex === "male" ? 5 : -161);
    bmrMethod = "mifflin-st-jeor";
  } else {
    if (w == null) missing.push("current weight (log it on the Stats tab)");
    if (!i.sex) missing.push("sex");
    if (!i.age) missing.push("birth year");
    if (!i.heightCm) missing.push("height");
  }
  if (!i.activityLevel) missing.push("activity level");
  const tdee =
    bmr != null && i.activityLevel ? bmr * ACTIVITY_LEVELS[i.activityLevel].factor : null;

  // --- Goal weight ---
  const impliedWeightForBodyFat =
    leanMass != null && i.targetBodyFat != null && i.targetBodyFat < 100
      ? leanMass / (1 - i.targetBodyFat / 100)
      : null;
  const impliedBodyFatAtTarget =
    leanMass != null && i.targetWeight
      ? Math.max(0, (1 - leanMass / i.targetWeight) * 100)
      : null;
  const goalWeight = i.targetWeight ?? impliedWeightForBodyFat;

  let direction: Plan["direction"] = "maintain";
  if (w != null && goalWeight != null) {
    if (goalWeight < w - 0.25) direction = "lose";
    else if (goalWeight > w + 0.25) direction = "gain";
  }

  // --- Pace: default 0.5% bw/week to lose, 0.25% to gain; cap 1% / 0.5% ---
  let weeklyRate = 0;
  let rateWasCapped = false;
  if (w != null && direction !== "maintain") {
    const def = direction === "lose" ? w * 0.005 : w * 0.0025;
    const cap = direction === "lose" ? w * 0.01 : w * 0.005;
    weeklyRate = i.weeklyRate && i.weeklyRate > 0 ? i.weeklyRate : def;
    if (weeklyRate > cap) {
      weeklyRate = cap;
      rateWasCapped = true;
    }
  }
  let dailyDelta = ((direction === "lose" ? -1 : 1) * weeklyRate * KCAL_PER_KG) / 7;
  if (direction === "maintain") dailyDelta = 0;

  // --- Calorie target with a safety floor ---
  let calorieTarget: number | null = null;
  let calorieFloorApplied = false;
  const usingOverride = !!i.calorieOverride && i.calorieOverride > 0;
  if (usingOverride) {
    calorieTarget = i.calorieOverride!;
  } else if (tdee != null) {
    calorieTarget = tdee + dailyDelta;
    const floor = Math.max(bmr ?? 0, i.sex === "female" ? 1200 : 1500);
    if (calorieTarget < floor) {
      calorieTarget = floor;
      calorieFloorApplied = true;
      dailyDelta = floor - tdee;
    }
  }
  if (calorieTarget != null) calorieTarget = round(calorieTarget, 10);

  // --- Macros: protein first, fat ~25% of energy, carbs fill the rest ---
  let protein: number | null = null;
  let fat: number | null = null;
  let carbs: number | null = null;
  if (calorieTarget != null && w != null) {
    const perKg = direction === "lose" ? 2.0 : 1.8;
    protein = w * perKg;
    if (leanMass != null) protein = Math.min(protein, leanMass * 2.6);
    fat = Math.max((calorieTarget * 0.25) / 9, w * 0.6);
    carbs = Math.max(0, (calorieTarget - protein * 4 - fat * 9) / 4);
    protein = round(protein, 5);
    fat = round(fat, 5);
    carbs = round(carbs, 5);
  }

  const weeksToGoal =
    w != null && goalWeight != null && weeklyRate > 0
      ? Math.abs(goalWeight - w) / weeklyRate
      : null;

  return {
    missing,
    bmr: bmr != null ? round(bmr) : null,
    bmrMethod,
    tdee: tdee != null ? round(tdee, 10) : null,
    leanMass,
    goalWeight,
    impliedWeightForBodyFat,
    impliedBodyFatAtTarget,
    direction,
    weeklyRate,
    rateWasCapped,
    dailyDelta: round(dailyDelta),
    calorieTarget,
    calorieFloorApplied,
    usingOverride,
    protein,
    fat,
    carbs,
    weeksToGoal,
  };
}

/** Least-squares slope (kg per day) of weight over the given points. */
export function weightTrendPerWeek(
  points: { day: number; weight: number }[],
): number | null {
  if (points.length < 3) return null;
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.day, 0) / n;
  const my = points.reduce((a, p) => a + p.weight, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.day - mx) * (p.weight - my);
    den += (p.day - mx) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7;
}

/** Builds plan inputs from a stored goals row + the latest body stats. */
export function planInputFrom(
  g: {
    sex: string | null;
    birthYear: number | null;
    heightCm: number | null;
    activityLevel: string | null;
    targetWeight: number | null;
    targetBodyFat: number | null;
    weeklyRate: number | null;
    calorieOverride: number | null;
  } | null,
  body: { weight: number | null; bodyFat: number | null },
  year: number = new Date().getFullYear(),
): PlanInput {
  return {
    sex: g?.sex === "male" || g?.sex === "female" ? g.sex : null,
    age: g?.birthYear ? year - g.birthYear : null,
    heightCm: g?.heightCm ?? null,
    activityLevel:
      g?.activityLevel && g.activityLevel in ACTIVITY_LEVELS
        ? (g.activityLevel as ActivityLevel)
        : null,
    weight: body.weight,
    bodyFat: body.bodyFat,
    targetWeight: g?.targetWeight ?? null,
    targetBodyFat: g?.targetBodyFat ?? null,
    weeklyRate: g?.weeklyRate ?? null,
    calorieOverride: g?.calorieOverride ?? null,
  };
}

export type DailyTargets = {
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
} | null;

export function targetsFromPlan(p: Plan): DailyTargets {
  if (p.calorieTarget == null) return null;
  return { calories: p.calorieTarget, protein: p.protein, carbs: p.carbs, fat: p.fat };
}
