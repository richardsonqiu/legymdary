import { and, eq, like, inArray, notInArray, between, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  appleHealthImports,
  bodyStats,
  garminActivities,
  garminRaw,
  sourceDaily,
} from "@/db/schema";
import { resolveDays } from "@/lib/sources";
import type { AhBatch, HealthSource } from "@legymdary/shared";

/**
 * Server-only. Writes a parsed Apple Health batch into the same tables the
 * Garmin sync fills, so Home, Insights, Food (calories burned), History and
 * Recaps work unchanged:
 *
 * - days   → garmin_daily (source "apple"): steps, active / resting / total
 *            kcal, exercise minutes, resting HR, HRV (SDNN), sleep time.
 * - nights → garmin_raw "sleep_summary" (key "apple-<date>") in Garmin's field
 *            names, so the sleep report gets stages, bedtime, HR, SpO2.
 * - workouts → garmin_activities + garmin_raw "activities" (id "apple-…").
 * - weigh-ins → body_stats (source "apple").
 *
 * Rules: Apple's numbers are stored on their own (source_daily, keys "apple-…")
 * and the user's "which device for what" choice decides what is shown
 * (lib/sources.ts). Weigh-ins you typed (or InBody scans) are never overwritten.
 */

const CHUNK = 80;
const APPLE = "apple-%";

function chunks<T>(xs: T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
const ex = (col: string) => sql.raw(`excluded.${col}`);

/** Raw-row and activity-id prefix per source: "apple-…" (HealthKit) or "hc-…" (Health Connect). */
const PREFIX: Record<HealthSource, string> = { apple: "apple", health_connect: "hc" };

/**
 * Stores one batch. `source` defaults to Apple Health (the web upload). With
 * `workoutRange`, workouts of this source in that range that are not in the batch are
 * removed first: the same workout read again can carry a new id (zip export vs live sync).
 */
export async function storeAppleHealthBatch(
  userId: string,
  b: AhBatch,
  opts: { source?: HealthSource; workoutRange?: { from: string; to: string } } = {},
) {
  const now = new Date();
  const source = opts.source ?? "apple";
  const prefix = PREFIX[source];
  const payloadSource = source === "apple" ? "apple_health" : "health_connect";

  /* ---- days ---- */
  for (const part of chunks(b.days)) {
    await db
      .insert(sourceDaily)
      .values(
        part.map((d) => ({
          userId,
          date: d.date,
          source,
          steps: d.steps,
          activeKcal: d.activeKcal,
          bmrKcal: d.basalKcal,
          totalKcal: d.activeKcal != null && d.basalKcal != null ? d.activeKcal + d.basalKcal : null,
          intensityMinutes: d.exerciseMin,
          restingHr: d.restingHr,
          hrvLastNight: d.hrv,
          hrvWeeklyAvg: d.hrvWeekly,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [sourceDaily.userId, sourceDaily.date, sourceDaily.source],
        set: {
          steps: ex("steps"),
          activeKcal: ex("active_kcal"),
          bmrKcal: ex("bmr_kcal"),
          totalKcal: ex("total_kcal"),
          intensityMinutes: ex("intensity_minutes"),
          restingHr: ex("resting_hr"),
          hrvLastNight: ex("hrv_last_night"),
          hrvWeeklyAvg: ex("hrv_weekly_avg"),
          updatedAt: now,
        },
      });
  }

  /* ---- nights ---- */
  if (b.sleep.length) {
    // Stored even when Garmin has the night; "which device for what" decides which is used.
    const nights = b.sleep;
    for (const part of chunks(nights)) {
      await db
        .insert(garminRaw)
        .values(
          part.map((s) => ({
            userId,
            dataset: "sleep_summary",
            key: `${prefix}-${s.date}`,
            date: s.date,
            fetchedAt: now,
            payload: JSON.stringify({
              source: payloadSource,
              calendarDate: s.date,
              sleepTimeSeconds: s.asleepSec,
              deepSleepSeconds: s.deepSec,
              remSleepSeconds: s.remSec,
              lightSleepSeconds: s.lightSec,
              awakeSleepSeconds: s.awakeSec,
              awakeCount: s.awakeCount,
              sleepStartTimestampLocal: s.startLocal,
              sleepStartTimestampGMT: s.startUtc,
              sleepEndTimestampLocal: s.endLocal,
              averageRespirationValue: s.respiration,
              averageSpO2Value: s.spo2Avg,
              lowestSpO2Value: s.spo2Low,
              avgHeartRate: s.avgHr,
              timeInBedSeconds: s.inBedSec,
            }),
          })),
        )
        .onConflictDoUpdate({
          target: [garminRaw.userId, garminRaw.dataset, garminRaw.key],
          set: { payload: ex("payload"), date: ex("date"), fetchedAt: now },
        });
      await db
        .insert(sourceDaily)
        .values(part.map((s) => ({ userId, date: s.date, source, sleepSeconds: s.asleepSec, updatedAt: now })))
        .onConflictDoUpdate({
          target: [sourceDaily.userId, sourceDaily.date, sourceDaily.source],
          set: { sleepSeconds: ex("sleep_seconds"), updatedAt: now },
        });
    }
  }

  /* ---- workouts ---- */
  if (opts.workoutRange) {
    const { from, to } = opts.workoutRange;
    const keep = b.workouts.map((w) => w.id);
    const stale = and(
      eq(garminActivities.userId, userId),
      like(garminActivities.activityId, `${prefix}-%`),
      between(garminActivities.date, from, to),
      keep.length ? notInArray(garminActivities.activityId, keep) : undefined,
      // A workout logged in the app and linked to this activity keeps it.
      sql`not exists (select 1 from workouts x where x.user_id = ${userId} and x.garmin_activity_id = ${garminActivities.activityId})`,
    );
    const ids = (await db.select({ id: garminActivities.activityId }).from(garminActivities).where(stale)).map((r) => r.id);
    for (const part of chunks(ids)) {
      await db.delete(garminActivities).where(and(eq(garminActivities.userId, userId), inArray(garminActivities.activityId, part)));
      await db.delete(garminRaw).where(and(eq(garminRaw.userId, userId), eq(garminRaw.dataset, "activities"), inArray(garminRaw.key, part)));
    }
  }
  for (const part of chunks(b.workouts)) {
    await db
      .insert(garminActivities)
      .values(
        part.map((w) => ({
          userId,
          activityId: w.id,
          date: w.date,
          startTimeLocal: w.startLocal.replace(" ", "T"),
          name: w.name,
          type: w.type,
          durationSec: w.durationSec,
          calories: w.kcal,
          avgHr: w.avgHr,
          distanceM: w.distanceM,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [garminActivities.userId, garminActivities.activityId],
        set: {
          date: ex("date"),
          startTimeLocal: ex("start_time_local"),
          name: ex("name"),
          type: ex("type"),
          durationSec: ex("duration_sec"),
          calories: ex("calories"),
          avgHr: ex("avg_hr"),
          distanceM: ex("distance_m"),
          updatedAt: now,
        },
      });
    await db
      .insert(garminRaw)
      .values(
        part.map((w) => ({
          userId,
          dataset: "activities",
          key: w.id,
          date: w.date,
          fetchedAt: now,
          payload: JSON.stringify({
            source: payloadSource,
            activityId: w.id,
            activityName: w.name,
            activityType: { typeKey: w.type },
            startTimeLocal: w.startLocal,
            duration: w.durationSec,
            calories: w.kcal,
            distance: w.distanceM,
            averageSpeed: w.distanceM && w.durationSec ? w.distanceM / w.durationSec : null,
            averageHR: w.avgHr,
            maxHR: w.maxHr,
            minHR: w.minHr,
            ...(w.zonesSec
              ? Object.fromEntries(w.zonesSec.map((z, i) => [`hrTimeInZone_${i + 1}`, z]))
              : {}),
          }),
        })),
      )
      .onConflictDoUpdate({
        target: [garminRaw.userId, garminRaw.dataset, garminRaw.key],
        set: { payload: ex("payload"), date: ex("date"), fetchedAt: now },
      });
  }

  /* ---- weigh-ins (manual, InBody and Garmin rows are left alone) ---- */
  const weighIns = b.body.filter((w) => w.weight != null || w.bodyFat != null);
  for (const part of chunks(weighIns)) {
    await db
      .insert(bodyStats)
      .values(part.map((w) => ({ userId, date: w.date, weight: w.weight, bodyFat: w.bodyFat, source })))
      .onConflictDoUpdate({
        target: [bodyStats.userId, bodyStats.date],
        set: { weight: ex("weight"), bodyFat: ex("body_fat") },
        setWhere: eq(bodyStats.source, source),
      });
  }

  const dates = [...b.days.map((d) => d.date), ...b.sleep.map((x) => x.date), ...b.workouts.map((w) => w.date)].sort();
  if (dates.length) await resolveDays(userId, { from: dates[0], to: dates[dates.length - 1] });
}

export async function recordAppleHealthImport(
  userId: string,
  meta: { firstDate: string | null; lastDate: string | null; days: number; nights: number; workouts: number; weighIns: number },
) {
  const vals = { ...meta, importedAt: new Date() };
  await db
    .insert(appleHealthImports)
    .values({ userId, ...vals })
    .onConflictDoUpdate({ target: appleHealthImports.userId, set: vals });
}

/** Removes everything one health source added (Apple Health or Health Connect). Other devices and manual data stay. */
export async function deleteHealthData(userId: string, source: HealthSource = "apple") {
  const like_ = `${PREFIX[source]}-%`;
  await db.delete(sourceDaily).where(and(eq(sourceDaily.userId, userId), eq(sourceDaily.source, source)));
  await db.delete(garminActivities).where(and(eq(garminActivities.userId, userId), like(garminActivities.activityId, like_)));
  await db.delete(garminRaw).where(and(eq(garminRaw.userId, userId), like(garminRaw.key, like_)));
  await db.delete(bodyStats).where(and(eq(bodyStats.userId, userId), eq(bodyStats.source, source)));
  if (source === "apple") await db.delete(appleHealthImports).where(eq(appleHealthImports.userId, userId));
  await resolveDays(userId);
}

/** Removes everything an Apple Health upload added. Garmin and manual data stay. */
export const deleteAppleHealthData = (userId: string) => deleteHealthData(userId, "apple");

/** True when the user has synced Android Health Connect data. */
export async function hasHealthConnectData(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: sourceDaily.date })
    .from(sourceDaily)
    .where(and(eq(sourceDaily.userId, userId), eq(sourceDaily.source, "health_connect")))
    .limit(1);
  return !!row;
}

/**
 * Live syncs from the phone never send the "finish" summary the web upload does, so the
 * Apple Health status (what makes Home show watch data) is rebuilt from the stored rows.
 */
export async function refreshAppleHealthStatus(userId: string) {
  const one = async (q: Promise<{ n: number; lo?: string | null; hi?: string | null }[]>) => (await q)[0] ?? { n: 0, lo: null, hi: null };
  const days = await one(
    db
      .select({ n: sql<number>`count(*)`, lo: sql<string | null>`min(${sourceDaily.date})`, hi: sql<string | null>`max(${sourceDaily.date})` })
      .from(sourceDaily)
      .where(and(eq(sourceDaily.userId, userId), eq(sourceDaily.source, "apple"))),
  );
  const nights = await one(db.select({ n: sql<number>`count(*)` }).from(garminRaw).where(and(eq(garminRaw.userId, userId), eq(garminRaw.dataset, "sleep_summary"), like(garminRaw.key, APPLE))));
  const workouts = await one(db.select({ n: sql<number>`count(*)` }).from(garminActivities).where(and(eq(garminActivities.userId, userId), like(garminActivities.activityId, APPLE))));
  const weighIns = await one(db.select({ n: sql<number>`count(*)` }).from(bodyStats).where(and(eq(bodyStats.userId, userId), eq(bodyStats.source, "apple"))));
  await recordAppleHealthImport(userId, {
    firstDate: days.lo ?? null,
    lastDate: days.hi ?? null,
    days: Number(days.n),
    nights: Number(nights.n),
    workouts: Number(workouts.n),
    weighIns: Number(weighIns.n),
  });
}
