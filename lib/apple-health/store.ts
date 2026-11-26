import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  appleHealthImports,
  bodyStats,
  garminActivities,
  garminRaw,
  sourceDaily,
} from "@/db/schema";
import { resolveDays } from "@/lib/sources";
import type { AhBatch } from "@legymdary/shared";

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

export async function storeAppleHealthBatch(userId: string, b: AhBatch) {
  const now = new Date();

  /* ---- days ---- */
  for (const part of chunks(b.days)) {
    await db
      .insert(sourceDaily)
      .values(
        part.map((d) => ({
          userId,
          date: d.date,
          source: "apple",
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
            key: `apple-${s.date}`,
            date: s.date,
            fetchedAt: now,
            payload: JSON.stringify({
              source: "apple_health",
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
        .values(part.map((s) => ({ userId, date: s.date, source: "apple", sleepSeconds: s.asleepSec, updatedAt: now })))
        .onConflictDoUpdate({
          target: [sourceDaily.userId, sourceDaily.date, sourceDaily.source],
          set: { sleepSeconds: ex("sleep_seconds"), updatedAt: now },
        });
    }
  }

  /* ---- workouts ---- */
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
            source: "apple_health",
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
      .values(part.map((w) => ({ userId, date: w.date, weight: w.weight, bodyFat: w.bodyFat, source: "apple" })))
      .onConflictDoUpdate({
        target: [bodyStats.userId, bodyStats.date],
        set: { weight: ex("weight"), bodyFat: ex("body_fat") },
        setWhere: eq(bodyStats.source, "apple"),
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

/** Removes everything an Apple Health upload added. Garmin and manual data stay. */
export async function deleteAppleHealthData(userId: string) {
  await db.delete(sourceDaily).where(and(eq(sourceDaily.userId, userId), eq(sourceDaily.source, "apple")));
  await db.delete(garminActivities).where(and(eq(garminActivities.userId, userId), like(garminActivities.activityId, APPLE)));
  await db.delete(garminRaw).where(and(eq(garminRaw.userId, userId), like(garminRaw.key, APPLE)));
  await db.delete(bodyStats).where(and(eq(bodyStats.userId, userId), eq(bodyStats.source, "apple")));
  await db.delete(appleHealthImports).where(eq(appleHealthImports.userId, userId));
  await resolveDays(userId);
}
