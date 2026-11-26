import { estimate1RM } from "../utils";

/** Logging-session math shared by the web workout editor and the mobile Train tab. */

type SetLike = { id: number; weight: number; reps: number; isWarmup: boolean };
type ExerciseLike = {
  sets: SetLike[];
  targetSets: number | null;
  targetReps: string | null;
  targetWeight: number | null;
};

/** The set with the best estimated 1RM among working sets (warmups never count), or null. */
export function bestSetId(sets: SetLike[]): number | null {
  let best = 0;
  let id: number | null = null;
  for (const s of sets) {
    if (s.isWarmup) continue;
    const v = estimate1RM(s.weight, s.reps);
    if (v > best) {
      best = v;
      id = s.id;
    }
  }
  return id;
}

/** Working (non-warmup) sets logged for an exercise. */
export const workingSetCount = (ex: { sets: { isWarmup: boolean }[] }) => ex.sets.filter((s) => !s.isWarmup).length;

/**
 * Starting weight and reps for the next set: this session's last set, else a planned
 * target (its weight and the low end of the rep range), else last time's final set.
 * Empty strings mean "no suggestion".
 */
export function nextSetDefault(ex: ExerciseLike, previous?: { weight: number; reps: number }[]): { weight: string; reps: string } {
  const last = ex.sets[ex.sets.length - 1];
  if (last) return { weight: String(last.weight), reps: String(last.reps) };
  if (ex.targetWeight != null || ex.targetReps) {
    const lo = ex.targetReps ? Number.parseInt(ex.targetReps, 10) : NaN;
    return { weight: ex.targetWeight != null ? String(ex.targetWeight) : "", reps: Number.isFinite(lo) ? String(lo) : "" };
  }
  const prevLast = previous?.[previous.length - 1];
  return { weight: prevLast ? String(prevLast.weight) : "", reps: prevLast ? String(prevLast.reps) : "" };
}

/** Numbers for the "workout done" summary: minutes (null when unknown or over 10 h), planned and finished sets. */
export function sessionSummary(
  workout: { exercises: ExerciseLike[]; totalSets: number; totalVolume: number; startedAt: string | null; garminActivityId: string | null },
  nowMs: number,
) {
  const planned = workout.exercises.reduce((a, e) => a + (e.targetSets ?? 0), 0);
  const done = workout.exercises.reduce((a, e) => a + Math.min(e.targetSets ?? 0, workingSetCount(e)), 0);
  const minutes = workout.startedAt && !workout.garminActivityId ? Math.round((nowMs - Date.parse(workout.startedAt)) / 60_000) : null;
  return { minutes: minutes != null && minutes < 600 ? minutes : null, sets: workout.totalSets, volume: workout.totalVolume, planned, done };
}
