import { buildBatchRequests, localDate, type ApiClient, type HealthSource, type RawHealth } from "@legymdary/shared";
import * as SecureStore from "expo-secure-store";
import type { SyncResult } from "./types";

/** First sync reads this many days; later syncs start a little before the last one. */
const FIRST_DAYS = 30;
const OVERLAP_DAYS = 2;
/** Health Connect keeps 30 days before the grant by default; HealthKit has years. Cap the lookback either way. */
const MAX_DAYS = 90;

const key = (userId: string, source: HealthSource, name: string) => `legymdary.health.${userId.replace(/[^\w.-]/g, "_")}.${source}.${name}`;

/** When the last sync finished, as an ISO time, or null. Kept in SecureStore (already a dependency), one cursor per user and source. */
export async function getLastSync(userId: string, source: HealthSource): Promise<string | null> {
  return SecureStore.getItemAsync(key(userId, source, "lastSync")).catch(() => null);
}
const setLastSync = (userId: string, source: HealthSource, iso: string) => SecureStore.setItemAsync(key(userId, source, "lastSync"), iso);

const daysAgo = (n: number, from = new Date()) => localDate(new Date(from.getFullYear(), from.getMonth(), from.getDate() - n, 12).toISOString());

/** The date range a sync reads. */
export function syncWindow(lastSync: string | null, now = new Date()): { from: string; to: string } {
  const to = localDate(now.toISOString());
  const earliest = daysAgo(MAX_DAYS, now);
  if (!lastSync) return { from: daysAgo(FIRST_DAYS - 1, now), to };
  const last = new Date(lastSync);
  if (Number.isNaN(last.getTime())) return { from: daysAgo(FIRST_DAYS - 1, now), to };
  const from = daysAgo(OVERLAP_DAYS, last);
  return { from: from < earliest ? earliest : from, to };
}

/** Builds `sync` for one platform from its `read`. The cursor moves only after every chunk was accepted. */
export function makeSync(source: HealthSource, read: (from: string, to: string) => Promise<RawHealth>) {
  return async (api: Pick<ApiClient, "syncHealthBatch">, userId: string): Promise<SyncResult> => {
    const started = new Date();
    const { from, to } = syncWindow(await getLastSync(userId, source), started);
    const requests = buildBatchRequests(await read(from, to), source, from, to);
    for (const r of requests) await api.syncHealthBatch(r);
    await setLastSync(userId, source, started.toISOString());
    const count = (pick: (r: (typeof requests)[number]) => number) => requests.reduce((n, r) => n + pick(r), 0);
    return {
      from,
      to,
      requests: requests.length,
      days: count((r) => r.days.length),
      sleep: count((r) => r.sleep.length),
      workouts: count((r) => r.workouts.length),
      body: count((r) => r.body.length),
    };
  };
}

/** Marks that the iOS permission sheet was shown (HealthKit cannot be asked what was allowed). */
export const iosAskedKey = "legymdary.health.ios.asked";

/** Local midnight at the start of `date` (YYYY-MM-DD) and of the day after `date`. */
export function dayBounds(from: string, to: string): { start: Date; end: Date } {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return { start: new Date(fy, fm - 1, fd), end: new Date(ty, tm - 1, td + 1) };
}
