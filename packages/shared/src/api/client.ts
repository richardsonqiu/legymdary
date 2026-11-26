import type { z } from "zod";
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
  /** Called when the server answers 401 for a request that carried a token. */
  onUnauthorized?: () => void;
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

  async function request<S extends z.ZodType>(method: "GET" | "POST", path: string, schema: S, body?: unknown): Promise<z.output<S>> {
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
      if (res.status === 401 && token) opts.onUnauthorized?.();
      const err = apiErrorSchema.safeParse(json);
      throw new ApiClientError(res.status, err.success ? err.data.error : `Request failed (${res.status})`);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiClientError(res.status, "Unexpected response from the server.");
    return parsed.data;
  }

  return {
    login: (body: LoginRequest): Promise<AuthResponse> => request("POST", "/api/v1/auth/login", authResponseSchema, body),
    logout: (): Promise<LogoutResponse> => request("POST", "/api/v1/auth/logout", logoutResponseSchema, {}),
    me: (): Promise<MeResponse> => request("GET", "/api/v1/me", meResponseSchema),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
