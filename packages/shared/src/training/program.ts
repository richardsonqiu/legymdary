/**
 * Recommended gym session for today.
 *
 * - Split from how many days a week you train (set on the Train tab, else
 *   worked out from the last 4 weeks): 2–3 → full body A/B, 4 → upper /
 *   lower, 5–6 → push / pull / legs. Today's session is the next one after
 *   the last planned session you did.
 * - Each slot picks an exercise from your library, preferring ones you have
 *   done recently.
 * - Sets × reps by goal (losing: keep strength with fewer sets; gaining: one
 *   more set on the big lifts), compound lifts 6–10 reps, isolation 10–15.
 * - Weight: progressive overload from last time. Hit the top of the range
 *   on every set → add 2.5 kg (barbell, machine, cable) or 2 kg (dumbbells);
 *   otherwise keep the weight and add a rep. No history → pick a weight you
 *   could lift 2 more times.
 * - Low readiness (sleep, HRV, resting heart rate): one set fewer per
 *   exercise and stop further from failure.
 */

export type Split = "full" | "upper_lower" | "ppl";
export type PlanKey = "full_a" | "full_b" | "upper" | "lower" | "push" | "pull" | "legs";

const SPLIT_ORDER: Record<Split, PlanKey[]> = {
  full: ["full_a", "full_b"],
  upper_lower: ["upper", "lower"],
  ppl: ["push", "pull", "legs"],
};

export const PLAN_LABEL: Record<PlanKey, string> = {
  full_a: "Full body A",
  full_b: "Full body B",
  upper: "Upper body",
  lower: "Lower body",
  push: "Push",
  pull: "Pull",
  legs: "Legs",
};
export const SPLIT_LABEL: Record<Split, string> = { full: "Full body", upper_lower: "Upper / lower", ppl: "Push / pull / legs" };

type Slot = { options: string[]; kind: "compound" | "isolation" };
const S = (kind: Slot["kind"], ...options: string[]): Slot => ({ kind, options });

const SESSIONS: Record<PlanKey, Slot[]> = {
  full_a: [
    S("compound", "Back Squat", "Leg Press", "Bulgarian Split Squat"),
    S("compound", "Barbell Bench Press", "Dumbbell Bench Press", "Machine Chest Press", "Push-Up"),
    S("compound", "Barbell Row", "Seated Cable Row", "Dumbbell Row"),
    S("compound", "Romanian Deadlift", "Lying Leg Curl"),
    S("isolation", "Lateral Raise", "Cable Lateral Raise"),
    S("isolation", "Plank", "Cable Crunch"),
  ],
  full_b: [
    S("compound", "Deadlift", "Romanian Deadlift", "Hip Thrust"),
    S("compound", "Overhead Press", "Seated Dumbbell Press", "Machine Shoulder Press"),
    S("compound", "Lat Pulldown", "Pull-Up", "Chin-Up"),
    S("compound", "Bulgarian Split Squat", "Walking Lunge", "Leg Press"),
    S("compound", "Incline Dumbbell Press", "Incline Barbell Bench Press"),
    S("isolation", "Dumbbell Curl", "Hammer Curl"),
    S("isolation", "Triceps Pushdown", "Overhead Cable Extension"),
  ],
  upper: [
    S("compound", "Barbell Bench Press", "Dumbbell Bench Press", "Machine Chest Press"),
    S("compound", "Barbell Row", "Seated Cable Row", "Dumbbell Row"),
    S("compound", "Overhead Press", "Seated Dumbbell Press", "Machine Shoulder Press"),
    S("compound", "Lat Pulldown", "Pull-Up", "Chin-Up"),
    S("isolation", "Lateral Raise", "Cable Lateral Raise"),
    S("isolation", "Dumbbell Curl", "Barbell Curl", "Cable Curl"),
    S("isolation", "Triceps Pushdown", "Skull Crusher"),
  ],
  lower: [
    S("compound", "Back Squat", "Front Squat", "Leg Press"),
    S("compound", "Romanian Deadlift", "Deadlift"),
    S("compound", "Bulgarian Split Squat", "Walking Lunge", "Leg Press"),
    S("isolation", "Lying Leg Curl", "Leg Extension"),
    S("isolation", "Standing Calf Raise", "Seated Calf Raise"),
    S("isolation", "Hanging Leg Raise", "Plank", "Cable Crunch"),
  ],
  push: [
    S("compound", "Barbell Bench Press", "Dumbbell Bench Press", "Machine Chest Press"),
    S("compound", "Overhead Press", "Seated Dumbbell Press"),
    S("compound", "Incline Dumbbell Press", "Incline Barbell Bench Press"),
    S("isolation", "Lateral Raise", "Cable Lateral Raise"),
    S("isolation", "Triceps Pushdown", "Skull Crusher"),
    S("isolation", "Overhead Cable Extension", "Triceps Dip"),
  ],
  pull: [
    S("compound", "Deadlift", "Barbell Row", "T-Bar Row"),
    S("compound", "Lat Pulldown", "Pull-Up", "Chin-Up"),
    S("compound", "Seated Cable Row", "Dumbbell Row"),
    S("isolation", "Face Pull", "Rear Delt Fly"),
    S("isolation", "Dumbbell Curl", "Barbell Curl"),
    S("isolation", "Hammer Curl", "Cable Curl"),
  ],
  legs: [
    S("compound", "Back Squat", "Front Squat", "Leg Press"),
    S("compound", "Romanian Deadlift", "Hip Thrust"),
    S("compound", "Leg Press", "Bulgarian Split Squat", "Walking Lunge"),
    S("isolation", "Lying Leg Curl", "Leg Extension"),
    S("isolation", "Standing Calf Raise", "Seated Calf Raise"),
    S("isolation", "Hanging Leg Raise", "Ab Wheel Rollout", "Plank"),
  ],
};

export type LibraryExercise = { id: number; name: string; muscleGroup: string; equipment: string };
export type History = {
  /** Planned sessions done, newest first. */
  recent: { date: string; planKey: string | null }[];
  /** Gym sessions in the last 28 days. */
  sessionsLast28: number;
  /** Last working sets per exercise id, newest session. */
  last: Record<number, { date: string; sets: { weight: number; reps: number }[] }>;
  /** Exercise ids done in the last 90 days. */
  usedRecently: Set<number>;
};

export type PlannedExercise = {
  exerciseId: number;
  name: string;
  muscleGroup: string;
  equipment: string;
  kind: "compound" | "isolation";
  sets: number;
  reps: string;
  lo: number;
  hi: number;
  weight: number | null;
  /** "+2.5 kg", "same weight, +1 rep", "new". */
  progression: string;
  restSec: number;
  last: { date: string; top: string } | null;
};

export type Recommendation = {
  split: Split;
  days: number;
  daysFromHistory: boolean;
  planKey: PlanKey;
  title: string;
  why: string[];
  lighter: boolean;
  exercises: PlannedExercise[];
  minutes: number;
};

export function splitFor(days: number): Split {
  return days <= 3 ? "full" : days === 4 ? "upper_lower" : "ppl";
}

function increment(eq: string) {
  if (eq === "Dumbbell") return 2;
  if (eq === "Bodyweight") return 0;
  return 2.5;
}

export function recommendSession(input: {
  library: LibraryExercise[];
  history: History;
  trainingDays: number | null;
  direction: "lose" | "gain" | "maintain";
  readiness: "push" | "normal" | "easy" | null;
}): Recommendation {
  const inferred = Math.round(input.history.sessionsLast28 / 4);
  const days = input.trainingDays ?? Math.max(2, Math.min(6, inferred || 3));
  const split = splitFor(days);
  const order = SPLIT_ORDER[split];
  const lastPlanned = input.history.recent.find((r) => r.planKey && (order as string[]).includes(r.planKey));
  const planKey = lastPlanned ? order[(order.indexOf(lastPlanned.planKey as PlanKey) + 1) % order.length] : order[0];
  const lighter = input.readiness === "easy";

  const byName = new Map(input.library.map((e) => [e.name.toLowerCase(), e]));
  const used = new Set<number>();
  const exercises: PlannedExercise[] = [];
  for (const slot of SESSIONS[planKey]) {
    const candidates = slot.options.map((n) => byName.get(n.toLowerCase())).filter((e): e is LibraryExercise => !!e && !used.has(e.id));
    const pick = candidates.find((e) => input.history.usedRecently.has(e.id)) ?? candidates[0];
    if (!pick) continue;
    used.add(pick.id);
    const [lo, hi] = slot.kind === "compound" ? [6, 10] : [10, 15];
    let sets = slot.kind === "compound" ? (input.direction === "gain" ? 4 : 3) : 3;
    if (lighter) sets = Math.max(2, sets - 1);
    const last = input.history.last[pick.id];
    let weight: number | null = null;
    let progression = "new: pick a weight you could lift 2 more times";
    let top: string | null = null;
    if (last && last.sets.length) {
      const topW = Math.max(...last.sets.map((s) => s.weight));
      const atTop = last.sets.filter((s) => s.weight === topW);
      top = `${topW ? `${topW} kg × ` : ""}${atTop.map((s) => s.reps).join(", ")}`;
      const inc = increment(pick.equipment);
      if (pick.equipment === "Bodyweight" || topW === 0) {
        weight = topW || null;
        progression = atTop.every((s) => s.reps >= hi) ? "add 1 to 2 reps or a little weight" : "aim for 1 more rep";
      } else if (!lighter && atTop.every((s) => s.reps >= hi) && atTop.length >= Math.min(2, sets)) {
        weight = topW + inc;
        progression = `+${inc} kg`;
      } else {
        weight = topW;
        progression = lighter ? "same weight, easier sets" : "same weight, +1 rep";
      }
    }
    exercises.push({
      exerciseId: pick.id,
      name: pick.name,
      muscleGroup: pick.muscleGroup,
      equipment: pick.equipment,
      kind: slot.kind,
      sets,
      reps: `${lo}–${hi}`,
      lo,
      hi,
      weight,
      progression,
      restSec: slot.kind === "compound" ? 150 : 75,
      last: last && top ? { date: last.date, top } : null,
    });
  }

  const why: string[] = [];
  why.push(`${SPLIT_LABEL[split]}, ${days} days a week${input.trainingDays ? "" : " (from your last 4 weeks)"}`);
  if (lastPlanned) why.push(`Last: ${PLAN_LABEL[lastPlanned.planKey as PlanKey]} on ${lastPlanned.date}`);
  if (input.direction === "lose") why.push("Losing: heavy enough to keep your muscle");
  if (input.direction === "gain") why.push("Gaining: an extra set on the big lifts");
  if (lighter) why.push("Readiness is low: one set fewer, stop 3 reps short of failure");

  // About 40 s per set plus rest, plus a 10 min warm-up.
  const minutes = Math.round(10 + exercises.reduce((a, e) => a + e.sets * (40 + e.restSec), 0) / 60);
  return { split, days, daysFromHistory: !input.trainingDays, planKey, title: PLAN_LABEL[planKey], why, lighter, exercises, minutes };
}
