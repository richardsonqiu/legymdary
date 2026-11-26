import type { ApiClient, HealthSource, RawHealth } from "@legymdary/shared";

/**
 * "needs_install": Health Connect is missing or needs an update (Android).
 * "unavailable": no health store on this device (or this build has no native module, e.g. Expo Go).
 * "needed": not asked yet, or the user turned everything off.
 * "granted": at least one permission is on. HealthKit never says which reads are allowed, so on iOS this means "asked".
 */
export type PermissionState = "unavailable" | "needs_install" | "needed" | "granted";

export type SyncResult = { from: string; to: string; requests: number; /** true when the read returned nothing at all: nothing was posted and the cursor did not move. */ empty: boolean; days: number; sleep: number; workouts: number; body: number };

/** The API every platform file exports (health.ios.ts, health.android.ts, and the health.ts fallback). */
export type HealthApi = {
  isAvailable: () => Promise<boolean>;
  getPermissionState: () => Promise<PermissionState>;
  /** Shows the OS permission sheet. Resolves true when the app may read something. */
  requestPermissions: () => Promise<boolean>;
  /** Reads steps, energy, resting HR, HRV, sleep, weight, body fat and workouts for from..to (YYYY-MM-DD, device zone). */
  read: (from: string, to: string) => Promise<RawHealth>;
  /** Reads what changed since the last sync, posts it to /api/v1/health/batch in chunks, then saves the cursor. */
  /** Names of read types that are switched off (Android only; empty elsewhere). */
  missingPermissions: () => Promise<string[]>;
  /** `full` ignores the cursor and reads the first-sync window (30 days) again. */
  sync: (api: Pick<ApiClient, "syncHealthBatch">, userId: string, opts?: { full?: boolean }) => Promise<SyncResult>;
};

export type { HealthSource };
