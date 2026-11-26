import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Client IDs allowed as `aud`: the native apps and the web client. */
function allowedAudiences(): string[] {
  return [process.env.GOOGLE_IOS_CLIENT_ID, process.env.GOOGLE_ANDROID_CLIENT_ID, process.env.AUTH_GOOGLE_ID].filter(
    (v): v is string => !!v,
  );
}

/**
 * Verifies a Google ID token (signature via Google's JWKS, aud, iss, exp) and
 * returns its `sub`. Returns null for anything invalid, or when the email is
 * not verified. The caller must look the user up by `sub` only.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<{ sub: string } | null> {
  const audience = allowedAudiences();
  if (audience.length === 0) return null;
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
    });
    if ((payload.email_verified !== true && payload.email_verified !== "true") || typeof payload.sub !== "string" || !payload.sub) return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}
