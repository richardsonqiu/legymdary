import { randomBytes } from "node:crypto";
import { authorizeUrl, ouraConfigured } from "@/lib/oura/client";
import { ouraRedirectUri, STATE_COOKIE } from "@/lib/oura/redirect";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

/**
 * Starts "Connect Oura": a one-time state (bound to this user, kept in an
 * httpOnly cookie for 10 minutes) and a redirect to Oura's sign-in page.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.id) return Response.redirect(new URL("/login", request.url));
  const back = new URL("/oura", request.url);
  if (!ouraConfigured()) {
    back.searchParams.set("error", "not_configured");
    return Response.redirect(back);
  }
  if (!(await rateLimit(`oura:connect:${user.id}`, 10, 60 * 60 * 1000)).ok) {
    back.searchParams.set("error", "too_many");
    return Response.redirect(back);
  }
  const state = `${randomBytes(24).toString("base64url")}.${user.id}`;
  const headers = new Headers({ Location: authorizeUrl(state, ouraRedirectUri(request)), "Cache-Control": "no-store" });
  const secure = new URL(request.url).protocol === "https:";
  headers.append(
    "Set-Cookie",
    `${STATE_COOKIE}=${encodeURIComponent(state)}; Path=/api/oura; Max-Age=600; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
  );
  return new Response(null, { status: 302, headers });
}
