import { invalidate, useApi } from "./useApi";

/** Query names for the Progress and Insights tabs. `invalidate(name)` refreshes every screen that reads it. */
export const PKEYS = { body: "body", plan: "plan", consistency: "consistency", insights: "insights" } as const;

export const useBodyStats = () => useApi(`${PKEYS.body}:list`, (api) => api.bodyStats());
export const usePlan = () => useApi(`${PKEYS.plan}:now`, (api) => api.plan());
export const useConsistency = () => useApi(`${PKEYS.consistency}:90`, (api) => api.consistency());
export const useInsights = (date: string | null) => useApi(`${PKEYS.insights}:${date ?? "latest"}`, (api) => api.insights(date ?? undefined));

/** A weigh-in or goal change moves the plan, today's targets and the recovery summary. */
export function invalidateBody() {
  invalidate(PKEYS.body);
  invalidate(PKEYS.plan);
  invalidate(PKEYS.insights);
  invalidate("today");
}
