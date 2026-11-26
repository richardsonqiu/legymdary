import type { z } from "zod";
import { okResponseSchema, type OkResponse } from "./food";
import {
  bodyStatsResponseSchema,
  consistencyResponseSchema,
  planResponseSchema,
  type BodyStatsResponse,
  type ConsistencyResponse,
  type GoalPaceRequest,
  type LogBodyStatRequest,
  type PlanResponse,
  type SaveGoalsRequest,
  type TargetModeRequest,
} from "./body-plan";
import { insightsResponseSchema, type InsightsResponse } from "./insights";

/** The typed request function `createApiClient` hands to this file. */
export type Requester = <S extends z.ZodType>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  schema: S,
  body?: unknown,
) => Promise<z.output<S>>;

/** Client methods for the Progress and Insights screens. Spread into the client in client.ts. */
export function progressMethods(request: Requester) {
  return {
    bodyStats: (): Promise<BodyStatsResponse> => request("GET", "/api/v1/body-stats", bodyStatsResponseSchema),
    logBodyStat: (body: LogBodyStatRequest): Promise<OkResponse> => request("POST", "/api/v1/body-stats", okResponseSchema, body),
    deleteBodyStat: (id: number): Promise<OkResponse> => request("DELETE", `/api/v1/body-stats/${id}`, okResponseSchema, {}),
    plan: (): Promise<PlanResponse> => request("GET", "/api/v1/plan", planResponseSchema),
    saveGoals: (body: SaveGoalsRequest): Promise<OkResponse> => request("PUT", "/api/v1/plan/goals", okResponseSchema, body),
    setGoalPace: (body: GoalPaceRequest): Promise<OkResponse> => request("PUT", "/api/v1/plan/pace", okResponseSchema, body),
    setTargetMode: (body: TargetModeRequest): Promise<OkResponse> => request("PUT", "/api/v1/plan/mode", okResponseSchema, body),
    consistency: (from?: string, to?: string): Promise<ConsistencyResponse> =>
      request("GET", `/api/v1/stats/consistency${from && to ? `?from=${from}&to=${to}` : ""}`, consistencyResponseSchema),
    insights: (date?: string): Promise<InsightsResponse> => request("GET", `/api/v1/insights${date ? `?date=${date}` : ""}`, insightsResponseSchema),
  };
}
