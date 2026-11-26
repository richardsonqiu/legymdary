import { localDateMinutes, type MealInputDto } from "@legymdary/shared";
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
