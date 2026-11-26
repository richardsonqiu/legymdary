import { localDateMinutes, type CreateExerciseRequest, type LogSetRequest, type MealInputDto } from "@legymdary/shared";
import { useEffect, useState } from "react";
import { deviceTimeZone, useAuth } from "../auth";
import { KEYS, invalidate, useApi } from "./useApi";

export { useMutation } from "./useMutation";
export { invalidate, useApi, useRefreshAll, errorMessage, KEYS } from "./useApi";

/** Today's date (YYYY-MM-DD) in the device zone, the same date the server derives from X-Timezone. */
export const deviceToday = () => localDateMinutes(new Date(), deviceTimeZone()).date;

export const useToday = (date?: string) => useApi(`${KEYS.today}:${date ?? "now"}`, (api) => api.today(date));
export const useMeals = (date: string) => useApi(`${KEYS.meals}:${date}`, (api) => api.meals(date));
export const useRecentMeals = (limit = 6) => useApi(`${KEYS.recent}:${limit}`, (api) => api.recentMeals(limit));
export const useActiveWorkout = () => useApi(`${KEYS.workout}:active`, (api) => api.activeWorkout());
export const useLastWorkouts = (limit = 1) => useApi(`${KEYS.workout}:last:${limit}`, (api) => api.workouts(limit));
export const useWorkout = (id: number) => useApi(`${KEYS.workout}:one:${id}`, (api) => api.workout(id));
export const useExercises = () => useApi(KEYS.exercises, (api) => api.exercises());
export const useTemplates = () => useApi(KEYS.templates, (api) => api.templates());

/** Meal photo source with the bearer header, or null while loading. */
export function useMealPhoto(id: number, enabled: boolean) {
  const { api } = useAuth();
  const [src, setSrc] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    api.mealPhoto(id).then((s) => live && setSrc(s), () => {});
    return () => {
      live = false;
    };
  }, [api, id, enabled]);
  return src;
}

/** Food writes. Each one refreshes everything that shows meals or today's totals. */
export function useFoodActions() {
  const { api } = useAuth();
  const done = <T,>(p: Promise<T>) =>
    p.then((r) => {
      invalidate(KEYS.meals);
      invalidate(KEYS.today);
      invalidate(KEYS.recent);
      return r;
    });
  return {
    createMeal: (m: MealInputDto) => done(api.createMeal(m)),
    updateMeal: (id: number, m: MealInputDto) => done(api.updateMeal(id, m)),
    deleteMeal: (id: number) => done(api.deleteMeal(id)),
    relogMeal: (id: number, date: string, mealType?: string) => done(api.relogMeal(id, { date, mealType })),
    skipMeal: (date: string, mealType: string) => done(api.skipMeal({ date, mealType })),
    unskipMeal: (date: string, mealType: string) => done(api.unskipMeal({ date, mealType })),
  };
}

/** Workout writes. Each one refreshes everything that shows workouts, plus today (it carries the active workout id). */
export function useWorkoutActions() {
  const { api } = useAuth();
  const done = <T,>(p: Promise<T>) =>
    p.then((r) => {
      invalidate(KEYS.workout);
      invalidate(KEYS.today);
      return r;
    });
  return {
    createWorkout: (name: string, date: string) => done(api.createWorkout({ name, date })),
    startRecommended: () => done(api.startRecommendedWorkout()),
    startFromTemplate: (templateId: number, date: string) => done(api.startFromTemplate({ templateId, date })).then((r) => (invalidate(KEYS.templates), r)),
    finish: (id: number) => done(api.finishWorkout(id)),
    discard: (id: number) => done(api.discardWorkout(id)),
    addExercise: (workoutId: number, exerciseId: number) => done(api.addWorkoutExercise(workoutId, exerciseId)),
    removeExercise: (workoutExerciseId: number) => done(api.removeWorkoutExercise(workoutExerciseId)),
    logSet: (workoutExerciseId: number, set: LogSetRequest) => done(api.logSet(workoutExerciseId, set)),
    deleteSet: (id: number) => done(api.deleteSet(id)),
    createExercise: (e: CreateExerciseRequest) => api.createExercise(e).then((r) => (invalidate(KEYS.exercises), r)),
  };
}
