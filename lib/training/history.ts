/** Server-only. Training history and today's recommendation for a user. */
import { and, desc, eq, gte, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { exercises, sets, workoutExercises, workouts } from "@/db/schema";
import { getEnergyContext } from "@/lib/energy-data";
import { recommendSession, type History, type Recommendation } from "@/lib/training/program";
import { addDaysStr } from "@/lib/utils";

export async function getTrainingHistory(userId: string, today: string): Promise<History> {
  const since = addDaysStr(today, -120);
  const [rows, recent] = await Promise.all([
    db
      .select({
        workoutId: workouts.id,
        date: workouts.date,
        exerciseId: workoutExercises.exerciseId,
        weight: sets.weight,
        reps: sets.reps,
      })
      .from(sets)
      .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .where(and(eq(workouts.userId, userId), gte(workouts.date, since), eq(sets.isWarmup, false), isNotNull(workouts.finishedAt)))
      .orderBy(desc(workouts.date), desc(workouts.id)),
    db
      .select({ date: workouts.date, planKey: workouts.planKey })
      .from(workouts)
      .where(and(eq(workouts.userId, userId), isNotNull(workouts.finishedAt)))
      .orderBy(desc(workouts.date), desc(workouts.id))
      .limit(20),
  ]);
  const last: History["last"] = {};
  const lastWorkout = new Map<number, number>();
  const usedRecently = new Set<number>();
  const sessions28 = new Set<number>();
  const from28 = addDaysStr(today, -28);
  const from90 = addDaysStr(today, -90);
  for (const r of rows) {
    if (r.date >= from28) sessions28.add(r.workoutId);
    if (r.date >= from90) usedRecently.add(r.exerciseId);
    const w = lastWorkout.get(r.exerciseId);
    if (w == null) {
      lastWorkout.set(r.exerciseId, r.workoutId);
      last[r.exerciseId] = { date: r.date, sets: [{ weight: r.weight, reps: r.reps }] };
    } else if (w === r.workoutId) {
      last[r.exerciseId].sets.push({ weight: r.weight, reps: r.reps });
    }
  }
  return { recent, sessionsLast28: sessions28.size, last, usedRecently };
}

export async function getRecommendation(userId: string, today: string): Promise<Recommendation> {
  const [history, energy, library] = await Promise.all([
    getTrainingHistory(userId, today),
    getEnergyContext(),
    db
      .select({ id: exercises.id, name: exercises.name, muscleGroup: exercises.muscleGroup, equipment: exercises.equipment })
      .from(exercises)
      .where(or(isNull(exercises.userId), eq(exercises.userId, userId))),
  ]);
  return recommendSession({
    library,
    history,
    trainingDays: energy.goals?.trainingDays ?? null,
    direction: energy.plan.direction,
    readiness: energy.readinessByDate[today]?.verdict ?? null,
  });
}
