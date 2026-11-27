import { jsonError, withAuth, type ApiAuth } from "@/lib/api-auth";
import { RateLimitError, UserError } from "./util";

const NO_STORE = { "Cache-Control": "no-store" };

export function ok(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

export function fail(error: string, status = 400) {
  return jsonError(error, status, NO_STORE);
}

/** For services that return `{ error }` instead of throwing: 400 with the message, else the body. */
export function fromResult<T extends object>(r: T | { error: string }, status = 200) {
  return "error" in r && typeof r.error === "string" ? fail(r.error) : ok(r, status);
}

/**
 * An /api/v1 handler behind bearer auth: 401 JSON without a valid token, 400 for a UserError
 * from a service, 500 (logged) for anything else. Every answer is `Cache-Control: no-store`.
 */
export function route<Ctx = unknown>(
  handler: (request: Request, auth: ApiAuth, ctx: Ctx) => Promise<Response> | Response,
) {
  const wrapped = withAuth<Ctx>(async (request, auth, ctx) => {
    try {
      return await handler(request, auth, ctx);
    } catch (e) {
      if (e instanceof RateLimitError) {
        return jsonError(e.message, 429, { ...NO_STORE, "Retry-After": String(e.retryAfterSec) });
      }
      if (e instanceof UserError) return fail(e.message);
      console.error("[api/v1] unhandled:", e);
      return fail("Server error", 500);
    }
  });
  return async (request: Request, ctx: Ctx) => {
    const res = await wrapped(request, ctx);
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
}

/** Parses a JSON body with a zod schema, or throws a 400-mapped UserError. */
export async function body<T>(
  request: Request,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
): Promise<T> {
  const r = schema.safeParse(await request.json().catch(() => undefined));
  if (!r.success) throw new UserError("Invalid request");
  return r.data;
}

/** The `[id]` path segment as a positive integer, or a 400. */
export async function idOf(ctx: { params: Promise<{ id: string }> }): Promise<number> {
  const { id } = await ctx.params;
  if (!/^\d{1,12}$/.test(id) || Number(id) <= 0) throw new UserError("Invalid id");
  return Number(id);
}

export type IdCtx = { params: Promise<{ id: string }> };

/** A YYYY-MM-DD query value, or the fallback when absent; a bad value is a 400. */
export function dateParam(url: URL, name: string, fallback: string): string {
  const v = url.searchParams.get(name);
  if (v == null) return fallback;
  const d = new Date(`${v}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    throw new UserError(`Invalid ${name}`);
  }
  return v;
}
