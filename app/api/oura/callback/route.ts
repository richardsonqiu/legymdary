import { createHash, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { exchangeCode, OuraError } from "@/lib/oura/client";
import { ouraRedirectUri, STATE_COOKIE } from "@/lib/oura/redirect";
import { storeTokens, syncOuraForUser } from "@/lib/oura/sync";
import { getSessionUser } from "@/lib/session";

const same = (a: string, b: string) => {
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(a), h(b));
};

function cookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/**
 * Oura sends the user back here. The state must match the cookie set by
 * /api/oura/connect and name the signed-in user; then the code is exchanged
 * for tokens (stored encrypted) and the first 90-day sync starts in the background.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = new URL("/oura", request.url);
  const done = (params: Record<string, string>) => {
    for (const [k, v] of Object.entries(params)) back.searchParams.set(k, v);
    const headers = new Headers({ Location: back.toString() });
    headers.append("Set-Cookie", `${STATE_COOKIE}=; Path=/api/oura; Max-Age=0; HttpOnly; SameSite=Lax`);
    return new Response(null, { status: 302, headers });
  };

  const user = await getSessionUser();
  if (!user?.id) return Response.redirect(new URL("/login", request.url));
  const state = url.searchParams.get("state") ?? "";
  const expected = cookie(request, STATE_COOKIE);
  if (!expected || !state || !same(state, expected) || !state.endsWith(`.${user.id}`)) {
    return done({ error: "state" });
  }
  if (url.searchParams.get("error")) return done({ error: "denied" });
  const code = url.searchParams.get("code");
  if (!code || code.length > 2000) return done({ error: "denied" });

  try {
    const tokens = await exchangeCode(code, ouraRedirectUri(request));
    await storeTokens(user.id, tokens);
  } catch (err) {
    console.error("[oura] token exchange failed:", err instanceof OuraError ? err.status : err);
    return done({ error: "exchange" });
  }
  const userId = user.id;
  after(async () => {
    await syncOuraForUser(userId).catch((err) => console.error("[oura] first sync failed:", err));
  });
  return done({ connected: "1" });
}
