import "dotenv/config";
import { db } from "./index";
import {
  bodyStats,
  exercises,
  sets,
  workoutExercises,
  workouts,
} from "./schema";
import { addDaysStr, round, todayStr } from "../lib/utils";

/**
 * Optional sample data so you can explore charts, history and PRs without
 * logging weeks of workouts by hand. It WIPES existing workouts + body stats
 * (the exercise library is kept). Run with: npm run db:seed:demo
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
  console.log("Resetting workouts + body stats…");
  await db.delete(sets);
  await db.delete(workoutExercises);
  await db.delete(workouts);
  await db.delete(bodyStats);

  const all = await db.select().from(exercises);
  const idByName = new Map(all.map((e) => [e.name, e.id]));

  const today = todayStr();
  // Spread of dates: 0/1/2 days ago form a current streak; rest span ~8 weeks.
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
    const factor = (56 - offset) / 56; // older → 0, newer → 1

    const [w] = await db
      .insert(workouts)
      .values({
        name: tpl.name,
        date,
        finishedAt: new Date(),
      })
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
      // one warmup
      await db.insert(sets).values({
        workoutExerciseId: we.id,
        weight: round2_5(top * 0.5),
        reps: 10,
        isWarmup: true,
        position: sp++,
      });
      // working sets
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

  // Body stats trending over ~8 weeks
  const bsOffsets = [56, 49, 42, 35, 28, 21, 14, 7, 0];
  for (const offset of bsOffsets) {
    const t = (56 - offset) / 56;
    await db.insert(bodyStats).values({
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
