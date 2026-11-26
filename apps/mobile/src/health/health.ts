import { emptyRawHealth } from "@legymdary/shared";
import type { HealthApi } from "./types";

/**
 * Fallback for platforms without a health store (web). iOS uses health.ios.ts and Android health.android.ts;
 * Metro picks the platform file, and all three export the same API (see HealthApi).
 */
export const isAvailable: HealthApi["isAvailable"] = async () => false;
export const getPermissionState: HealthApi["getPermissionState"] = async () => "unavailable";
export const requestPermissions: HealthApi["requestPermissions"] = async () => false;
export const read: HealthApi["read"] = async () => emptyRawHealth();
export const sync: HealthApi["sync"] = async () => {
  throw new Error("Health sync is not available on this platform.");
};
export const healthName = "Health";
export const healthApi = { isAvailable, getPermissionState, requestPermissions, read, sync } satisfies HealthApi;
export type { PermissionState, SyncResult } from "./types";
