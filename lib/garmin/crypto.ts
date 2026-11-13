import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for secrets at rest (Garmin API keys and bearer tokens).
 * The key comes from GARMIN_ENCRYPTION_KEY, falling back to AUTH_SECRET.
 * Format: v1.<iv b64url>.<tag b64url>.<ciphertext b64url>
 */
function key(): Buffer {
  const secret = process.env.GARMIN_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Set AUTH_SECRET (or GARMIN_ENCRYPTION_KEY) to store Garmin keys.");
  return createHash("sha256").update(`legymdary:garmin:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, data] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised secret format.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}
