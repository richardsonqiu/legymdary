import { bearerToken, resolveApiToken } from "@/lib/api-token";

export type ApiAuth = { userId: string; tokenId: string };

export function jsonError(error: string, status: number, headers?: HeadersInit) {
  return Response.json({ error }, { status, headers });
}

/**
 * Wraps an /api/v1 route handler: 401 JSON unless the request carries a valid
 * bearer token. (proxy.ts skips /api, so each route must gate itself.)
 */
export function withAuth<Ctx = unknown>(
  handler: (request: Request, auth: ApiAuth, ctx: Ctx) => Promise<Response> | Response,
) {
  return async (request: Request, ctx: Ctx) => {
    const token = bearerToken(request.headers);
    const found = token ? await resolveApiToken(token) : null;
    if (!found) return jsonError("Unauthorized", 401, { "WWW-Authenticate": "Bearer" });
    return handler(request, found, ctx);
  };
}

/** Parses a JSON body with a zod schema; returns a 400 Response on failure. */
export async function parseBody<T>(
  request: Request,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
): Promise<{ data: T } | { response: Response }> {
  const body = await request.json().catch(() => undefined);
  const r = schema.safeParse(body);
  return r.success ? { data: r.data } : { response: jsonError("Invalid request", 400) };
}
