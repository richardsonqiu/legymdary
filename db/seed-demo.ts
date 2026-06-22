import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  bodyStats,
  exercises,
  sets,
  users,
  workoutExercises,
  workouts,
} from "./schema";
import { addDaysStr, round, todayStr } from "../lib/utils";

/**
 * Optional sample data for exploring charts, history and PRs. It attaches to an
 * existing signed-in user (sign in once first), and replaces THAT user's
 * workouts + body stats. The exercise library is untouched.
 * Run with: npm run db:seed:demo
 */

type Template = {
  name: string;
  ex: { name: string; base: number; reps: number[] }[];
};

const TEMPLATES: Record<"Push" | "Pull" | "Legs", Template> = {
  Push: {
    name: "Push Day",
    ex: [
      { name: "Barbell Bench Press", base: 60, reps: [8, 8, 6] },
      { name: "Overhead Press", base: 35, reps: [8, 8, 7] },
      { name: "Incline Dumbbell Press", base: 22, reps: [10, 10, 9] },
      { name: "Triceps Pushdown", base: 25, reps: [12, 12, 12] },
    ],
  },
  Pull: {
    name: "Pull Day",
    ex: [
      { name: "Deadlift", base: 100, reps: [5, 5, 5] },
      { name: "Barbell Row", base: 55, reps: [8, 8, 8] },
      { name: "Lat Pulldown", base: 50, reps: [10, 10, 10] },
      { name: "Barbell Curl", base: 25, reps: [10, 10, 9] },
    ],
  },
  Legs: {
    name: "Leg Day",
    ex: [
      { name: "Back Squat", base: 80, reps: [6, 6, 5] },
      { name: "Romanian Deadlift", base: 70, reps: [8, 8, 8] },
      { name: "Leg Press", base: 140, reps: [12, 12, 10] },
      { name: "Standing Calf Raise", base: 60, reps: [15, 15, 15] },
    ],
  },
};

const round2_5 = (x: number) => Math.round(x / 2.5) * 2.5;
const order: ("Push" | "Pull" | "Legs")[] = ["Push", "Pull", "Legs"];

async function main() {
  const someUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .limit(1);
  if (!someUsers.length) {
    console.error(
      "No users yet. Run `npm run dev`, sign in once at /login, then re-run this.",
    );
    process.exit(1);
  }
  const userId = someUsers[0].id;
  console.log(`Seeding demo data for ${someUsers[0].email} …`);

  // Clear this user's workouts + body stats.
  const userWorkouts = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(eq(workouts.userId, userId));
  const wids = userWorkouts.map((w) => w.id);
  if (wids.length) {
    const wes = await db
      .select({ id: workoutExercises.id })
      .from(workoutExercises)
      .where(inArray(workoutExercises.workoutId, wids));
    const weids = wes.map((w) => w.id);
    if (weids.length) {
      await db.delete(sets).where(inArray(sets.workoutExerciseId, weids));
    }
    await db
      .delete(workoutExercises)
      .where(inArray(workoutExercises.workoutId, wids));
    await db.delete(workouts).where(eq(workouts.userId, userId));
  }
  await db.delete(bodyStats).where(eq(bodyStats.userId, userId));

  const all = await db.select().from(exercises);
  const idByName = new Map(all.map((e) => [e.name, e.id]));

  const today = todayStr();
  const offsets = [
    0, 1, 2, 5, 7, 9, 12, 14, 16, 19, 21, 23, 28, 30, 35, 42, 49, 56,
  ];

  let typeIdx = 0;
  let workoutCount = 0;
  let setCount = 0;

  for (let i = offsets.length - 1; i >= 0; i--) {
    const offset = offsets[i];
    const date = addDaysStr(today, -offset);
    const type = order[typeIdx % 3];
    typeIdx += 1;
    const tpl = TEMPLATES[type];
    const factor = (56 - offset) / 56;

    const [w] = await db
      .insert(workouts)
      .values({ userId, name: tpl.name, date, finishedAt: new Date() })
      .returning({ id: workouts.id });
    workoutCount += 1;

    let pos = 0;
    for (const ex of tpl.ex) {
      const exId = idByName.get(ex.name);
      if (!exId) continue;
      const [we] = await db
        .insert(workoutExercises)
        .values({ workoutId: w.id, exerciseId: exId, position: pos++ })
        .returning({ id: workoutExercises.id });

      const top = round2_5(ex.base * (1 + 0.18 * factor));
      let sp = 0;
      await db.insert(sets).values({
        workoutExerciseId: we.id,
        weight: round2_5(top * 0.5),
        reps: 10,
        isWarmup: true,
        position: sp++,
      });
      for (const reps of ex.reps) {
        await db.insert(sets).values({
          workoutExerciseId: we.id,
          weight: top,
          reps,
          isWarmup: false,
          position: sp++,
        });
        setCount += 1;
      }
    }
  }

  const bsOffsets = [56, 49, 42, 35, 28, 21, 14, 7, 0];
  for (const offset of bsOffsets) {
    const t = (56 - offset) / 56;
    await db.insert(bodyStats).values({
      userId,
      date: addDaysStr(today, -offset),
      weight: round(82 - 4 * t, 1),
      waist: round(86 - 4 * t, 1),
      bodyFat: round(20 - 3 * t, 1),
    });
  }

  console.log(
    `Done. Created ${workoutCount} workouts, ${setCount} working sets, ${bsOffsets.length} body-stat entries.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
