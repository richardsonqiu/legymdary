/** The OAuth redirect URI registered with Oura: OURA_REDIRECT_URI, else this site's /api/oura/callback. */
export function ouraRedirectUri(request: Request): string {
  const fixed = process.env.OURA_REDIRECT_URI;
  if (fixed) return fixed;
  return `${new URL(request.url).origin}/api/oura/callback`;
}

export const STATE_COOKIE = "oura_oauth_state";
