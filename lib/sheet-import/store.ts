/**
 * Server-only. Validates and stores a batch of a spreadsheet import.
 *
 * Nothing from the file is ever pasted into SQL: every write goes through
 * Drizzle's parameterised queries, and the batch is checked again here with a
 * strict zod schema (types, ranges, lengths, real dates) after the browser's
 * own checks, because a request can be crafted by hand.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { exercises, garminActivities, garminRaw, sets, sheetImports, workoutExercises, workouts } from "@/db/schema";
import { cleanText, exerciseKey, isRealDate, LIMITS, muscleGroupFor } from "@/lib/sheet-import/format";
import { addDaysStr } from "@/lib/utils";

const date = z.string().refine(isRealDate, "Invalid date.");
const text = (max: number) => z.string().max(max * 2).transform((v) => cleanText(v, max));

export const batchSchema = z
  .object({
    sessions: z
      .array(
        z.object({
          date,
          name: text(LIMITS.workoutName),
          exercises: z
            .array(
              z.object({
                name: text(LIMITS.exerciseName).refine((v) => v.length > 0, "Exercise name is empty."),
                muscle: z.string().max(LIMITS.muscle * 2),
                sets: z
                  .array(
                    z.object({
                      weight: z.number().finite().min(0).max(1000),
                      reps: z.number().int().min(1).max(1000),
                      warmup: z.boolean(),
                      notes: text(LIMITS.notes).nullable(),
                    }),
                  )
                  .min(1)
                  .max(100),
              }),
            )
            .min(1)
            .max(50),
        }),
      )
      .max(100),
    cardio: z
      .array(
        z.object({
          date,
          start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
          type: z.string().regex(/^[a-z0-9_]{1,40}$/),
          name: text(LIMITS.activityName),
          durationSec: z.number().int().min(1).max(86_400),
          distanceM: z.number().int().min(0).max(1_000_000).nullable(),
          kcal: z.number().int().min(0).max(20_000).nullable(),
          avgHr: z.number().int().min(30).max(250).nullable(),
        }),
      )
      .max(500),
  })
  .strict()
  .refine((b) => b.sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.sets.length, 0), 0) <= 2000, "Too many sets in one batch.");

export type ImportBatch = z.infer<typeof batchSchema>;
export type BatchResult = { workouts: number; sets: number; skipped: number; activities: number; activitiesSkipped: number; newExercises: string[] };

const CHUNK = 200;
function chunks<T>(xs: T[], n = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** Cardio ids are stable hashes so importing the same row twice is a no-op. */
const cardioId = (userId: string, c: ImportBatch["cardio"][number]) =>
  "sheet-" +
  createHash("sha256")
    .update([userId, c.date, c.start ?? "", c.type, c.durationSec, c.distanceM ?? ""].join("|"))
    .digest("hex")
    .slice(0, 24);

export async function storeBatch(userId: string, importId: number, b: ImportBatch, today: string): Promise<BatchResult> {
  const maxDate = addDaysStr(today, 1);
  const result: BatchResult = { workouts: 0, sets: 0, skipped: 0, activities: 0, activitiesSkipped: 0, newExercises: [] };
  const sessions = b.sessions.filter((s) => s.date >= "2000-01-01" && s.date <= maxDate);
  const cardio = b.cardio.filter((c) => c.date >= "2000-01-01" && c.date <= maxDate);

  /* ---- workouts ---- */
  if (sessions.length) {
    // Skip sessions already in the log (same date and name), so re-imports are safe.
    const dates = [...new Set(sessions.map((s) => s.date))];
    const existing = await db
      .select({ date: workouts.date, name: workouts.name })
      .from(workouts)
      .where(and(eq(workouts.userId, userId), inArray(workouts.date, dates)));
    const have = new Set(existing.map((w) => `${w.date}|${w.name.trim().toLowerCase()}`));
    const todo = sessions.filter((s) => {
      const name = s.name || "Imported workout";
      const k = `${s.date}|${name.toLowerCase()}`;
      if (have.has(k)) {
        result.skipped++;
        return false;
      }
      have.add(k);
      return true;
    });

    if (todo.length) {
      // Match exercise names to the library (built-in + the user's own); add the rest.
      const lib = await db
        .select({ id: exercises.id, name: exercises.name })
        .from(exercises)
        .where(or(isNull(exercises.userId), eq(exercises.userId, userId)));
      const byKey = new Map(lib.map((e) => [exerciseKey(e.name), e.id]));
      const missing = new Map<string, { name: string; muscle: string }>();
      for (const s of todo) {
        for (const e of s.exercises) {
          const k = exerciseKey(e.name);
          if (!k) continue;
          if (!byKey.has(k) && !missing.has(k)) missing.set(k, { name: e.name, muscle: muscleGroupFor(e.muscle) });
        }
      }
      if (missing.size > LIMITS.newExercises) {
        throw new ImportError(`This file has ${missing.size} exercise names that aren't in your library. Up to ${LIMITS.newExercises} new ones can be added per import. Check the spelling, or use names from the Lists sheet.`);
      }
      for (const part of chunks([...missing.values()])) {
        const rows = await db
          .insert(exercises)
          .values(part.map((m) => ({ name: m.name, muscleGroup: m.muscle, equipment: "Other", isCustom: true, userId })))
          .returning({ id: exercises.id, name: exercises.name });
        for (const r of rows) byKey.set(exerciseKey(r.name), r.id);
        result.newExercises.push(...rows.map((r) => r.name));
      }

      for (const s of todo) {
        const exList = s.exercises.filter((e) => byKey.has(exerciseKey(e.name)));
        if (!exList.length) continue;
        const [w] = await db
          .insert(workouts)
          .values({
            userId,
            name: s.name || "Imported workout",
            date: s.date,
            finishedAt: new Date(`${s.date}T12:00:00Z`),
            importId,
          })
          .returning({ id: workouts.id });
        const wes = await db
          .insert(workoutExercises)
          .values(exList.map((e, i) => ({ workoutId: w.id, exerciseId: byKey.get(exerciseKey(e.name))!, position: i })))
          .returning({ id: workoutExercises.id, position: workoutExercises.position });
        const weByPos = new Map(wes.map((r) => [r.position, r.id]));
        const setRows = exList.flatMap((e, i) =>
          e.sets.map((st, j) => ({
            workoutExerciseId: weByPos.get(i)!,
            weight: st.weight,
            reps: st.reps,
            isWarmup: st.warmup,
            notes: st.notes || null,
            position: j,
          })),
        );
        for (const part of chunks(setRows)) await db.insert(sets).values(part);
        result.workouts++;
        result.sets += setRows.length;
      }
    }
  }

  /* ---- cardio (stored like watch activities, ids "sheet-…") ---- */
  const added: string[] = [];
  for (const part of chunks(cardio, 100)) {
    const rows = part.map((c) => ({ c, id: cardioId(userId, c) }));
    const inserted = await db
      .insert(garminActivities)
      .values(
        rows.map(({ c, id }) => ({
          userId,
          activityId: id,
          date: c.date,
          startTimeLocal: c.start ? `${c.date}T${c.start}:00` : null,
          name: c.name || "Activity",
          type: c.type,
          durationSec: c.durationSec,
          calories: c.kcal,
          avgHr: c.avgHr,
          distanceM: c.distanceM,
        })),
      )
      .onConflictDoNothing({ target: [garminActivities.userId, garminActivities.activityId] })
      .returning({ id: garminActivities.activityId });
    const fresh = new Set(inserted.map((r) => r.id));
    result.activitiesSkipped += rows.length - fresh.size;
    const freshRows = rows.filter((r) => fresh.has(r.id));
    if (freshRows.length) {
      // The analysis (training load, recaps) reads activity summaries from garmin_raw.
      await db
        .insert(garminRaw)
        .values(
          freshRows.map(({ c, id }) => ({
            userId,
            dataset: "activities",
            key: id,
            date: c.date,
            payload: JSON.stringify({
              source: "spreadsheet",
              activityId: id,
              activityName: c.name,
              activityType: { typeKey: c.type },
              startTimeLocal: c.start ? `${c.date} ${c.start}:00` : `${c.date} 12:00:00`,
              duration: c.durationSec,
              calories: c.kcal,
              distance: c.distanceM,
              averageSpeed: c.distanceM && c.durationSec ? c.distanceM / c.durationSec : null,
              averageHR: c.avgHr,
            }),
          })),
        )
        .onConflictDoNothing({ target: [garminRaw.userId, garminRaw.dataset, garminRaw.key] });
      added.push(...freshRows.map((r) => r.id));
    }
    result.activities += freshRows.length;
  }

  // Tally on the import record (and remember the activity ids for undo).
  const [rec] = await db.select({ activityIds: sheetImports.activityIds }).from(sheetImports).where(eq(sheetImports.id, importId)).limit(1);
  let ids: string[] = [];
  try {
    ids = JSON.parse(rec?.activityIds ?? "[]");
  } catch {
    ids = [];
  }
  await db
    .update(sheetImports)
    .set({
      workouts: sql`${sheetImports.workouts} + ${result.workouts}`,
      sets: sql`${sheetImports.sets} + ${result.sets}`,
      activities: sql`${sheetImports.activities} + ${result.activities}`,
      activityIds: JSON.stringify([...ids, ...added]),
    })
    .where(and(eq(sheetImports.id, importId), eq(sheetImports.userId, userId)));
  return result;
}

export class ImportError extends Error {}

/** Deletes everything one import added. */
export async function undoImport(userId: string, importId: number): Promise<boolean> {
  const [rec] = await db
    .select()
    .from(sheetImports)
    .where(and(eq(sheetImports.id, importId), eq(sheetImports.userId, userId)))
    .limit(1);
  if (!rec) return false;
  // Sets and workout_exercises go with their workout (ON DELETE CASCADE); delete
  // them explicitly too in case foreign keys are not enforced on this database.
  const ws = await db.select({ id: workouts.id }).from(workouts).where(and(eq(workouts.userId, userId), eq(workouts.importId, importId)));
  for (const part of chunks(ws.map((w) => w.id))) {
    const wes = await db.select({ id: workoutExercises.id }).from(workoutExercises).where(inArray(workoutExercises.workoutId, part));
    for (const p of chunks(wes.map((w) => w.id))) await db.delete(sets).where(inArray(sets.workoutExerciseId, p));
    await db.delete(workoutExercises).where(inArray(workoutExercises.workoutId, part));
    await db.delete(workouts).where(and(eq(workouts.userId, userId), inArray(workouts.id, part)));
  }
  let ids: string[] = [];
  try {
    ids = (JSON.parse(rec.activityIds) as unknown[]).filter((x): x is string => typeof x === "string" && x.startsWith("sheet-"));
  } catch {
    ids = [];
  }
  for (const part of chunks(ids)) {
    await db.delete(garminActivities).where(and(eq(garminActivities.userId, userId), inArray(garminActivities.activityId, part)));
    await db.delete(garminRaw).where(and(eq(garminRaw.userId, userId), inArray(garminRaw.key, part), like(garminRaw.key, "sheet-%")));
  }
  await db.delete(sheetImports).where(eq(sheetImports.id, importId));
  return true;
}
