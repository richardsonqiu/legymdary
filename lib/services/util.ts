import { todayStr } from "@legymdary/shared";

/** An error whose message is safe to show the user (bad input, not found). Routes answer it with 400. */
export class UserError extends Error {}

/** A UserError for a rate limit. Routes answer it with 429 and Retry-After. */
export class RateLimitError extends UserError {
  constructor(message: string, readonly retryAfterSec: number) {
    super(message);
  }
}

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD string that is a real calendar date, else the fallback. */
export function safeDate(v: unknown, fallback = todayStr()): string {
  if (typeof v !== "string" || !DATE_ONLY.test(v)) return fallback;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? fallback : v;
}

export const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export const HOUR = 60 * 60 * 1000;

export const DAY = 24 * HOUR;

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const IMAGE_DATA_URL_RE =
  /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

/** Minutes after midnight, 0 to 1439. */
export function clockMinutes(v: unknown): number | null {
  const n = numOrNull(v);
  return n == null || !Number.isFinite(n) ? null : Math.max(0, Math.min(1439, Math.round(n)));
}
