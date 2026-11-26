/**
 * A tiny 2D figure animator for exercise demos. Pure and client-safe.
 *
 * Side view: the figure faces right. Angles are degrees, 0 = up,
 * 90 = forward (right), 180 = down, 270 = back (left). Hands and feet can be
 * placed on a target point (two-bone IK), so feet stay planted in a squat
 * and hands stay on the floor in a push-up.
 *
 * Front view: shoulders at (100, 60) and (140, 60); hands are placed with IK
 * and the left arm mirrors the right unless given.
 */

export type Pt = [number, number];
/** A point: absolute, or relative to the shoulder or hip. */
export type Target = { ref: "abs" | "shoulder" | "hip"; d: Pt };
export type Limb = { to: Target; bend?: 1 | -1 } | { angles: [number, number] };

export type SidePose = {
  hip: Pt;
  torso: number;
  /** Head tilt relative to the torso. */
  head?: number;
  arm: Limb;
  /** The far arm; defaults to the near one. */
  arm2?: Limb;
  leg: Limb;
  leg2?: Limb;
  foot?: number;
  foot2?: number;
};

export type FrontPose = {
  r: Target;
  l?: Target;
  bend?: 1 | -1;
  /** Sideways lean of head and shoulders (for twists). */
  shift?: number;
};

export type Segment = "torso" | "upperArm" | "forearm" | "thigh" | "shin" | "head";

export type Prop =
  | { kind: "plate"; at: Joint; d?: Pt; r?: number; behind?: boolean }
  | { kind: "dumbbell"; at: Joint; d?: Pt }
  | { kind: "handle"; at: Joint }
  | { kind: "cable"; at: Joint; to: Pt }
  | { kind: "bar"; at: Joint; w?: number }
  | { kind: "wheel"; at: Joint }
  | { kind: "pad"; at: Joint; d?: Pt }
  | { kind: "sled"; at: Joint }
  | { kind: "pivot"; at: Joint; to: Pt };

export type Joint = "hand" | "hand2" | "elbow" | "shoulder" | "hip" | "knee" | "ankle" | "toe" | "head" | "handL" | "handR";

export type SceneItem =
  | { kind: "rect"; x: number; y: number; w: number; h: number; rot?: number; cx?: number; cy?: number }
  | { kind: "line"; a: Pt; b: Pt; w?: number }
  | { kind: "circle"; c: Pt; r: number };

export type Pattern = {
  view: "side" | "front";
  poses: (SidePose | FrontPose)[];
  /** What happens moving A → B, then B → A. */
  labels: [string, string];
  props?: Prop[];
  scene?: SceneItem[];
  focus?: Segment[];
  /** Seconds for one full rep. */
  tempo?: number;
  /** Front view: hide the legs (seated or lying). */
  noLegs?: boolean;
  /** Draw no floor line (hanging, lying on a bench). */
  noFloor?: boolean;
};

export const LEN = { torso: 50, neck: 7, head: 10, upperArm: 28, forearm: 27, thigh: 40, shin: 39, foot: 13 };
export const GROUND = 185;

const rad = (a: number) => (a * Math.PI) / 180;
export const vec = (a: number, l: number): Pt => [l * Math.sin(rad(a)), -l * Math.cos(rad(a))];
const add = (p: Pt, q: Pt): Pt => [p[0] + q[0], p[1] + q[1]];

/** Two-bone IK: the middle joint and the end point reaching for `t`. */
export function ik(p: Pt, t: Pt, l1: number, l2: number, bend: 1 | -1): { mid: Pt; end: Pt } {
  let dx = t[0] - p[0];
  let dy = t[1] - p[1];
  let d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.01;
  const min = Math.abs(l1 - l2) + 0.01;
  if (d > max) {
    dx = (dx / d) * max;
    dy = (dy / d) * max;
    d = max;
  } else if (d < min) {
    dx = (dx / d) * min;
    dy = (dy / d) * min;
    d = min;
  }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const bx = p[0] + (a * dx) / d;
  const by = p[1] + (a * dy) / d;
  const mid: Pt = [bx + (bend * -dy * h) / d, by + (bend * dx * h) / d];
  return { mid, end: [p[0] + dx, p[1] + dy] };
}

export type SideFrame = {
  hip: Pt;
  shoulder: Pt;
  neck: Pt;
  head: Pt;
  elbow: Pt;
  hand: Pt;
  elbow2: Pt;
  hand2: Pt;
  knee: Pt;
  ankle: Pt;
  toe: Pt;
  knee2: Pt;
  ankle2: Pt;
  toe2: Pt;
};

function resolve(t: Target, shoulder: Pt, hip: Pt): Pt {
  const base: Pt = t.ref === "abs" ? [0, 0] : t.ref === "shoulder" ? shoulder : hip;
  return add(base, t.d);
}

function limb(from: Pt, spec: Limb, l1: number, l2: number, shoulder: Pt, hip: Pt, defBend: 1 | -1) {
  if ("angles" in spec) {
    const mid = add(from, vec(spec.angles[0], l1));
    return { mid, end: add(mid, vec(spec.angles[1], l2)) };
  }
  return ik(from, resolve(spec.to, shoulder, hip), l1, l2, spec.bend ?? defBend);
}

export function solveSide(p: SidePose): SideFrame {
  const hip = p.hip;
  const shoulder = add(hip, vec(p.torso, LEN.torso));
  const ha = p.torso + (p.head ?? 0);
  const neck = add(shoulder, vec(ha, LEN.neck));
  const head = add(shoulder, vec(ha, LEN.neck + LEN.head));
  const a1 = limb(shoulder, p.arm, LEN.upperArm, LEN.forearm, shoulder, hip, 1);
  const a2 = p.arm2 ? limb(shoulder, p.arm2, LEN.upperArm, LEN.forearm, shoulder, hip, 1) : a1;
  const l1 = limb(hip, p.leg, LEN.thigh, LEN.shin, shoulder, hip, -1);
  const l2 = p.leg2 ? limb(hip, p.leg2, LEN.thigh, LEN.shin, shoulder, hip, -1) : l1;
  return {
    hip,
    shoulder,
    neck,
    head,
    elbow: a1.mid,
    hand: a1.end,
    elbow2: a2.mid,
    hand2: a2.end,
    knee: l1.mid,
    ankle: l1.end,
    toe: add(l1.end, vec(p.foot ?? 90, LEN.foot)),
    knee2: l2.mid,
    ankle2: l2.end,
    toe2: add(l2.end, vec(p.foot2 ?? p.foot ?? 90, LEN.foot)),
  };
}

export const FRONT = { shoulderR: [140, 60] as Pt, shoulderL: [100, 60] as Pt, hipR: [131, 112] as Pt, hipL: [109, 112] as Pt };

export type FrontFrame = { shift: number; elbowR: Pt; handR: Pt; elbowL: Pt; handL: Pt };

export function solveFront(p: FrontPose): FrontFrame {
  const s = p.shift ?? 0;
  const sr: Pt = [FRONT.shoulderR[0] + s, FRONT.shoulderR[1]];
  const sl: Pt = [FRONT.shoulderL[0] + s, FRONT.shoulderL[1]];
  const tr = p.r.ref === "abs" ? p.r.d : add(sr, p.r.d);
  const lt: Target = p.l ?? { ref: p.r.ref, d: p.r.ref === "abs" ? [240 - p.r.d[0], p.r.d[1]] : [-p.r.d[0], p.r.d[1]] };
  const tl = lt.ref === "abs" ? lt.d : add(sl, lt.d);
  const bend = p.bend ?? 1;
  const r = ik(sr, tr, LEN.upperArm, LEN.forearm, (-bend) as 1 | -1);
  const l = ik(sl, tl, LEN.upperArm, LEN.forearm, bend);
  return { shift: s, elbowR: r.mid, handR: r.end, elbowL: l.mid, handL: l.end };
}

/** Linear blend of two poses with the same shape. */
export function lerpPose<T>(a: T, b: T, t: number): T {
  if (typeof a === "number" && typeof b === "number") return (a + (b - a) * t) as T;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => lerpPose(x, b[i], t)) as T;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(a)) out[k] = k in (b as object) ? lerpPose((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], t) : (a as Record<string, unknown>)[k];
    return out as T;
  }
  return a;
}

/** Where in the rep we are: pose blend 0..1 and which half. Holds briefly at each end. */
export function phase(time: number, tempo: number): { t: number; half: 0 | 1 } {
  const x = (time / tempo) % 1;
  const ease = (u: number) => 0.5 - Math.cos(Math.PI * u) / 2;
  if (x < 0.12) return { t: 0, half: 0 };
  if (x < 0.5) return { t: ease((x - 0.12) / 0.38), half: 0 };
  if (x < 0.62) return { t: 1, half: 1 };
  return { t: 1 - ease((x - 0.62) / 0.38), half: 1 };
}
