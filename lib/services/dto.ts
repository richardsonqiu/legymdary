import type {
  BodyStatDto,
  ExerciseDto,
  GoalsDto,
  MealDto,
  Plan,
  PlanDto,
  WorkoutDto,
} from "@legymdary/shared";
import { parseItems } from "@legymdary/shared";
import type { BodyStat, Exercise, Goals, Meal } from "@/db/schema";
import type { WorkoutDetail } from "@/lib/queries";

/** Row to wire shape: no Drizzle types, dates as ISO strings, JSON columns parsed. */

export function mealDto(m: Meal): MealDto {
  return {
    id: m.id,
    date: m.date,
    mealType: m.mealType,
    name: m.name,
    calories: m.calories,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    items: parseItems(m.items),
    notes: m.notes,
    aiEstimated: m.aiEstimated,
    eatenAt: m.eatenAt ?? null,
    fiber: m.fiber ?? null,
    sugar: m.sugar ?? null,
    processing: m.processing ?? null,
    advisor: m.advisor ?? null,
    hasPhoto: !!m.photo,
    createdAt: new Date(m.createdAt).toISOString(),
  };
}

export const workoutDto = (w: WorkoutDetail): WorkoutDto => w;

export function exerciseDto(e: Exercise): ExerciseDto {
  return { id: e.id, name: e.name, muscleGroup: e.muscleGroup, equipment: e.equipment, isCustom: e.isCustom };
}

export function bodyStatDto(b: BodyStat): BodyStatDto {
  return { id: b.id, date: b.date, weight: b.weight, waist: b.waist, bodyFat: b.bodyFat, source: b.source };
}

export function goalsDto(g: Goals): GoalsDto {
  return {
    sex: g.sex,
    birthYear: g.birthYear,
    heightCm: g.heightCm,
    activityLevel: g.activityLevel,
    targetWeight: g.targetWeight,
    targetBodyFat: g.targetBodyFat,
    weeklyRate: g.weeklyRate,
    targetDate: g.targetDate,
    calorieOverride: g.calorieOverride,
    targetMode: g.targetMode === "adaptive" ? "adaptive" : "steady",
    trainingDays: g.trainingDays,
  };
}

export function planDto(p: Plan): PlanDto {
  return {
    missing: p.missing,
    maintenanceSource: p.maintenanceSource,
    bmr: p.bmr,
    tdee: p.tdee,
    goalWeight: p.goalWeight,
    direction: p.direction,
    weeklyRate: p.weeklyRate,
    dailyDelta: p.dailyDelta,
    calorieTarget: p.calorieTarget,
    protein: p.protein,
    carbs: p.carbs,
    fat: p.fat,
    weeksToGoal: p.weeksToGoal,
    targetDate: p.targetDate,
    usingOverride: p.usingOverride,
  };
}
