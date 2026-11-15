import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bodyStats,
  exercises,
  garminDaily,
  meals,
  sets,
  workoutExercises,
  workouts,
} from "@/db/schema";
import { getSessionUser } from "@/lib/session";

/** CSV download of the signed-in user's data: ?type=workouts|meals|body|garmin */

type Cell = string | number | boolean | null | undefined;

function csv(header: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    if (v == null) return "";
    const s = String(v);
    // Quote when needed; neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.id) return new Response("Not signed in", { status: 401 });
  const userId = user.id;
  const type = new URL(request.url).searchParams.get("type") ?? "workouts";

  let body: string;
  if (type === "workouts") {
    const rows = await db
      .select({
        date: workouts.date,
        workout: workouts.name,
        exercise: exercises.name,
        muscleGroup: exercises.muscleGroup,
        wePos: workoutExercises.position,
        setPos: sets.position,
        weight: sets.weight,
        reps: sets.reps,
        isWarmup: sets.isWarmup,
        notes: sets.notes,
      })
      .from(sets)
      .innerJoin(workoutExercises, eq(sets.workoutExerciseId, workoutExercises.id))
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .innerJoin(exercises, eq(workoutExercises.exerciseId, exercises.id))
      .where(eq(workouts.userId, userId))
      .orderBy(asc(workouts.date), asc(workouts.id), asc(workoutExercises.position), asc(sets.position));
    body = csv(
      ["date", "workout", "exercise", "muscle_group", "set", "weight_kg", "reps", "warmup", "notes"],
      rows.map((r) => [r.date, r.workout, r.exercise, r.muscleGroup, r.setPos + 1, r.weight, r.reps, r.isWarmup, r.notes]),
    );
  } else if (type === "meals") {
    const rows = await db
      .select()
      .from(meals)
      .where(eq(meals.userId, userId))
      .orderBy(asc(meals.date), asc(meals.createdAt));
    body = csv(
      ["date", "meal_type", "name", "calories", "protein_g", "carbs_g", "fat_g", "ai_estimated", "items", "notes"],
      rows.map((r) => {
        let items = "";
        try {
          const arr = r.items ? (JSON.parse(r.items) as { name: string; portion?: string }[]) : [];
          items = arr.map((i) => (i.portion ? `${i.name} (${i.portion})` : i.name)).join("; ");
        } catch {
          /* ignore malformed */
        }
        return [r.date, r.mealType, r.name, Math.round(r.calories), Math.round(r.protein), Math.round(r.carbs), Math.round(r.fat), r.aiEstimated, items, r.notes];
      }),
    );
  } else if (type === "body") {
    const rows = await db
      .select()
      .from(bodyStats)
      .where(and(eq(bodyStats.userId, userId)))
      .orderBy(asc(bodyStats.date));
    body = csv(
      ["date", "weight_kg", "waist_cm", "body_fat_pct"],
      rows.map((r) => [r.date, r.weight, r.waist, r.bodyFat]),
    );
  } else if (type === "garmin") {
    const rows = await db
      .select()
      .from(garminDaily)
      .where(eq(garminDaily.userId, userId))
      .orderBy(asc(garminDaily.date));
    body = csv(
      ["date", "total_kcal", "active_kcal", "bmr_kcal", "steps", "resting_hr", "sleep_hours", "sleep_score", "hrv_last_night", "hrv_status", "body_battery_high", "body_battery_low", "stress_avg"],
      rows.map((r) => [r.date, r.totalKcal, r.activeKcal, r.bmrKcal, r.steps, r.restingHr, r.sleepSeconds != null ? Math.round(r.sleepSeconds / 360) / 10 : null, r.sleepScore, r.hrvLastNight, r.hrvStatus, r.bodyBatteryHigh, r.bodyBatteryLow, r.stressAvg]),
    );
  } else {
    return new Response("Unknown export type", { status: 400 });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="legymdary-${type}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
