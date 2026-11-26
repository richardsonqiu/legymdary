import type { z } from "zod";
import {
  mealAnalysisSchema,
  mealCreatedResponseSchema,
  mealResponseSchema,
  mealsResponseSchema,
  okResponseSchema,
  todayResponseSchema,
  type AnalyzeMealRequest,
  type MealAnalysisDto,
  type MealCreatedResponse,
  type MealInputDto,
  type MealResponse,
  type MealsResponse,
  type OkResponse,
  type RelogMealRequest,
  type SkipMealRequest,
  type TodayResponse,
} from "./food";
import type { HealthBatchRequest } from "./health";
import { progressMethods } from "./progress-client";
import {
  exercisesResponseSchema,
  logSetResponseSchema,
  templatesResponseSchema,
  workoutExerciseIdResponseSchema,
  workoutIdResponseSchema,
  workoutResponseSchema,
  workoutsResponseSchema,
  type CreateExerciseRequest,
  type CreateWorkoutRequest,
  type ExercisesResponse,
  type FromTemplateRequest,
  type LogSetRequest,
  type LogSetResponse,
  type TemplatesResponse,
  type WorkoutIdResponse,
  type WorkoutResponse,
  type WorkoutsResponse,
} from "./workouts";
import {
  apiErrorSchema,
  authResponseSchema,
  logoutResponseSchema,
  meResponseSchema,
  type AuthResponse,
  type LoginRequest,
  type LogoutResponse,
  type MeResponse,
} from "./auth";

/** The slice of `fetch` this client uses, so it needs no DOM or Node typings. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; ok: boolean; json(): Promise<unknown> }>;

export type ApiClientOptions = {
  /** Origin of the web app, e.g. https://legymdary.vercel.app (no trailing slash needed). */
  baseUrl: string;
  /** The stored app token, or null when signed out. Read on every request. */
  getToken: () => Promise<string | null> | string | null;
  /** Device IANA zone, sent as X-Timezone so the server computes "today" correctly. */
  timeZone: () => string;
  /** Called when the server answers 401 for a request that carried a token. Gets the token that was sent, so the caller can ignore a stale one. */
  onUnauthorized?: (sentToken: string) => void;
  fetch?: FetchLike;
};

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

/** Typed client for /api/v1. Every response is parsed with the shared zod schema. */
export function createApiClient(opts: ApiClientOptions) {
  const doFetch: FetchLike = opts.fetch ?? (globalThis as unknown as { fetch: FetchLike }).fetch;
  const base = opts.baseUrl.replace(/\/+$/, "");

  async function request<S extends z.ZodType>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, schema: S, body?: unknown): Promise<z.output<S>> {
    const token = await opts.getToken();
    const headers: Record<string, string> = { Accept: "application/json", "X-Timezone": opts.timeZone() };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res;
    try {
      res = await doFetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiClientError(0, "Can't reach the server. Check your connection.");
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      if (res.status === 401 && token) opts.onUnauthorized?.(token);
      const err = apiErrorSchema.safeParse(json);
      throw new ApiClientError(res.status, err.success ? err.data.error : res.status === 429 ? "Too many requests. Wait a moment and try again." : `Request failed (${res.status})`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiClientError(res.status, "Unexpected response from the server.");
    return parsed.data;
  }

  return {
    ...progressMethods(request),
    login: (body: LoginRequest): Promise<AuthResponse> => request("POST", "/api/v1/auth/login", authResponseSchema, body),
    logout: (): Promise<LogoutResponse> => request("POST", "/api/v1/auth/logout", logoutResponseSchema, {}),
    me: (): Promise<MeResponse> => request("GET", "/api/v1/me", meResponseSchema),

    today: (date?: string): Promise<TodayResponse> => request("GET", `/api/v1/today${date ? `?date=${date}` : ""}`, todayResponseSchema),
    /** Meals from `from` to `to` (YYYY-MM-DD, up to 62 days). */
    meals: (from: string, to: string = from): Promise<MealsResponse> => request("GET", `/api/v1/meals?from=${from}&to=${to}`, mealsResponseSchema),
    recentMeals: (limit = 6): Promise<MealsResponse> => request("GET", `/api/v1/meals/recent?limit=${limit}`, mealsResponseSchema),
    meal: (id: number): Promise<MealResponse> => request("GET", `/api/v1/meals/${id}`, mealResponseSchema),
    createMeal: (body: MealInputDto): Promise<MealCreatedResponse> => request("POST", "/api/v1/meals", mealCreatedResponseSchema, body),
    updateMeal: (id: number, body: MealInputDto): Promise<MealResponse> => request("PATCH", `/api/v1/meals/${id}`, mealResponseSchema, body),
    deleteMeal: (id: number): Promise<OkResponse> => request("DELETE", `/api/v1/meals/${id}`, okResponseSchema, {}),
    analyzeMeal: (body: AnalyzeMealRequest): Promise<MealAnalysisDto> => request("POST", "/api/v1/meals/analyze", mealAnalysisSchema, body),
    relogMeal: (id: number, body: RelogMealRequest): Promise<OkResponse> => request("POST", `/api/v1/meals/${id}/relog`, okResponseSchema, body),
    skipMeal: (body: SkipMealRequest): Promise<OkResponse> => request("POST", "/api/v1/meals/skip", okResponseSchema, body),
    unskipMeal: (body: SkipMealRequest): Promise<OkResponse> => request("DELETE", "/api/v1/meals/skip", okResponseSchema, body),
    activeWorkout: (): Promise<WorkoutResponse> => request("GET", "/api/v1/workouts/active", workoutResponseSchema),
    workouts: (limit = 30): Promise<WorkoutsResponse> => request("GET", `/api/v1/workouts?limit=${limit}`, workoutsResponseSchema),
    workout: (id: number): Promise<WorkoutResponse> => request("GET", `/api/v1/workouts/${id}`, workoutResponseSchema),
    createWorkout: (body: CreateWorkoutRequest): Promise<WorkoutIdResponse> => request("POST", "/api/v1/workouts", workoutIdResponseSchema, body),
    /** Starts today's recommended session. Fails (400) while another workout is unfinished. */
    startRecommendedWorkout: (): Promise<WorkoutIdResponse> => request("POST", "/api/v1/workouts/recommended", workoutIdResponseSchema, {}),
    startFromTemplate: (body: FromTemplateRequest): Promise<WorkoutIdResponse> => request("POST", "/api/v1/workouts/from-template", workoutIdResponseSchema, body),
    finishWorkout: (id: number): Promise<WorkoutResponse> => request("POST", `/api/v1/workouts/${id}/finish`, workoutResponseSchema, {}),
    /** Deletes the workout with its exercises and sets. */
    discardWorkout: (id: number): Promise<OkResponse> => request("DELETE", `/api/v1/workouts/${id}`, okResponseSchema, {}),
    addWorkoutExercise: (workoutId: number, exerciseId: number): Promise<{ workoutExerciseId: number }> =>
      request("POST", `/api/v1/workouts/${workoutId}/exercises`, workoutExerciseIdResponseSchema, { exerciseId }),
    removeWorkoutExercise: (workoutExerciseId: number): Promise<OkResponse> => request("DELETE", `/api/v1/workout-exercises/${workoutExerciseId}`, okResponseSchema, {}),
    logSet: (workoutExerciseId: number, body: LogSetRequest): Promise<LogSetResponse> =>
      request("POST", `/api/v1/workout-exercises/${workoutExerciseId}/sets`, logSetResponseSchema, body),
    syncHealthBatch: (body: HealthBatchRequest): Promise<OkResponse> => request("POST", "/api/v1/health/batch", okResponseSchema, body),
    deleteSet: (id: number): Promise<OkResponse> => request("DELETE", `/api/v1/sets/${id}`, okResponseSchema, {}),
    exercises: (): Promise<ExercisesResponse> => request("GET", "/api/v1/exercises", exercisesResponseSchema),
    createExercise: (body: CreateExerciseRequest): Promise<WorkoutIdResponse> => request("POST", "/api/v1/exercises", workoutIdResponseSchema, body),
    templates: (): Promise<TemplatesResponse> => request("GET", "/api/v1/templates", templatesResponseSchema),
    /** Image source for a meal photo: the route needs the bearer token, so pass this to <Image source>. */
    mealPhoto: async (id: number): Promise<{ uri: string; headers: Record<string, string> }> => {
      const token = await opts.getToken();
      return { uri: `${base}/api/v1/meals/${id}/photo`, headers: token ? { Authorization: `Bearer ${token}` } : {} };
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
