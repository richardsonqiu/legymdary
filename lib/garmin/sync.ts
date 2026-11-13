import { and, eq, lt, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  bodyStats,
  garminActivities,
  garminConnections,
  garminDaily,
  type GarminConnection,
} from "@/db/schema";
import * as api from "@/lib/garmin/client";
import { GarminError } from "@/lib/garmin/client";
import { decryptSecret, encryptSecret } from "@/lib/garmin/crypto";
import { addDaysStr, todayStr } from "@/lib/utils";

/**
 * Server-only. Pulls a user's Garmin data for a date range and upserts it:
 * daily summary + sleep + HRV → garmin_daily, activities → garmin_activities,
 * scale weigh-ins → body_stats (source "garmin"; manual entries are never
 * overwritten).
 */

type DailyPatch = Partial<Omit<typeof garminDaily.$inferInsert, "id" | "userId" | "date">>;

export type SyncResult = {
  ok: boolean;
  days: number;
  activities: number;
  weighIns: number;
  warnings: string[];
  error?: string;
};

const TOKEN_MARGIN_MS = 60 * 60 * 1000; // refresh 1h before expiry, like Garmin's own client

async function bearerToken(conn: GarminConnection, force = false): Promise<string> {
  if (
    !force &&
    conn.tokenEnc &&
    conn.tokenExpiresAt &&
    conn.tokenExpiresAt.getTime() - Date.now() > TOKEN_MARGIN_MS
  ) {
    return decryptSecret(conn.tokenEnc);
  }
  const { token, expiresAt } = await api.exchangeKey(decryptSecret(conn.apiKeyEnc));
  await db
    .update(garminConnections)
    .set({ tokenEnc: encryptSecret(token), tokenExpiresAt: expiresAt })
    .where(eq(garminConnections.userId, conn.userId));
  return token;
}

/** Splits [start, end] into chunks of at most `size` days. */
function chunks(start: string, end: string, size: number): [string, string][] {
  const out: [string, string][] = [];
  let s = start;
  while (s <= end) {
    const e = addDaysStr(s, size - 1) < end ? addDaysStr(s, size - 1) : end;
    out.push([s, e]);
    s = addDaysStr(e, 1);
  }
  return out;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const int = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};

async function fetchAll(token: string, start: string, end: string) {
  const warnings: string[] = [];
  const settle = async <T,>(label: string, p: Promise<T>): Promise<T | null> => {
    try {
      return await p;
    } catch (err) {
      if (err instanceof GarminError && err.isAuth) throw err; // handled by caller
      warnings.push(`${label}: ${(err as Error).message}`);
      return null;
    }
  };
  const [daily, sleep, hrv, acts, weights] = await Promise.all([
    settle("daily summaries", api.dailySummaries(token, start, end)),
    settle(
      "sleep",
      Promise.all(chunks(start, end, 31).map(([s, e]) => api.sleepSummaries(token, s, e))).then(
        (r) => r.flat(),
      ),
    ),
    settle("HRV", api.hrvDaily(token, start, end)),
    settle("activities", api.activities(token, start, end)),
    settle("weight", api.weights(token, start, end)),
  ]);
  return { daily, sleep, hrv, acts, weights, warnings };
}

export async function syncGarminForUser(
  userId: string,
  opts: { days?: number } = {},
): Promise<SyncResult> {
  const [conn] = await db
    .select()
    .from(garminConnections)
    .where(eq(garminConnections.userId, userId))
    .limit(1);
  if (!conn) return { ok: false, days: 0, activities: 0, weighIns: 0, warnings: [], error: "Garmin isn't connected." };

  // Garmin dates are the user's local days; pad the end by a day so users
  // ahead of the server's timezone still get "today".
  const end = addDaysStr(todayStr(), 1);
  const start = addDaysStr(end, -Math.min(Math.max(opts.days ?? 7, 1), 365));

  let data: Awaited<ReturnType<typeof fetchAll>>;
  try {
    try {
      data = await fetchAll(await bearerToken(conn), start, end);
    } catch (err) {
      // A cached token may have been revoked early — retry once with a fresh one.
      if (err instanceof GarminError && err.isAuth && conn.tokenEnc) {
        data = await fetchAll(await bearerToken(conn, true), start, end);
      } else throw err;
    }
  } catch (err) {
    const message =
      err instanceof GarminError && err.isAuth
        ? "Garmin rejected your API key — it may have expired or been deleted. Create a new key and reconnect."
        : `Couldn't reach Garmin: ${(err as Error).message}`;
    await db
      .update(garminConnections)
      .set({ status: "error", lastError: message, ...(err instanceof GarminError && err.isAuth ? { tokenEnc: null, tokenExpiresAt: null } : {}) })
      .where(eq(garminConnections.userId, userId));
    console.error(`[garmin] sync failed for ${userId}:`, (err as Error).message);
    return { ok: false, days: 0, activities: 0, weighIns: 0, warnings: [], error: message };
  }

  /* ---- merge per-day feeds ---- */
  const byDate = new Map<string, DailyPatch>();
  const patch = (date: string | undefined | null, p: DailyPatch) => {
    if (!date) return;
    const d = date.slice(0, 10);
    byDate.set(d, { ...(byDate.get(d) ?? {}), ...p });
  };
  for (const d of data.daily ?? []) {
    const im = (d.intensityMinutes?.moderate ?? 0) + 2 * (d.intensityMinutes?.vigorous ?? 0);
    patch(d.calendarDate, {
      totalKcal: num(d.calories?.burnedTotal),
      activeKcal: num(d.calories?.burnedActive),
      bmrKcal: num(d.calories?.burnedResting),
      consumedKcal: num(d.calories?.consumedValue),
      steps: int(d.movement?.steps?.value),
      intensityMinutes: d.intensityMinutes ? im : null,
      restingHr: int(d.heartRate?.restingValue),
      stressAvg: (() => {
        const v = int(d.stress?.avgLevel);
        return v != null && v >= 0 ? v : null; // Garmin uses negatives for "no data"
      })(),
      bodyBatteryHigh: int(d.bodyBattery?.maxValue),
      bodyBatteryLow: int(d.bodyBattery?.minValue),
      bodyBatteryCharged: int(d.bodyBattery?.chargedValue),
      bodyBatteryDrained: int(d.bodyBattery?.drainedValue),
    });
  }
  for (const s of data.sleep ?? []) {
    patch(s.calendarDate, {
      sleepSeconds: int(s.sleepTimeSeconds),
      sleepScore: int(s.sleepScores?.overall?.value),
    });
  }
  for (const h of data.hrv ?? []) {
    patch(h.calendarDate, {
      hrvLastNight: int(h.lastNightAvg),
      hrvWeeklyAvg: int(h.weeklyAvg),
      hrvStatus: h.status ?? null,
    });
  }

  const now = new Date();
  for (const [date, p] of byDate) {
    // Skip keys that are null so a missing feed never wipes stored values.
    const set = Object.fromEntries(Object.entries(p).filter(([, v]) => v != null)) as DailyPatch;
    if (!Object.keys(set).length) continue;
    await db
      .insert(garminDaily)
      .values({ userId, date, ...set, updatedAt: now })
      .onConflictDoUpdate({
        target: [garminDaily.userId, garminDaily.date],
        set: { ...set, updatedAt: now },
      });
  }

  /* ---- activities ---- */
  let actCount = 0;
  for (const a of data.acts ?? []) {
    if (a.activityId == null || !a.startTimeLocal) continue;
    const row = {
      date: a.startTimeLocal.slice(0, 10),
      startTimeLocal: a.startTimeLocal,
      name: a.activityName?.trim() || a.activityType?.typeKey?.replace(/_/g, " ") || "Activity",
      type: a.activityType?.typeKey ?? null,
      durationSec: num(a.duration),
      calories: num(a.calories),
      avgHr: num(a.averageHR),
      distanceM: num(a.distance),
      trainingLoad: num(a.activityTrainingLoad),
      updatedAt: now,
    };
    await db
      .insert(garminActivities)
      .values({ userId, activityId: String(a.activityId), ...row })
      .onConflictDoUpdate({
        target: [garminActivities.userId, garminActivities.activityId],
        set: row,
      });
    actCount++;
  }

  /* ---- scale weigh-ins → body stats (never overwrite manual entries) ---- */
  let weighIns = 0;
  for (const w of data.weights ?? []) {
    let kg = num(w.latestWeight?.weight);
    if (!w.summaryDate || kg == null) continue;
    if (kg > 500) kg = kg / 1000; // defensively handle grams
    const bf = num(w.latestWeight?.bodyFat);
    const vals = { weight: Math.round(kg * 10) / 10, bodyFat: bf != null && bf > 0 && bf < 75 ? Math.round(bf * 10) / 10 : null };
    await db
      .insert(bodyStats)
      .values({ userId, date: w.summaryDate.slice(0, 10), ...vals, source: "garmin" })
      .onConflictDoUpdate({
        target: [bodyStats.userId, bodyStats.date],
        set: vals,
        setWhere: eq(bodyStats.source, "garmin"), // manual rows are left alone
      });
    weighIns++;
  }

  await db
    .update(garminConnections)
    .set({
      status: "ok",
      lastError: data.warnings.length ? data.warnings.join(" · ") : null,
      lastSyncAt: now,
    })
    .where(eq(garminConnections.userId, userId));

  return {
    ok: true,
    days: byDate.size,
    activities: actCount,
    weighIns,
    warnings: data.warnings,
  };
}

/** Users whose last successful sync is older than `staleMs` (for cron). */
export async function staleGarminUsers(staleMs: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - staleMs);
  const rows = await db
    .select({ userId: garminConnections.userId })
    .from(garminConnections)
    .where(
      and(
        eq(garminConnections.status, "ok"),
        or(isNull(garminConnections.lastSyncAt), lt(garminConnections.lastSyncAt, cutoff)),
      ),
    );
  return rows.map((r) => r.userId);
}
