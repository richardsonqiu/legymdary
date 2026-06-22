import "dotenv/config";
import { db } from "./index";
import { exercises, type NewExercise } from "./schema";

/**
 * The starter exercise library: 50+ common movements tagged by muscle group
 * and equipment. Seeding is idempotent — exercises already present (matched by
 * unique name) are skipped, so this is safe to re-run.
 */
const library: Omit<NewExercise, "isCustom">[] = [
  // ---- Chest ----
  { name: "Barbell Bench Press", muscleGroup: "Chest", equipment: "Barbell" },
  { name: "Incline Barbell Bench Press", muscleGroup: "Chest", equipment: "Barbell" },
  { name: "Dumbbell Bench Press", muscleGroup: "Chest", equipment: "Dumbbell" },
  { name: "Incline Dumbbell Press", muscleGroup: "Chest", equipment: "Dumbbell" },
  { name: "Dumbbell Fly", muscleGroup: "Chest", equipment: "Dumbbell" },
  { name: "Cable Crossover", muscleGroup: "Chest", equipment: "Cable" },
  { name: "Machine Chest Press", muscleGroup: "Chest", equipment: "Machine" },
  { name: "Pec Deck", muscleGroup: "Chest", equipment: "Machine" },
  { name: "Push-Up", muscleGroup: "Chest", equipment: "Bodyweight" },
  { name: "Chest Dip", muscleGroup: "Chest", equipment: "Bodyweight" },

  // ---- Back ----
  { name: "Deadlift", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Barbell Row", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Pendlay Row", muscleGroup: "Back", equipment: "Barbell" },
  { name: "T-Bar Row", muscleGroup: "Back", equipment: "Barbell" },
  { name: "Pull-Up", muscleGroup: "Back", equipment: "Bodyweight" },
  { name: "Chin-Up", muscleGroup: "Back", equipment: "Bodyweight" },
  { name: "Lat Pulldown", muscleGroup: "Back", equipment: "Cable" },
  { name: "Seated Cable Row", muscleGroup: "Back", equipment: "Cable" },
  { name: "Dumbbell Row", muscleGroup: "Back", equipment: "Dumbbell" },
  { name: "Face Pull", muscleGroup: "Back", equipment: "Cable" },

  // ---- Shoulders ----
  { name: "Overhead Press", muscleGroup: "Shoulders", equipment: "Barbell" },
  { name: "Seated Dumbbell Press", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Arnold Press", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Lateral Raise", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Front Raise", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Rear Delt Fly", muscleGroup: "Shoulders", equipment: "Dumbbell" },
  { name: "Machine Shoulder Press", muscleGroup: "Shoulders", equipment: "Machine" },
  { name: "Cable Lateral Raise", muscleGroup: "Shoulders", equipment: "Cable" },

  // ---- Biceps ----
  { name: "Barbell Curl", muscleGroup: "Biceps", equipment: "Barbell" },
  { name: "Dumbbell Curl", muscleGroup: "Biceps", equipment: "Dumbbell" },
  { name: "Hammer Curl", muscleGroup: "Biceps", equipment: "Dumbbell" },
  { name: "Preacher Curl", muscleGroup: "Biceps", equipment: "Barbell" },
  { name: "Cable Curl", muscleGroup: "Biceps", equipment: "Cable" },

  // ---- Triceps ----
  { name: "Triceps Pushdown", muscleGroup: "Triceps", equipment: "Cable" },
  { name: "Overhead Cable Extension", muscleGroup: "Triceps", equipment: "Cable" },
  { name: "Skull Crusher", muscleGroup: "Triceps", equipment: "Barbell" },
  { name: "Close-Grip Bench Press", muscleGroup: "Triceps", equipment: "Barbell" },
  { name: "Triceps Dip", muscleGroup: "Triceps", equipment: "Bodyweight" },

  // ---- Legs ----
  { name: "Back Squat", muscleGroup: "Quads", equipment: "Barbell" },
  { name: "Front Squat", muscleGroup: "Quads", equipment: "Barbell" },
  { name: "Leg Press", muscleGroup: "Quads", equipment: "Machine" },
  { name: "Leg Extension", muscleGroup: "Quads", equipment: "Machine" },
  { name: "Walking Lunge", muscleGroup: "Quads", equipment: "Dumbbell" },
  { name: "Bulgarian Split Squat", muscleGroup: "Quads", equipment: "Dumbbell" },
  { name: "Romanian Deadlift", muscleGroup: "Hamstrings", equipment: "Barbell" },
  { name: "Lying Leg Curl", muscleGroup: "Hamstrings", equipment: "Machine" },
  { name: "Hip Thrust", muscleGroup: "Glutes", equipment: "Barbell" },
  { name: "Standing Calf Raise", muscleGroup: "Calves", equipment: "Machine" },
  { name: "Seated Calf Raise", muscleGroup: "Calves", equipment: "Machine" },

  // ---- Core ----
  { name: "Plank", muscleGroup: "Core", equipment: "Bodyweight" },
  { name: "Hanging Leg Raise", muscleGroup: "Core", equipment: "Bodyweight" },
  { name: "Cable Crunch", muscleGroup: "Core", equipment: "Cable" },
  { name: "Russian Twist", muscleGroup: "Core", equipment: "Bodyweight" },
  { name: "Ab Wheel Rollout", muscleGroup: "Core", equipment: "Bodyweight" },
];

async function main() {
  console.log(`Seeding ${library.length} exercises...`);

  await db
    .insert(exercises)
    .values(library.map((e) => ({ ...e, isCustom: false })))
    .onConflictDoNothing();

  const all = await db.select().from(exercises);
  console.log(`Done. Exercise library now has ${all.length} exercises.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
