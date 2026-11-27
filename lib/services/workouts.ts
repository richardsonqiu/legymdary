import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { exercises, garminActivities, sets, templateExercises, templates, workoutExercises, workouts } from "@/db/schema";
import { estimate1RM } from "@legymdary/shared";
import { getRecommendation } from "@/lib/training/history";
import { userToday } from "@/lib/session";
import { DATE_RE, clip, safeDate, UserError } from "./util";

/** Throws unless the workout belongs to the user. */
export async function assertOwnsWorkout(userId: string, workoutId: number) {
  const rows = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .limit(1);
  if (!rows[0]) throw new UserError("Workout not found.");
}

/** Returns the workout-exercise's exerciseId if it belongs to the user. */
export async function ownedWorkoutExercise(userId: string, workoutExerciseId: number) {
  const rows = await db
    .select({
      exerciseId: workoutExercises.exerciseId,
      userId: workouts.userId,
    })
    .from(workoutExercises)
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(workoutExercises.id, workoutExerciseId))
    .limit(1);
  const row = rows[0];
  if (!row || row.userId !== userId) return null;
  return row.exerciseId;
}

/**
 * A gym session logged in the app while the watch also recorded it: link it
 * to that day's strength activity (if exactly one isn't linked yet), so the
 * two count as one session and the activity shows the exercises.
 */
export async function autoLinkActivity(userId: string, workoutId: number) {
  const [w] = await db
    .select({ date: workouts.date, linked: workouts.garminActivityId })
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .limit(1);
  if (!w || w.linked) return;
  const candidates = await db
    .select({ activityId: garminActivities.activityId })
    .from(garminActivities)
    .where(
      and(
        eq(garminActivities.userId, userId),
        eq(garminActivities.date, w.date),
        sql`(${garminActivities.type} like '%strength%' or ${garminActivities.type} like '%weight%' or ${garminActivities.type} = 'hiit')`,
        sql`not exists (select 1 from ${workouts} x where x.user_id = ${userId} and x.garmin_activity_id = ${garminActivities.activityId})`,
      ),
    );
  if (candidates.length === 1) {
    await db.update(workouts).set({ garminActivityId: candidates[0].activityId }).where(eq(workouts.id, workoutId));
  }
}

export async function createWorkout(userId: string, input: {
  name: string;
  date: string;
}): Promise<number> {  const name = clip(input.name, 80) || "Workout";
  const date = safeDate(input.date);
  const [row] = await db
    .insert(workouts)
    .values({ userId, name, date })
    .returning({ id: workouts.id });  return row.id;
}

export async function duplicateLastWorkout(userId: string): Promise<number | null> {  const candidates = await db.query.workouts.findMany({
    where: eq(workouts.userId, userId),
    orderBy: desc(workouts.date),
    limit: 10,
    with: { workoutExercises: { orderBy: (f, ops) => ops.asc(f.position) } },
  });
  const last =
    candidates.find((c) => c.workoutExercises.length > 0) ?? candidates[0];
  if (!last) return null;

  const [row] = await db
    .insert(workouts)
    .values({ userId, name: last.name, date: await userToday() })
    .returning({ id: workouts.id });

  if (last.workoutExercises.length) {
    await db.insert(workoutExercises).values(
      last.workoutExercises.map((we, i) => ({
        workoutId: row.id,
        exerciseId: we.exerciseId,
        position: i,
      })),
    );
  }  return row.id;
}

export async function updateWorkout(userId: string, 
  workoutId: number,
  input: { name?: string; date?: string; notes?: string | null },
): Promise<void> {  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = clip(input.name, 80) || "Workout";
  if (input.date !== undefined && input.date) patch.date = safeDate(input.date);
  if (input.notes !== undefined) patch.notes = clip(input.notes, 2000) || null;
  if (Object.keys(patch).length) {
    await db
      .update(workouts)
      .set(patch)
      .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));
  }}

export async function finishWorkout(userId: string, workoutId: number): Promise<void> {  await db
    .update(workouts)
    .set({ finishedAt: new Date() })
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));
  await autoLinkActivity(userId, workoutId);}

export async function discardWorkout(userId: string, workoutId: number): Promise<void> {  await assertOwnsWorkout(userId, workoutId);
  const wes = await db
    .select({ id: workoutExercises.id })
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId));
  const ids = wes.map((w) => w.id);
  if (ids.length) {
    await db.delete(sets).where(inArray(sets.workoutExerciseId, ids));
  }
  await db
    .delete(workoutExercises)
    .where(eq(workoutExercises.workoutId, workoutId));
  await db
    .delete(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)));}

export async function addExerciseToWorkout(userId: string, 
  workoutId: number,
  exerciseId: number,
): Promise<number> {  await assertOwnsWorkout(userId, workoutId);

  // The exercise must be a built-in or one of this user's customs.
  const ex = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        eq(exercises.id, exerciseId),
        or(isNull(exercises.userId), eq(exercises.userId, userId)),
      ),
    )
    .limit(1);
  if (!ex[0]) throw new UserError("Exercise not found.");

  const position = await db.$count(
    workoutExercises,
    eq(workoutExercises.workoutId, workoutId),
  );
  const [row] = await db
    .insert(workoutExercises)
    .values({ workoutId, exerciseId, position })
    .returning({ id: workoutExercises.id });  return row.id;
}

export async function removeWorkoutExercise(userId: string, 
  workoutExerciseId: number,
): Promise<void> {  const owned = await ownedWorkoutExercise(userId, workoutExerciseId);
  if (owned === null) throw new UserError("Not found.");
  await db.delete(sets).where(eq(sets.workoutExerciseId, workoutExerciseId));
  await db
    .delete(workoutExercises)
    .where(eq(workoutExercises.id, workoutExerciseId));}

export async function logSet(userId: string, input: {
  workoutExerciseId: number;
  reps: number | string;
  weight: number | string;
  isWarmup?: boolean;
  notes?: string | null;
}): Promise<{ isPR: boolean; e1rm: number }> {  const reps = Math.round(Number(input.reps));
  const weight = Number(input.weight);
  if (!Number.isFinite(reps) || reps <= 0 || reps > 1000) {
    throw new UserError("Reps must be between 1 and 1000.");
  }
  if (!Number.isFinite(weight) || weight < 0 || weight > 2000) {
    throw new UserError("Weight must be between 0 and 2000 kg.");
  }
  const isWarmup = !!input.isWarmup;

  const exerciseId = await ownedWorkoutExercise(userId, input.workoutExerciseId);
  if (exerciseId === null) throw new UserError("That exercise is not in your workout.");

  // Best estimated 1RM for this exercise across *this user's* sets so far.
  let prevBest = 0;
  if (!isWarmup) {
    const rows = await db
      .select({ reps: sets.reps, weight: sets.weight })
      .from(sets)
      .innerJoin(
        workoutExercises,
        eq(sets.workoutExerciseId, workoutExercises.id),
      )
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .where(
        and(
          eq(workoutExercises.exerciseId, exerciseId),
          eq(sets.isWarmup, false),
          eq(workouts.userId, userId),
        ),
      );
    for (const r of rows) {
      prevBest = Math.max(prevBest, estimate1RM(r.weight, r.reps));
    }
  }

  const position = await db.$count(
    sets,
    eq(sets.workoutExerciseId, input.workoutExerciseId),
  );
  await db.insert(sets).values({
    workoutExerciseId: input.workoutExerciseId,
    reps,
    weight,
    isWarmup,
    notes: clip(input.notes, 500) || null,
    position,
  });

  const e1rm = estimate1RM(weight, reps);
  const isPR = !isWarmup && e1rm > 0 && e1rm > prevBest;  return { isPR, e1rm };
}

export async function deleteSet(userId: string, setId: number): Promise<void> {  const rows = await db
    .select({ userId: workouts.userId })
    .from(sets)
    .innerJoin(
      workoutExercises,
      eq(sets.workoutExerciseId, workoutExercises.id),
    )
    .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
    .where(eq(sets.id, setId))
    .limit(1);
  if (!rows[0] || rows[0].userId !== userId) throw new UserError("Not found.");
  await db.delete(sets).where(eq(sets.id, setId));}

export async function createExercise(userId: string, input: {
  name: string;
  muscleGroup: string;
  equipment: string;
}): Promise<{ id: number } | { error: string }> {  const name = clip(input.name, 80);
  if (!name) return { error: "Please enter a name." };
  const muscleGroup = clip(input.muscleGroup, 40) || "Other";
  const equipment = clip(input.equipment, 40) || "Other";

  // Reject if it clashes with a built-in or one of the user's own exercises.
  const existing = await db
    .select({ name: exercises.name })
    .from(exercises)
    .where(or(isNull(exercises.userId), eq(exercises.userId, userId)));
  if (existing.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
    return { error: "You already have an exercise with that name." };
  }

  const [row] = await db
    .insert(exercises)
    .values({ name, muscleGroup, equipment, isCustom: true, userId })
    .returning({ id: exercises.id });  return { id: row.id };
}

export async function startWorkoutFromTemplate(userId: string, 
  templateId: number,
  date: string,
): Promise<number> {  const [tpl] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.userId, userId)))
    .limit(1);
  if (!tpl) throw new UserError("Template not found.");
  const items = await db
    .select()
    .from(templateExercises)
    .where(eq(templateExercises.templateId, templateId))
    .orderBy(templateExercises.position);

  const [row] = await db
    .insert(workouts)
    .values({ userId, name: tpl.name, date: DATE_RE.test(date) ? date : await userToday() })
    .returning({ id: workouts.id });
  if (items.length) {
    await db.insert(workoutExercises).values(
      items.map((it, i) => ({ workoutId: row.id, exerciseId: it.exerciseId, position: i, targetSets: it.targetSets })),
    );
  }
  await db
    .update(templates)
    .set({ lastUsedAt: new Date() })
    .where(eq(templates.id, templateId));  return row.id;
}

/** Starts today's recommended session with its exercises and targets. */
export async function startRecommendedWorkout(userId: string): Promise<{ id: number } | { error: string }> {  const today = await userToday();
  const [open] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.userId, userId), isNull(workouts.finishedAt)))
    .limit(1);
  if (open) return { error: "Finish or discard the workout in progress first." };
  const rec = await getRecommendation(userId, today);
  if (!rec.exercises.length) return { error: "No matching exercises in your library." };
  const [w] = await db
    .insert(workouts)
    .values({ userId, name: rec.title, date: today, planKey: rec.planKey })
    .returning({ id: workouts.id });
  await db.insert(workoutExercises).values(
    rec.exercises.map((e, i) => ({
      workoutId: w.id,
      exerciseId: e.exerciseId,
      position: i,
      targetSets: e.sets,
      targetReps: e.reps,
      targetWeight: e.weight,
    })),
  );  return { id: w.id };
}
