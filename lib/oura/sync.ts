/**
 * Server-only. Pulls Oura data into the tables the rest of the app reads,
 * the same way the Apple Health upload does:
 *
 * - daily numbers → source_daily (source "oura"): steps, calories, intensity
 *   minutes, sleep time and score, resting heart rate (lowest overnight), HRV.
 * - the main sleep of each night → garmin_raw "sleep_summary" (key
 *   "oura-<day>") in Garmin's field names, so the sleep report reads it.
 * - HRV → garmin_raw "hrv_daily"; steps/calories → "user_summary".
 * - workouts → garmin_activities + garmin_raw "activities" (id "oura-…").
 * - Oura-only extras (readiness, temperature, SpO2, stress, resilience,
 *   VO2 max, cardiovascular age) → garmin_raw "oura_daily".
 *
 * Which device is used for what is decided afterwards by resolveDays().
 */
import { and, eq, isNull, like, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { garminActivities, garminRaw, ouraConnections, sourceDaily } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/garmin/crypto";
import { listCollection, OuraError, refreshTokens } from "@/lib/oura/client";
import { rateLimit } from "@/lib/rate-limit";
import { resolveDays } from "@/lib/sources";
import { addDaysStr, todayStr } from "@/lib/utils";

type J = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const int = (v: unknown): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

export async function storeTokens(userId: string, t: { accessToken: string; refreshToken: string; expiresAt: Date; scope: string }) {
  const vals = {
    accessTokenEnc: encryptSecret(t.accessToken),
    refreshTokenEnc: encryptSecret(t.refreshToken),
    expiresAt: t.expiresAt,
    scopes: t.scope.slice(0, 300),
    status: "ok",
    lastError: null,
  };
  await db
    .insert(ouraConnections)
    .values({ userId, ...vals })
    .onConflictDoUpdate({ target: ouraConnections.userId, set: vals });
}

/** A valid access token, refreshing (and storing the rotated refresh token) when it is about to expire. */
async function accessToken(userId: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [c] = await db.select().from(ouraConnections).where(eq(ouraConnections.userId, userId)).limit(1);
    if (!c) throw new OuraError("Oura isn't connected.", 0, true);
    if (c.expiresAt.getTime() - Date.now() > 2 * 60_000) return decryptSecret(c.accessTokenEnc);
    // Refresh tokens are single use: make sure only one request refreshes at a time.
    const lock = await rateLimit(`oura:refresh:${userId}`, 1, 30_000);
    if (!lock.ok) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    try {
      const t = await refreshTokens(decryptSecret(c.refreshTokenEnc));
      await storeTokens(userId, t);
      return t.accessToken;
    } catch (err) {
      if (err instanceof OuraError && err.isAuth) {
        await db
          .update(ouraConnections)
          .set({ status: "error", lastError: "Oura sign-in expired. Connect again." })
          .where(eq(ouraConnections.userId, userId));
      }
      throw err;
    }
  }
  throw new OuraError("Oura is busy refreshing the sign-in. Try again in a moment.", 0);
}

/* ------------------------------------------------------------------ */
/* Sync                                                                */
/* ------------------------------------------------------------------ */

export type OuraSyncResult = { ok: boolean; days: number; nights: number; workouts: number; error?: string };

const camelToSnake = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase()
    .replace(/^_|_$/g, "")
    .slice(0, 40);
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Optional collections: a missing permission or plan skips them instead of failing the sync. */
async function optional<T>(p: Promise<T[]>, warnings: string[], label: string): Promise<T[]> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof OuraError && (err.isAuth || err.status === 429 || err.status === 0)) throw err;
    warnings.push(`${label}: ${(err as Error).message}`);
    return [];
  }
}

export async function syncOuraForUser(userId: string, opts: { days?: number } = {}): Promise<OuraSyncResult> {
  const today = todayStr();
  try {
    const token = await accessToken(userId);
    const [conn] = await db.select().from(ouraConnections).where(eq(ouraConnections.userId, userId)).limit(1);
    // First sync: 90 days of history. Later: the last few days (plus a week for HRV averages).
    const days = conn?.backfilledFrom ? Math.max(3, Math.min(opts.days ?? 10, 365)) : 90;
    const start = addDaysStr(today, -days);
    const end = addDaysStr(today, 1);
    const range = { start_date: start, end_date: end };
    const warnings: string[] = [];

    const [dailySleep, sleeps, readiness, activity, workouts] = await Promise.all([
      listCollection<J>(token, "daily_sleep", range),
      listCollection<J>(token, "sleep", range),
      listCollection<J>(token, "daily_readiness", range),
      listCollection<J>(token, "daily_activity", range),
      optional(listCollection<J>(token, "workout", range), warnings, "workouts"),
    ]);
    const [spo2, stress, resilience, vo2, cardio] = await Promise.all([
      optional(listCollection<J>(token, "daily_spo2", range), warnings, "SpO2"),
      optional(listCollection<J>(token, "daily_stress", range), warnings, "stress"),
      optional(listCollection<J>(token, "daily_resilience", range), warnings, "resilience"),
      optional(listCollection<J>(token, "vO2_max", range), warnings, "VO2 max"),
      optional(listCollection<J>(token, "daily_cardiovascular_age", range), warnings, "cardiovascular age"),
    ]);

    const byDay = <T extends J>(rows: T[]) => {
      const m = new Map<string, T>();
      for (const r of rows) {
        const d = str(r.day);
        if (d && DAY.test(d)) m.set(d, r);
      }
      return m;
    };
    const dSleep = byDay(dailySleep);
    const dReady = byDay(readiness);
    const dAct = byDay(activity);
    const dSpo2 = byDay(spo2);
    const dStress = byDay(stress);
    const dRes = byDay(resilience);
    const dVo2 = byDay(vo2);
    const dCardio = byDay(cardio);

    // The night's main sleep: the longest long_sleep / sleep period that ends on the day.
    const mainSleep = new Map<string, J>();
    for (const s of sleeps) {
      const d = str(s.day);
      const type = str(s.type);
      if (!d || !DAY.test(d) || (type !== "long_sleep" && type !== "sleep")) continue;
      const cur = mainSleep.get(d);
      if (!cur || (num(s.total_sleep_duration) ?? 0) > (num(cur.total_sleep_duration) ?? 0)) mainSleep.set(d, s);
    }

    const allDays = [...new Set([...dSleep.keys(), ...mainSleep.keys(), ...dReady.keys(), ...dAct.keys()])].sort();
    const hrvOf = (d: string) => num(mainSleep.get(d)?.average_hrv);
    const weeklyHrv = (d: string) => {
      const v = Array.from({ length: 7 }, (_, i) => hrvOf(addDaysStr(d, -i))).filter((x): x is number => x != null);
      return v.length >= 3 ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };

    const now = new Date();
    const ex = (c: string) => sql.raw(`excluded.${c}`);
    const rawRows: (typeof garminRaw.$inferInsert)[] = [];
    let nights = 0;

    for (const d of allDays) {
      const sl = mainSleep.get(d);
      const ds = dSleep.get(d);
      const act = dAct.get(d);
      const rd = dReady.get(d);
      const total = num(act?.total_calories);
      const active = num(act?.active_calories);
      const daily = {
        steps: int(act?.steps),
        totalKcal: total,
        activeKcal: active,
        bmrKcal: total != null && active != null ? Math.max(0, total - active) : null,
        // Same idea as Garmin's intensity minutes: moderate + 2 × vigorous.
        intensityMinutes:
          act && (num(act.medium_activity_time) != null || num(act.high_activity_time) != null)
            ? Math.round(((num(act.medium_activity_time) ?? 0) + 2 * (num(act.high_activity_time) ?? 0)) / 60)
            : null,
        sleepSeconds: int(sl?.total_sleep_duration),
        sleepScore: int(ds?.score),
        restingHr: int(sl?.lowest_heart_rate),
        hrvLastNight: int(sl?.average_hrv),
        hrvWeeklyAvg: weeklyHrv(d),
      };
      await db
        .insert(sourceDaily)
        .values({ userId, date: d, source: "oura", ...daily, updatedAt: now })
        .onConflictDoUpdate({
          target: [sourceDaily.userId, sourceDaily.date, sourceDaily.source],
          set: { ...daily, updatedAt: now },
        });

      const key = `oura-${d}`;
      if (sl) {
        nights++;
        const startIso = str(sl.bedtime_start);
        const endIso = str(sl.bedtime_end);
        rawRows.push({
          userId,
          dataset: "sleep_summary",
          key,
          date: d,
          fetchedAt: now,
          payload: JSON.stringify({
            source: "oura",
            calendarDate: d,
            sleepTimeSeconds: num(sl.total_sleep_duration),
            deepSleepSeconds: num(sl.deep_sleep_duration),
            remSleepSeconds: num(sl.rem_sleep_duration),
            lightSleepSeconds: num(sl.light_sleep_duration),
            awakeSleepSeconds: num(sl.awake_time),
            timeInBedSeconds: num(sl.time_in_bed),
            sleepStartTimestampLocal: startIso?.slice(0, 19) ?? null,
            sleepStartTimestampGMT: startIso && !Number.isNaN(Date.parse(startIso)) ? new Date(startIso).toISOString() : null,
            sleepEndTimestampLocal: endIso?.slice(0, 19) ?? null,
            averageRespirationValue: num(sl.average_breath),
            avgHeartRate: num(sl.average_heart_rate),
            lowestHeartRate: num(sl.lowest_heart_rate),
            restlessMomentsCount: num(sl.restless_periods),
            efficiency: num(sl.efficiency),
            latencySeconds: num(sl.latency),
            averageSpO2Value: num((dSpo2.get(d)?.spo2_percentage as J | undefined)?.average),
            sleepScores: ds?.score != null ? { overall: { value: num(ds.score) } } : undefined,
          }),
        });
      }
      if (sl && num(sl.average_hrv) != null) {
        rawRows.push({
          userId,
          dataset: "hrv_daily",
          key,
          date: d,
          fetchedAt: now,
          payload: JSON.stringify({ source: "oura", calendarDate: d, lastNightAvg: int(sl.average_hrv), weeklyAvg: weeklyHrv(d) }),
        });
      }
      if (act) {
        rawRows.push({
          userId,
          dataset: "user_summary",
          key,
          date: d,
          fetchedAt: now,
          payload: JSON.stringify({
            source: "oura",
            calendarDate: d,
            totalSteps: int(act.steps),
            activeKilocalories: active,
            totalKilocalories: total,
            restingHeartRate: int(sl?.lowest_heart_rate),
          }),
        });
      }
      const st = dStress.get(d);
      const sp = dSpo2.get(d);
      const extras = {
        source: "oura",
        readinessScore: num(rd?.score),
        readinessContributors: rd?.contributors ?? null,
        temperatureDeviation: num(rd?.temperature_deviation),
        temperatureTrendDeviation: num(rd?.temperature_trend_deviation),
        sleepScore: num(ds?.score),
        activityScore: num(act?.score),
        spo2Avg: num((sp?.spo2_percentage as J | undefined)?.average),
        breathingDisturbanceIndex: num(sp?.breathing_disturbance_index),
        stressHighMin: num(st?.stress_high) != null ? Math.round(num(st!.stress_high)! / 60) : null,
        recoveryHighMin: num(st?.recovery_high) != null ? Math.round(num(st!.recovery_high)! / 60) : null,
        stressSummary: str(st?.day_summary),
        resilienceLevel: str(dRes.get(d)?.level),
        vo2Max: num(dVo2.get(d)?.vo2_max),
        vascularAge: num(dCardio.get(d)?.vascular_age),
      };
      if (Object.entries(extras).some(([k, v]) => k !== "source" && v != null)) {
        rawRows.push({ userId, dataset: "oura_daily", key, date: d, fetchedAt: now, payload: JSON.stringify(extras) });
      }
    }

    /* ---- workouts ---- */
    let workoutCount = 0;
    for (const w of workouts) {
      const id = str(w.id);
      const d = str(w.day);
      const startIso = str(w.start_datetime);
      const endIso = str(w.end_datetime);
      if (!id || !d || !DAY.test(d) || !/^[\w-]{1,60}$/.test(id)) continue;
      const activityId = `oura-${id}`.slice(0, 40);
      const type = camelToSnake(str(w.activity) ?? "other") || "other";
      const dur = startIso && endIso ? Math.max(0, (Date.parse(endIso) - Date.parse(startIso)) / 1000) : null;
      const row = {
        date: d,
        startTimeLocal: startIso?.slice(0, 19) ?? null,
        name: (str(w.label) ?? titleCase(type)).slice(0, 120),
        type,
        durationSec: dur != null && Number.isFinite(dur) ? dur : null,
        calories: num(w.calories),
        avgHr: null,
        distanceM: num(w.distance),
        updatedAt: now,
      };
      await db
        .insert(garminActivities)
        .values({ userId, activityId, ...row })
        .onConflictDoUpdate({ target: [garminActivities.userId, garminActivities.activityId], set: row });
      rawRows.push({
        userId,
        dataset: "activities",
        key: activityId,
        date: d,
        fetchedAt: now,
        payload: JSON.stringify({
          source: "oura",
          activityId,
          activityName: row.name,
          activityType: { typeKey: type },
          startTimeLocal: startIso?.slice(0, 19).replace("T", " ") ?? null,
          duration: row.durationSec,
          calories: row.calories,
          distance: row.distanceM,
          intensity: str(w.intensity),
          detectedBy: str(w.source),
        }),
      });
      workoutCount++;
    }

    for (let i = 0; i < rawRows.length; i += 80) {
      await db
        .insert(garminRaw)
        .values(rawRows.slice(i, i + 80))
        .onConflictDoUpdate({
          target: [garminRaw.userId, garminRaw.dataset, garminRaw.key],
          set: { payload: ex("payload"), date: ex("date"), fetchedAt: now },
        });
    }

    await resolveDays(userId, { from: start, to: end });
    await db
      .update(ouraConnections)
      .set({
        status: "ok",
        lastError: warnings.length ? warnings.join(" · ").slice(0, 500) : null,
        lastSyncAt: now,
        backfilledFrom: conn?.backfilledFrom && conn.backfilledFrom < start ? conn.backfilledFrom : start,
      })
      .where(eq(ouraConnections.userId, userId));
    return { ok: true, days: allDays.length, nights, workouts: workoutCount };
  } catch (err) {
    const message = err instanceof OuraError ? err.message : "Oura sync failed. Try again later.";
    if (!(err instanceof OuraError)) console.error("[oura] sync failed:", err);
    await db
      .update(ouraConnections)
      .set({ status: "error", lastError: message })
      .where(eq(ouraConnections.userId, userId))
      .catch(() => {});
    return { ok: false, days: 0, nights: 0, workouts: 0, error: message };
  }
}

/** Users whose Oura data is older than `staleMs` (for the daily cron). */
export async function staleOuraUsers(staleMs: number): Promise<string[]> {
  const rows = await db
    .select({ userId: ouraConnections.userId })
    .from(ouraConnections)
    .where(
      and(
        eq(ouraConnections.status, "ok"),
        or(isNull(ouraConnections.lastSyncAt), lt(ouraConnections.lastSyncAt, new Date(Date.now() - staleMs))),
      ),
    )
    .limit(50);
  return rows.map((r) => r.userId);
}

/** Removes everything Oura added. Other devices, manual and imported data stay. */
export async function deleteOuraData(userId: string) {
  await db.delete(sourceDaily).where(and(eq(sourceDaily.userId, userId), eq(sourceDaily.source, "oura")));
  await db.delete(garminActivities).where(and(eq(garminActivities.userId, userId), like(garminActivities.activityId, "oura-%")));
  await db.delete(garminRaw).where(and(eq(garminRaw.userId, userId), like(garminRaw.key, "oura-%")));
  await resolveDays(userId);
}
