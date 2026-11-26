import { loginRequestSchema, type AuthResponse } from "@legymdary/shared";
import { jsonError, parseBody } from "@/lib/api-auth";
import { createApiToken } from "@/lib/api-token";
import { checkCredentials } from "@/lib/credentials";
import { tooMany } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const parsed = await parseBody(request, loginRequestSchema);
  if ("response" in parsed) return parsed.response;
  const { email, password, deviceName } = parsed.data;

  const r = await checkCredentials(email, password, request.headers);
  if (!r.ok) {
    if (r.reason === "rate_limited") {
      return jsonError(tooMany(r.retryAfterSec), 429, { "Retry-After": String(r.retryAfterSec) });
    }
    return jsonError("Invalid email or password", 401);
  }

  const { token, expiresAt } = await createApiToken(r.user.id, deviceName);
  const body: AuthResponse = { token, expiresAt: expiresAt.toISOString(), user: r.user };
  return Response.json(body);
}
