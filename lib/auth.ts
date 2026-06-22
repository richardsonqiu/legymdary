export const AUTH_COOKIE = "legymdary_auth";

/**
 * Derive an opaque cookie token from the password using Web Crypto (available
 * in both the Edge middleware runtime and Node), so the raw password is never
 * stored in the cookie.
 */
export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`legymdary:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
