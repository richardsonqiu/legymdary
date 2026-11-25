/**
 * Server-only. Oura API v2 over OAuth2 (authorization code flow).
 *
 * Oura retired personal access tokens in December 2025, so every user
 * connects through OAuth. The app owner registers one Oura application at
 * https://cloud.ouraring.com/oauth/applications with the redirect URI
 * `<APP_URL>/api/oura/callback` and sets OURA_CLIENT_ID / OURA_CLIENT_SECRET.
 * A new application can connect up to 10 users until Oura approves it.
 *
 * Endpoint paths and field names follow Oura's OpenAPI spec (v2
 * /usercollection/*). Refresh tokens are single use: each refresh returns a
 * new one, which the caller must store.
 */

const AUTH_BASE = (process.env.OURA_AUTH_BASE || "https://cloud.ouraring.com").replace(/\/+$/, "");
const API_BASE = (process.env.OURA_API_BASE || "https://api.ouraring.com").replace(/\/+$/, "");
/** Space-separated. "daily" covers sleep, readiness, activity, stress, resilience. */
export const OURA_SCOPES = (process.env.OURA_SCOPES || "personal daily workout spo2").trim();

export function ouraConfigured(): boolean {
  return !!process.env.OURA_CLIENT_ID && !!process.env.OURA_CLIENT_SECRET;
}

export class OuraError extends Error {
  constructor(
    message: string,
    public status: number,
    /** The token is no longer valid: the user must connect again. */
    public isAuth = false,
  ) {
    super(message);
  }
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const u = new URL(`${AUTH_BASE}/oauth/authorize`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.OURA_CLIENT_ID ?? "");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", OURA_SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

export type OuraTokens = { accessToken: string; refreshToken: string; expiresAt: Date; scope: string };

async function tokenRequest(params: Record<string, string>): Promise<OuraTokens> {
  const body = new URLSearchParams({
    ...params,
    client_id: process.env.OURA_CLIENT_ID ?? "",
    client_secret: process.env.OURA_CLIENT_SECRET ?? "",
  });
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new OuraError("Couldn't reach Oura. Try again in a minute.", 0);
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || !json || typeof json.access_token !== "string" || typeof json.refresh_token !== "string") {
    const code = typeof json?.error === "string" ? json.error : "";
    const auth = res.status === 400 || res.status === 401 || code === "invalid_grant";
    throw new OuraError(auth ? "Oura didn't accept the sign-in. Connect again." : `Oura sign-in failed (${res.status}).`, res.status, auth);
  }
  const expiresIn = typeof json.expires_in === "number" && json.expires_in > 0 ? json.expires_in : 86_400;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scope: typeof json.scope === "string" ? json.scope : OURA_SCOPES,
  };
}

export const exchangeCode = (code: string, redirectUri: string) =>
  tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });

export const refreshTokens = (refreshToken: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

/** Revokes an access token (best effort). */
export async function revokeToken(accessToken: string): Promise<void> {
  await fetch(`${API_BASE}/oauth/revoke?access_token=${encodeURIComponent(accessToken)}`, {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => {});
}

function errorFor(status: number): OuraError {
  if (status === 401) return new OuraError("Oura sign-in expired. Connect again.", status, true);
  if (status === 403) return new OuraError("Oura refused access. An Oura Membership is needed for Gen3 and newer rings, or the app is missing a permission.", status);
  if (status === 426) return new OuraError("Open the Oura app on your phone and update it, then sync again.", status);
  if (status === 429) return new OuraError("Oura is rate limiting requests. Try again in a few minutes.", status);
  return new OuraError(`Oura returned an error (${status}).`, status);
}

/** GET a usercollection list, following next_token pages. */
export async function listCollection<T = Record<string, unknown>>(
  token: string,
  collection: string,
  params: Record<string, string>,
): Promise<T[]> {
  if (!/^[a-zA-Z0-9_]+$/.test(collection)) throw new Error("bad collection");
  const out: T[] = [];
  let next: string | null = null;
  for (let page = 0; page < 20; page++) {
    const u = new URL(`${API_BASE}/v2/usercollection/${collection}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (next) u.searchParams.set("next_token", next);
    let res: Response;
    try {
      res = await fetch(u, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
    } catch {
      throw new OuraError("Couldn't reach Oura. Try again in a minute.", 0);
    }
    if (!res.ok) throw errorFor(res.status);
    const json = (await res.json().catch(() => null)) as { data?: unknown; next_token?: unknown } | null;
    if (!json || !Array.isArray(json.data)) throw new OuraError("Oura sent an unexpected response.", res.status);
    out.push(...(json.data as T[]));
    next = typeof json.next_token === "string" && json.next_token ? json.next_token : null;
    if (!next) break;
  }
  return out;
}

export async function getPersonalInfo(token: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${API_BASE}/v2/usercollection/personal_info`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
