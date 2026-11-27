import { eq } from "drizzle-orm";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { ACTIVITY_LEVELS, addDaysStr } from "@legymdary/shared";
import { DATE_RE, numOrNull } from "./util";
import { userToday } from "@/lib/session";

export async function saveGoals(userId: string, input: {
  sex?: string | null;
  birthYear?: number | string | null;
  heightCm?: number | string | null;
  activityLevel?: string | null;
  targetWeight?: number | string | null;
  targetBodyFat?: number | string | null;
  weeklyRate?: number | string | null;
  calorieOverride?: number | string | null;
}): Promise<{ ok: true } | { error: string }> {  const inRange = (v: number | null, lo: number, hi: number) =>
    v == null || (v >= lo && v <= hi);

  const sex = input.sex === "male" || input.sex === "female" ? input.sex : null;
  const birthYear = numOrNull(input.birthYear);
  const heightCm = numOrNull(input.heightCm);
  const activityLevel =
    input.activityLevel && input.activityLevel in ACTIVITY_LEVELS
      ? input.activityLevel
      : null;
  const targetWeight = numOrNull(input.targetWeight);
  const targetBodyFat = numOrNull(input.targetBodyFat);
  const weeklyRate = numOrNull(input.weeklyRate);
  const calorieOverride = numOrNull(input.calorieOverride);

  const thisYear = new Date().getFullYear();
  if (!inRange(birthYear, thisYear - 100, thisYear - 13))
    return { error: "Birth year looks off." };
  if (!inRange(heightCm, 100, 250)) return { error: "Height should be in cm (100–250)." };
  if (!inRange(targetWeight, 30, 300)) return { error: "Target weight should be 30–300 kg." };
  if (!inRange(targetBodyFat, 3, 60)) return { error: "Target body fat should be 3–60%." };
  if (!inRange(weeklyRate, 0, 2)) return { error: "Weekly pace should be 0–2 kg." };
  if (!inRange(calorieOverride, 800, 6000))
    return { error: "Custom calorie target should be 800–6000 kcal." };

  const vals = {
    sex,
    birthYear: birthYear != null ? Math.round(birthYear) : null,
    heightCm,
    activityLevel,
    targetWeight,
    targetBodyFat,
    // Pace and goal date are set by the pace chooser; only change them when sent.
    ...("weeklyRate" in input ? { weeklyRate } : {}),
    calorieOverride,
    updatedAt: new Date(),
  };
  await db
    .insert(goals)
    .values({ userId, ...vals })
    .onConflictDoUpdate({ target: goals.userId, set: vals });  return { ok: true };
}

/**
 * Sets how fast to reach the goal: either a weekly pace (one of the suggested
 * options) or a date to reach it by. Setting one clears the other.
 */
export async function setGoalPace(userId: string, 
  input: { weeklyRate: number } | { targetDate: string },
): Promise<{ ok: true } | { error: string }> {  // Choosing a pace or date means "use the plan", so it also clears custom calories.
  let vals: { weeklyRate: number | null; targetDate: string | null; calorieOverride: null };
  if ("targetDate" in input) {
    const today = await userToday();
    if (!DATE_RE.test(input.targetDate ?? "")) return { error: "Pick a date." };
    if (input.targetDate <= today) return { error: "Pick a date in the future." };
    if (input.targetDate > addDaysStr(today, 3 * 365)) return { error: "Pick a date within 3 years." };
    vals = { weeklyRate: null, targetDate: input.targetDate, calorieOverride: null };
  } else {
    const r = numOrNull(input.weeklyRate);
    if (r == null || r <= 0 || r > 2) return { error: "That pace looks off." };
    vals = { weeklyRate: Math.round(r * 100) / 100, targetDate: null, calorieOverride: null };
  }
  await db
    .insert(goals)
    .values({ userId, ...vals, updatedAt: new Date() })
    .onConflictDoUpdate({ target: goals.userId, set: { ...vals, updatedAt: new Date() } });  return { ok: true };
}

/** "steady": the daily target stays put (extra exercise = extra deficit). "adaptive": it follows burn and weight. */
export async function setTargetMode(userId: string, mode: string): Promise<{ ok: true } | { error: string }> {  if (mode !== "steady" && mode !== "adaptive") return { error: "Unknown option." };
  const res = await db.update(goals).set({ targetMode: mode, updatedAt: new Date() }).where(eq(goals.userId, userId));
  if (!res.rowsAffected) return { error: "Set your goal first." };  return { ok: true };
}
