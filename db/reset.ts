import "dotenv/config";
import { db } from "./index";
import {
  aiUsage,
  bodyStats,
  garminActivities,
  garminDaily,
  meals,
  sets,
  templateExercises,
  templates,
  workoutExercises,
  workouts,
} from "./schema";

/**
 * Clears all logged data (workouts, sets, meals, body stats) but keeps the exercise
 * library. Handy for wiping demo data before you start logging for real.
 */
async function main() {
  await db.delete(sets);
  await db.delete(workoutExercises);
  await db.delete(workouts);
  await db.delete(bodyStats);
  await db.delete(meals);
  await db.delete(templateExercises);
  await db.delete(templates);
  await db.delete(aiUsage);
  await db.delete(garminDaily);
  await db.delete(garminActivities);
  console.log("Cleared all workouts, meals and body stats. Exercise library kept.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
