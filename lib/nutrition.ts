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

/** Meals you can skip. A snack is optional anyway, so it has no skip. */
export const SKIPPABLE_MEALS = ["breakfast", "lunch", "dinner"] as const;
export type SkippableMeal = (typeof SKIPPABLE_MEALS)[number];

/** How a day's calories are split across meal slots. */
export const MEAL_SHARE: Record<MealType, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snack: 0.1 };

export type SlotBudget = {
  type: MealType;
  /** Calories this slot may use. A skipped slot's share moves to the others. */
  budget: number;
  eaten: number;
  skipped: boolean;
};

/**
 * Splits the day's calories over the meal slots. A skipped slot releases its
 * share, and the other slots grow in proportion, so the budgets always add up
 * to the day's target.
 */
export function mealBudgets(
  target: number,
  eatenByType: Partial<Record<MealType, number>>,
  skipped: readonly MealType[],
): { slots: SlotBudget[]; freed: number } {
  const skip = new Set(skipped);
  const active = MEAL_TYPES.filter((t) => !skip.has(t));
  const activeShare = active.reduce((a, t) => a + MEAL_SHARE[t], 0);
  const freed = MEAL_TYPES.filter((t) => skip.has(t)).reduce((a, t) => a + target * MEAL_SHARE[t], 0);
  const slots = MEAL_TYPES.map((t) => ({
    type: t,
    skipped: skip.has(t),
    eaten: Math.round(eatenByType[t] ?? 0),
    budget: skip.has(t) || activeShare === 0 ? 0 : Math.round((target * MEAL_SHARE[t]) / activeShare),
  }));
  return { slots, freed: Math.round(freed) };
}

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
  /** Dish this component belongs to (e.g. "Kaya toast" → bread, kaya, butter). */
  dish?: string | null;
  /** Reference value used, e.g. "1 large egg (50 g) = 72 kcal · 6 g P · 0 g C · 5 g F (USDA)". */
  reference?: string | null;
  /** How the amount was judged, e.g. "2 eggs, seen on plate". */
  amount?: string | null;
  /** The arithmetic, e.g. "2 × 72 kcal = 144 kcal". */
  calculation?: string | null;
  /** Preparation/hidden-calorie assumptions, e.g. "soft-boiled, no oil". */
  assumptions?: string | null;
  /** The user changed the numbers after the AI estimate. */
  edited?: boolean;
  /** Numbers for the full portion that was estimated. calories etc. = base × eaten. */
  base?: Macros | null;
  /** How much of that portion was actually eaten: 0.5 = half, 2 = double. Default 1. */
  eaten?: number | null;
  /** A drink rather than food (set by the AI; guessed from the name otherwise). */
  drink?: boolean | null;
};

const DRINK_WORDS =
  /\b(kopi|teh|tea|coffee|latte|cappuccino|americano|espresso|mocha|macchiato|flat white|milo|horlicks|juice|smoothie|shake|milkshake|soda|cola|coke|pepsi|sprite|lemonade|water|beer|wine|cider|sake|soju|whisky|vodka|cocktail|kombucha|boba|bubble tea|bandung|lassi|soy milk|soymilk|chocolate milk|drink|frappe|frappuccino|matcha latte|isotonic|100plus|gatorade|yakult)\b/i;
const DRINK_PORTION = /\b(\d+\s*ml|ml|cup|glass|bottle|can|mug|pint)\b/i;
const NOT_DRINK = /\b(soup|cake|bread|toast|egg|rice|noodle|ice cream|jelly|pudding|cookie|biscuit)\b/i;

/** Whether an item is a drink: the AI's flag, else a guess from its name and portion. */
export function isDrink(it: Pick<MealItem, "name" | "portion" | "drink">): boolean {
  if (typeof it.drink === "boolean") return it.drink;
  const name = it.name ?? "";
  if (NOT_DRINK.test(name)) return false;
  return DRINK_WORDS.test(name) || (/\b(milk)\b/i.test(name) && DRINK_PORTION.test(it.portion ?? "")) || (DRINK_PORTION.test(it.portion ?? "") && !/\bg\b/.test(it.portion ?? ""));
}

export type Macros = { calories: number; protein: number; carbs: number; fat: number };

export function eatenLabel(x: number): string {
  const map: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾", "1.5": "1½" };
  return `${map[String(x)] ?? String(Math.round(x * 100) / 100)}×`;
}

/** Full-portion numbers for an item (works for items saved before amounts existed). */
export function baseOf(it: MealItem): Macros {
  if (it.base) return it.base;
  const e = it.eaten && it.eaten > 0 ? it.eaten : 1;
  return { calories: it.calories / e, protein: it.protein / e, carbs: it.carbs / e, fat: it.fat / e };
}

/** The item as if `eaten` of its portion was eaten. */
export function withEaten(it: MealItem, eaten: number): MealItem {
  const e = Math.max(0, Math.min(10, eaten));
  const b = baseOf(it);
  return {
    ...it,
    base: b,
    eaten: e,
    calories: Math.round(b.calories * e),
    protein: Math.round(b.protein * e),
    carbs: Math.round(b.carbs * e),
    fat: Math.round(b.fat * e),
  };
}

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
  /**
   * Maintenance calories measured from real data (food log + weight trend, or
   * Garmin burn). When set, it replaces the formula estimate.
   */
  maintenance?: { kcal: number; source: MaintenanceSource } | null;
  /** Date the user wants to reach the goal by (YYYY-MM-DD). Sets the pace when given. */
  targetDate?: string | null;
  /** Today (YYYY-MM-DD), for the goal date and arrival maths. */
  today?: string | null;
};

export type MaintenanceSource = "measured" | "garmin" | "formula";

export type Plan = {
  maintenanceSource: MaintenanceSource | null;
  /** Formula-based TDEE, kept for comparison when a measured value is used. */
  formulaTdee: number | null;
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
  /** "bodyweight": protein/fat per kg; "percent": 25/30/45 % split (no weight logged). */
  macroBasis: "bodyweight" | "percent" | null;
  /** Weeks to the goal at the pace the calories actually give (after the safety floor or a custom target). */
  weeksToGoal: number | null;
  /** kg per week the calories actually give (after the safety floor or a custom target). */
  effectiveWeeklyRate: number;
  /** The goal date in use, if any. */
  targetDate: string | null;
  /** The goal date needs a faster pace than is safe, so the plan uses the safe maximum. */
  dateTooSoon: boolean;
  /** The goal date has passed, so it is ignored. */
  targetDatePassed: boolean;
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
    if (w == null) missing.push("current weight (log it on the Progress tab)");
    if (!i.sex) missing.push("sex");
    if (!i.age) missing.push("birth year");
    if (!i.heightCm) missing.push("height");
  }
  const formulaTdee =
    bmr != null && i.activityLevel ? bmr * ACTIVITY_LEVELS[i.activityLevel].factor : null;
  const measured = i.maintenance && i.maintenance.kcal > 0 ? i.maintenance : null;
  const tdee = measured ? measured.kcal : formulaTdee;
  const maintenanceSource: MaintenanceSource | null = measured
    ? measured.source
    : formulaTdee != null
      ? "formula"
      : null;
  if (measured) {
    // Real data replaces the formula, so only weight is still required.
    for (let k = missing.length - 1; k >= 0; k--) {
      if (!missing[k].startsWith("current weight")) missing.splice(k, 1);
    }
  } else if (!i.activityLevel) {
    missing.push("activity level");
  }

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

  // --- Pace: from the goal date if set, else chosen pace, else 0.5% bw/week to lose, 0.25% to gain; cap 1% / 0.5% ---
  let weeklyRate = 0;
  let rateWasCapped = false;
  let dateTooSoon = false;
  let targetDatePassed = false;
  const dateWeeks =
    i.targetDate && i.today ? (Date.parse(i.targetDate) - Date.parse(i.today)) / (7 * 86_400_000) : null;
  if (dateWeeks != null && dateWeeks <= 0) targetDatePassed = true;
  if (w != null && direction !== "maintain" && goalWeight != null) {
    const def = direction === "lose" ? w * 0.005 : w * 0.0025;
    const cap = direction === "lose" ? w * 0.01 : w * 0.005;
    if (dateWeeks != null && dateWeeks > 0) {
      weeklyRate = Math.abs(goalWeight - w) / dateWeeks;
      if (weeklyRate > cap) dateTooSoon = true;
    } else {
      weeklyRate = i.weeklyRate && i.weeklyRate > 0 ? i.weeklyRate : def;
    }
    if (weeklyRate > cap) {
      weeklyRate = cap;
      rateWasCapped = !dateTooSoon;
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
  let macroBasis: Plan["macroBasis"] = null;
  if (calorieTarget != null && w == null) {
    // No weight logged: a standard split still gives every macro a goal.
    macroBasis = "percent";
    protein = round((calorieTarget * 0.25) / 4, 5);
    fat = round((calorieTarget * 0.3) / 9, 5);
    carbs = round((calorieTarget * 0.45) / 4, 5);
  } else if (calorieTarget != null && w != null) {
    macroBasis = "bodyweight";
    const perKg = direction === "lose" ? 2.0 : 1.8;
    protein = w * perKg;
    if (leanMass != null) protein = Math.min(protein, leanMass * 2.6);
    fat = Math.max((calorieTarget * 0.25) / 9, w * 0.6);
    carbs = Math.max(0, (calorieTarget - protein * 4 - fat * 9) / 4);
    protein = round(protein, 5);
    fat = round(fat, 5);
    carbs = round(carbs, 5);
  }

  // Arrival uses the pace the calories really give: the safety floor or a custom
  // target can make it slower (or point the other way).
  let effectiveRate = weeklyRate;
  if (tdee != null && calorieTarget != null && direction !== "maintain") {
    const delta = calorieTarget - tdee;
    const right = direction === "lose" ? delta < 0 : delta > 0;
    effectiveRate = right ? (Math.abs(delta) * 7) / KCAL_PER_KG : 0;
  }
  const weeksToGoal =
    w != null && goalWeight != null && effectiveRate > 0.01
      ? Math.abs(goalWeight - w) / effectiveRate
      : null;

  return {
    maintenanceSource,
    formulaTdee: formulaTdee != null ? round(formulaTdee, 10) : null,
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
    macroBasis,
    weeksToGoal,
    effectiveWeeklyRate: Math.round(effectiveRate * 100) / 100,
    targetDate: i.targetDate && !targetDatePassed ? i.targetDate : null,
    dateTooSoon,
    targetDatePassed,
  };
}

export type PaceKey = "relaxed" | "balanced" | "aggressive";
export type PaceOption = {
  key: PaceKey;
  label: string;
  /** kg per week requested (saved when picked) */
  weeklyRate: number;
  /** kg per week you actually get after the calorie safety floor */
  effectiveRate: number;
  calories: number | null;
  /** Date the goal is reached at this pace. */
  eta: string | null;
  weeks: number | null;
  note: string;
};

/** Three ready-made paces for the current goal, each with its calories and arrival date. */
export function paceOptions(input: PlanInput): PaceOption[] {
  const base = computePlan({ ...input, targetDate: null, weeklyRate: null });
  const w = input.weight;
  if (w == null || base.direction === "maintain" || base.goalWeight == null) return [];
  const pct: Record<PaceKey, number> =
    base.direction === "lose"
      ? { relaxed: 0.0025, balanced: 0.005, aggressive: 0.0085 }
      : { relaxed: 0.001, balanced: 0.0025, aggressive: 0.004 };
  const notes: Record<PaceKey, string> =
    base.direction === "lose"
      ? {
          relaxed: "Easy to stick to. Best for keeping muscle and energy.",
          balanced: "The usual recommendation. Steady and sustainable.",
          aggressive: "Fastest safe pace. Expect more hunger; keep protein high.",
        }
      : {
          relaxed: "Slow gain, the least fat added.",
          balanced: "The usual recommendation for lean gain.",
          aggressive: "Faster gain; some of it will be fat.",
        };
  const label: Record<PaceKey, string> = { relaxed: "Relaxed", balanced: "Balanced", aggressive: "Aggressive" };
  return (["relaxed", "balanced", "aggressive"] as PaceKey[]).map((key) => {
    const rate = Math.round(w * pct[key] * 100) / 100;
    const p = computePlan({ ...input, targetDate: null, weeklyRate: rate, calorieOverride: null });
    const weeks = p.weeksToGoal;
    const eta =
      weeks != null && input.today
        ? new Date(Date.parse(input.today) + Math.ceil(weeks * 7) * 86_400_000).toISOString().slice(0, 10)
        : null;
    const effectiveRate = weeks ? Math.round((Math.abs(base.goalWeight! - w) / weeks) * 100) / 100 : rate;
    const note = p.calorieFloorApplied
      ? `${notes[key]} Calories stop at a safe minimum, so this is as fast as it goes.`
      : notes[key];
    return { key, label: label[key], weeklyRate: rate, effectiveRate, calories: p.calorieTarget, eta, weeks, note };
  });
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
    targetDate?: string | null;
  } | null,
  body: { weight: number | null; bodyFat: number | null },
  year: number = new Date().getFullYear(),
  maintenance: PlanInput["maintenance"] = null,
  today: string | null = null,
): PlanInput {
  return {
    maintenance,
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
    targetDate: g?.targetDate ?? null,
    today,
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

/** Adds an activity bonus to a day's targets (extra energy goes to carbs). */
export function withBonus(t: DailyTargets, bonus: number | undefined): DailyTargets {
  if (!t || !bonus) return t;
  return {
    ...t,
    calories: t.calories + bonus,
    carbs: t.carbs != null ? t.carbs + Math.round(bonus / 4 / 5) * 5 : null,
  };
}
