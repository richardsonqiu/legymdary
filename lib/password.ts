import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

/** Hash a password as `salt:hash` using scrypt (built into Node). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

/** Constant-time verify of a password against a stored `salt:hash`. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = await scrypt(password, salt, 64);
  const hashBuf = Buffer.from(hash, "hex");
  return (
    hashBuf.length === derived.length && timingSafeEqual(hashBuf, derived)
  );
}
