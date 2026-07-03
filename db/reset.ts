import "dotenv/config";
import { db } from "./index";
import { bodyStats, sets, workoutExercises, workouts } from "./schema";

/**
 * Clears all logged data (workouts, sets, body stats) but keeps the exercise
 * library. Handy for wiping demo data before you start logging for real.
 */
async function main() {
  await db.delete(sets);
  await db.delete(workoutExercises);
  await db.delete(workouts);
  await db.delete(bodyStats);
  console.log("Cleared all workouts and body stats. Exercise library kept.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
