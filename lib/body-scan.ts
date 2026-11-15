import type { BodyScan } from "@/db/schema";

/** Pure helpers for body-composition scans (shared by Stats, Plan and Insights). */

export const SEGMENTS = ["leftArm", "rightArm", "trunk", "leftLeg", "rightLeg"] as const;
export type Segment = (typeof SEGMENTS)[number];
export type SegValues = Partial<Record<Segment, { kg: number | null; pct: number | null }>>;
export const SEGMENT_LABEL: Record<Segment, string> = {
  leftArm: "Left arm",
  rightArm: "Right arm",
  trunk: "Trunk",
  leftLeg: "Left leg",
  rightLeg: "Right leg",
};

export function parseSegments(json: string | null): SegValues | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as SegValues) : null;
  } catch {
    return null;
  }
}

const r = (v: number, p = 1) => Math.round(v * 10 ** p) / 10 ** p;
const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Lean (fat-free) mass from a scan. */
export function leanMass(s: Pick<BodyScan, "weight" | "fatMass" | "bodyFatPct">): number | null {
  if (s.weight != null && s.fatMass != null) return r(s.weight - s.fatMass);
  if (s.weight != null && s.bodyFatPct != null) return r(s.weight * (1 - s.bodyFatPct / 100));
  return null;
}

export type ScanChange = {
  days: number;
  weight: number | null;
  muscle: number | null;
  fat: number | null;
  bodyFatPct: number | null;
  visceral: number | null;
  /** Plain-language verdict on what changed. */
  verdict: { text: string; tone: "good" | "bad" | "mixed" } | null;
};

export function compareScans(prev: BodyScan, cur: BodyScan): ScanChange {
  const d = (a: number | null, b: number | null, p = 1) => (a != null && b != null ? r(b - a, p) : null);
  const muscle = d(prev.skeletalMuscle, cur.skeletalMuscle);
  const fat = d(prev.fatMass, cur.fatMass);
  let verdict: ScanChange["verdict"] = null;
  if (muscle != null && fat != null) {
    const mUp = muscle >= 0.3, mDown = muscle <= -0.3, fUp = fat >= 0.5, fDown = fat <= -0.5;
    if (mUp && fDown) verdict = { text: "Recomposition — gained muscle and lost fat", tone: "good" };
    else if (mUp && !fUp) verdict = { text: "Gained muscle without adding fat", tone: "good" };
    else if (fDown && !mDown) verdict = { text: "Lost fat while keeping muscle", tone: "good" };
    else if (mUp && fUp) verdict = { text: "Gained muscle and fat (a bulk)", tone: "mixed" };
    else if (fDown && mDown) verdict = { text: "Lost fat but also some muscle — raise protein and keep lifting heavy", tone: "mixed" };
    else if (mDown && fUp) verdict = { text: "Lost muscle and gained fat — the change to reverse first", tone: "bad" };
    else if (fUp) verdict = { text: "Gained fat with muscle steady", tone: "bad" };
    else if (mDown) verdict = { text: "Lost some muscle with fat steady", tone: "bad" };
    else verdict = { text: "Body composition roughly unchanged", tone: "mixed" };
  }
  return {
    days: Math.round((Date.parse(cur.date) - Date.parse(prev.date)) / 86_400_000),
    weight: d(prev.weight, cur.weight),
    muscle,
    fat,
    bodyFatPct: d(prev.bodyFatPct, cur.bodyFatPct),
    visceral: d(prev.visceralFat, cur.visceralFat, 0),
    verdict,
  };
}

export type SegmentBalance = {
  armsPct: number | null;
  legsPct: number | null;
  trunkPct: number | null;
  /** Arms minus legs (percentage points of ideal). */
  upperLowerGap: number | null;
  leftRightArms: number | null;
  leftRightLegs: number | null;
  advice: string | null;
};

export function segmentBalance(seg: SegValues | null): SegmentBalance | null {
  if (!seg) return null;
  const armsPct = avg([seg.leftArm?.pct, seg.rightArm?.pct]);
  const legsPct = avg([seg.leftLeg?.pct, seg.rightLeg?.pct]);
  const gap = armsPct != null && legsPct != null ? r(armsPct - legsPct) : null;
  const lrA = seg.leftArm?.kg != null && seg.rightArm?.kg != null ? r(((seg.rightArm.kg - seg.leftArm.kg) / seg.leftArm.kg) * 100) : null;
  const lrL = seg.leftLeg?.kg != null && seg.rightLeg?.kg != null ? r(((seg.rightLeg.kg - seg.leftLeg.kg) / seg.leftLeg.kg) * 100) : null;
  const tips: string[] = [];
  if (gap != null && gap >= 8) tips.push(`legs are ${gap} points behind arms (of ideal) — prioritise squats, lunges, RDLs and leg press`);
  if (legsPct != null && legsPct < 100) tips.push(`leg lean mass is below ideal (${r(legsPct)}%)`);
  if (lrL != null && Math.abs(lrL) >= 3) tips.push(`${lrL > 0 ? "left" : "right"} leg is ${Math.abs(lrL)}% lighter — add single-leg work`);
  if (lrA != null && Math.abs(lrA) >= 5) tips.push(`${lrA > 0 ? "left" : "right"} arm is ${Math.abs(lrA)}% lighter — add unilateral arm work`);
  return {
    armsPct: armsPct != null ? r(armsPct) : null,
    legsPct: legsPct != null ? r(legsPct) : null,
    trunkPct: seg.trunk?.pct ?? null,
    upperLowerGap: gap,
    leftRightArms: lrA,
    leftRightLegs: lrL,
    advice: tips.length ? tips.join("; ") : null,
  };
}

/** Weight at a target body-fat % if lean mass is kept. */
export function weightAtBodyFat(s: BodyScan, targetPct: number): number | null {
  const lm = leanMass(s);
  return lm != null && targetPct > 0 && targetPct < 70 ? r(lm / (1 - targetPct / 100)) : null;
}
