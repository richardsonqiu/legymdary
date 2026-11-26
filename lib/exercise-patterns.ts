/**
 * Keyframes for each movement pattern: pose A (start) and pose B (the other
 * end of the rep). See lib/exercise-motion.ts for the coordinate system.
 */
import type { FrontPose, Limb, Pattern, SidePose, Target } from "@/lib/exercise-motion";

const A = (x: number, y: number): Target => ({ ref: "abs", d: [x, y] });
const S = (x: number, y: number): Target => ({ ref: "shoulder", d: [x, y] });
const H = (x: number, y: number): Target => ({ ref: "hip", d: [x, y] });
const to = (t: Target, bend?: 1 | -1): Limb => ({ to: t, bend });
const ang = (a: number, b: number): Limb => ({ angles: [a, b] });

const FEET = to(A(118, 185));
const STAND: SidePose = { hip: [118, 106], torso: 0, arm: ang(180, 180), leg: FEET };
const side = (p: Partial<SidePose>): SidePose => ({ ...STAND, ...p });

// Scenery
const flatBench = [
  { kind: "rect" as const, x: 30, y: 134, w: 92, h: 7 },
  { kind: "line" as const, a: [44, 141] as [number, number], b: [44, 185] as [number, number], w: 4 },
  { kind: "line" as const, a: [108, 141] as [number, number], b: [108, 185] as [number, number], w: 4 },
];
const seat = (x: number, y: number) => [
  { kind: "rect" as const, x: x - 24, y, w: 44, h: 7 },
  { kind: "line" as const, a: [x - 2, y + 7] as [number, number], b: [x - 2, 185] as [number, number], w: 4 },
];
const backrest = (x: number, y: number) => ({ kind: "line" as const, a: [x, y] as [number, number], b: [x - 4, y - 58] as [number, number], w: 6 });
const stack = (x: number) => [
  { kind: "rect" as const, x: x - 4, y: 10, w: 8, h: 175 },
  { kind: "rect" as const, x: x - 9, y: 150, w: 18, h: 30 },
];

export const PATTERNS = {
  squat: {
    view: "side",
    labels: ["Sit down and back", "Drive up through your feet"],
    poses: [side({ arm: to(S(-5, 4), -1) }), side({ hip: [90, 150], torso: 40, arm: to(S(-5, 4), -1) })],
    props: [{ kind: "plate", at: "shoulder", d: [-7, -2], behind: true }],
    focus: ["thigh", "torso"],
  },
  frontSquat: {
    view: "side",
    labels: ["Sit straight down", "Drive up, elbows high"],
    poses: [side({ arm: to(S(9, -2), 1) }), side({ hip: [94, 150], torso: 24, arm: to(S(9, -2), 1) })],
    props: [{ kind: "plate", at: "shoulder", d: [9, -2], behind: true }],
    focus: ["thigh"],
  },
  legPress: {
    view: "side",
    labels: ["Lower the sled", "Push it away"],
    poses: [
      { hip: [92, 152], torso: 300, arm: to(A(98, 160)), leg: to(A(128, 116)), foot: 30 },
      { hip: [92, 152], torso: 300, arm: to(A(98, 160)), leg: to(A(156, 92)), foot: 30 },
    ],
    scene: [
      { kind: "line", a: [96, 162], b: [40, 128], w: 6 },
      { kind: "line", a: [70, 166], b: [120, 166], w: 6 },
      { kind: "line", a: [120, 150], b: [200, 70], w: 3 },
    ],
    props: [{ kind: "sled", at: "ankle" }],
    focus: ["thigh"],
    noFloor: false,
  },
  legExtension: {
    view: "side",
    labels: ["Straighten your legs", "Lower with control"],
    poses: [
      { hip: [98, 142], torso: 355, arm: to(A(104, 146)), leg: ang(90, 180) },
      { hip: [98, 142], torso: 355, arm: to(A(104, 146)), leg: ang(90, 85) },
    ],
    scene: [...seat(98, 146), backrest(76, 146)],
    props: [{ kind: "pad", at: "ankle", d: [0, -2] }],
    focus: ["thigh"],
  },
  legCurl: {
    view: "side",
    noFloor: false,
    labels: ["Curl heels to glutes", "Lower slowly"],
    poses: [
      { hip: [100, 128], torso: 90, head: -10, arm: to(A(170, 140)), leg: ang(270, 270), foot: 0 },
      { hip: [100, 128], torso: 90, head: -10, arm: to(A(170, 140)), leg: ang(270, 15), foot: 90 },
    ],
    scene: [
      { kind: "rect", x: 30, y: 134, w: 150, h: 7 },
      { kind: "line", a: [50, 141], b: [50, 185], w: 4 },
      { kind: "line", a: [160, 141], b: [160, 185], w: 4 },
    ],
    props: [{ kind: "pad", at: "ankle" }],
    focus: ["thigh"],
  },
  deadlift: {
    view: "side",
    labels: ["Push the floor away", "Hinge back down"],
    poses: [side({ hip: [88, 132], torso: 66, arm: to(S(-2, 54)) }), side({ arm: to(S(2, 54)) })],
    props: [{ kind: "plate", at: "hand" }],
    focus: ["torso", "thigh"],
  },
  rdl: {
    view: "side",
    labels: ["Push hips back", "Squeeze glutes to stand"],
    poses: [side({ arm: to(S(2, 54)) }), side({ hip: [98, 112], torso: 72, arm: to(S(-6, 53)) })],
    props: [{ kind: "plate", at: "hand" }],
    focus: ["thigh", "torso"],
  },
  hipThrust: {
    view: "side",
    labels: ["Drive hips up", "Lower under control"],
    poses: [
      { hip: [96, 172], torso: 300, arm: to(H(2, -6)), leg: to(A(142, 185)) },
      { hip: [102, 142], torso: 272, arm: to(H(2, -6)), leg: to(A(142, 185)) },
    ],
    scene: [{ kind: "rect", x: 18, y: 146, w: 40, h: 39 }],
    props: [{ kind: "plate", at: "hip", d: [2, -12] }],
    focus: ["thigh"],
  },
  calfRaise: {
    view: "side",
    labels: ["Rise onto your toes", "Lower heels slowly"],
    poses: [side({ arm: to(S(0, 54)) }), side({ hip: [118, 96], leg: to(A(118, 175)), foot: 138, arm: to(S(0, 54)) })],
    props: [{ kind: "dumbbell", at: "hand" }],
    focus: ["shin"],
  },
  seatedCalf: {
    view: "side",
    labels: ["Lift your heels", "Lower and stretch"],
    poses: [
      { hip: [96, 146], torso: 0, arm: to(A(132, 140)), leg: to(A(136, 185)) },
      { hip: [96, 142], torso: 0, arm: to(A(132, 136)), leg: to(A(136, 176)), foot: 138 },
    ],
    scene: seat(96, 150),
    props: [{ kind: "pad", at: "knee", d: [0, -6] }],
    focus: ["shin"],
  },
  lunge: {
    view: "side",
    labels: ["Step and lower", "Push back up"],
    poses: [
      side({ arm: to(S(0, 54)) }),
      { hip: [112, 142], torso: 0, arm: to(S(0, 54)), leg: to(A(146, 185)), leg2: to(A(72, 184)), foot2: 150 },
    ],
    props: [{ kind: "dumbbell", at: "hand" }],
    focus: ["thigh"],
  },
  splitSquat: {
    view: "side",
    labels: ["Lower straight down", "Drive up with the front leg"],
    poses: [
      { hip: [108, 112], torso: 8, arm: to(S(0, 54)), leg: to(A(132, 185)), leg2: to(A(64, 146)), foot2: 250 },
      { hip: [102, 146], torso: 12, arm: to(S(0, 54)), leg: to(A(132, 185)), leg2: to(A(64, 146)), foot2: 250 },
    ],
    scene: [{ kind: "rect", x: 34, y: 150, w: 40, h: 35 }],
    props: [{ kind: "dumbbell", at: "hand" }],
    focus: ["thigh"],
  },
  bench: {
    view: "side",
    noFloor: false,
    labels: ["Lower to mid chest", "Press up"],
    poses: [
      { hip: [112, 128], torso: 270, arm: to(A(64, 76), 1), leg: to(A(150, 185)) },
      { hip: [112, 128], torso: 270, arm: to(A(70, 115), 1), leg: to(A(150, 185)) },
    ],
    scene: flatBench,
    props: [{ kind: "plate", at: "hand" }],
    focus: ["upperArm", "torso"],
  },
  inclineBench: {
    view: "side",
    labels: ["Lower to upper chest", "Press up"],
    poses: [
      { hip: [112, 140], torso: 302, arm: to(A(70, 64), 1), leg: to(A(150, 185)) },
      { hip: [112, 140], torso: 302, arm: to(A(80, 102), 1), leg: to(A(150, 185)) },
    ],
    scene: [{ kind: "line", a: [118, 148], b: [52, 106], w: 7 }, { kind: "rect", x: 96, y: 146, w: 36, h: 7 }, { kind: "line", a: [112, 153], b: [112, 185], w: 4 }],
    props: [{ kind: "plate", at: "hand" }],
    focus: ["upperArm", "torso"],
  },
  dbBench: {
    view: "side",
    labels: ["Lower to chest level", "Press up"],
    poses: [
      { hip: [112, 128], torso: 270, arm: to(A(62, 76), 1), leg: to(A(150, 185)) },
      { hip: [112, 128], torso: 270, arm: to(A(64, 118), 1), leg: to(A(150, 185)) },
    ],
    scene: flatBench,
    props: [{ kind: "dumbbell", at: "hand" }],
    focus: ["upperArm", "torso"],
  },
  inclineDb: {
    view: "side",
    labels: ["Lower to upper chest", "Press up"],
    poses: [
      { hip: [112, 140], torso: 302, arm: to(A(70, 64), 1), leg: to(A(150, 185)) },
      { hip: [112, 140], torso: 302, arm: to(A(74, 106), 1), leg: to(A(150, 185)) },
    ],
    scene: [{ kind: "line", a: [118, 148], b: [52, 106], w: 7 }, { kind: "rect", x: 96, y: 146, w: 36, h: 7 }, { kind: "line", a: [112, 153], b: [112, 185], w: 4 }],
    props: [{ kind: "dumbbell", at: "hand" }],
    focus: ["upperArm", "torso"],
  },
  skullCrusher: {
    view: "side",
    labels: ["Bend elbows, lower to forehead", "Straighten your arms"],
    poses: [
      { hip: [112, 128], torso: 270, arm: to(A(70, 76), 1), leg: to(A(150, 185)) },
      { hip: [112, 128], torso: 270, arm: to(A(44, 106), 1), leg: to(A(150, 185)) },
    ],
    scene: flatBench,
    props: [{ kind: "plate", at: "hand", r: 9 }],
    focus: ["forearm"],
  },
  chestPress: {
    view: "side",
    labels: ["Push handles forward", "Return slowly"],
    poses: [
      { hip: [96, 142], torso: 355, arm: to(S(4, 14), 1), leg: ang(90, 180) },
      { hip: [96, 142], torso: 355, arm: to(S(52, 12), 1), leg: ang(90, 180) },
    ],
    scene: [...seat(96, 146), backrest(78, 146)],
    props: [{ kind: "handle", at: "hand" }],
    focus: ["upperArm", "torso"],
  },
  pushUp: {
    view: "side",
    labels: ["Lower your chest", "Push the floor away"],
    poses: [
      { hip: [133, 150], torso: 68, arm: to(A(181, 185), 1), leg: to(A(60, 180), 1), foot: 150 },
      { hip: [139, 172], torso: 84, arm: to(A(181, 185), 1), leg: to(A(60, 180), 1), foot: 150 },
    ],
    focus: ["upperArm", "torso"],
  },
  dip: {
    view: "side",
    noFloor: true,
    labels: ["Lower until elbows bend 90°", "Press back up"],
    poses: [
      { hip: [120, 106], torso: 10, arm: to(A(130, 110), 1), leg: ang(185, 235) },
      { hip: [118, 141], torso: 14, arm: to(A(130, 110), 1), leg: ang(185, 235) },
    ],
    scene: [{ kind: "line", a: [112, 113], b: [178, 113], w: 5 }, { kind: "line", a: [170, 113], b: [170, 185], w: 5 }],
    focus: ["upperArm", "forearm"],
  },
  pullUp: {
    view: "side",
    noFloor: true,
    labels: ["Pull chest to the bar", "Lower all the way"],
    poses: [
      { hip: [118, 138], torso: 2, arm: to(A(124, 32), 1), leg: ang(180, 200) },
      { hip: [110, 106], torso: 8, arm: to(A(124, 32), 1), leg: ang(178, 205) },
    ],
    scene: [{ kind: "line", a: [60, 30], b: [200, 30], w: 5 }],
    focus: ["upperArm", "torso"],
  },
  legRaise: {
    view: "side",
    noFloor: true,
    labels: ["Raise your legs", "Lower slowly, no swing"],
    poses: [
      { hip: [118, 138], torso: 2, arm: to(A(124, 32), 1), leg: ang(180, 180) },
      { hip: [114, 134], torso: 352, arm: to(A(124, 32), 1), leg: ang(88, 92) },
    ],
    scene: [{ kind: "line", a: [60, 30], b: [200, 30], w: 5 }],
    focus: ["torso", "thigh"],
  },
  pulldown: {
    view: "side",
    labels: ["Pull the bar to your chest", "Let it rise slowly"],
    poses: [
      { hip: [98, 152], torso: 350, arm: to(A(100, 40), 1), leg: ang(90, 180) },
      { hip: [98, 152], torso: 345, arm: to(A(106, 100), 1), leg: ang(90, 180) },
    ],
    scene: [...seat(98, 156), ...stack(150), { kind: "rect", x: 132, y: 140, w: 8, h: 10 }],
    props: [{ kind: "cable", at: "hand", to: [150, 18] }, { kind: "bar", at: "hand", w: 30 }],
    focus: ["upperArm", "torso"],
  },
  cableRow: {
    view: "side",
    labels: ["Row to your belly", "Reach forward slowly"],
    poses: [
      { hip: [80, 165], torso: 18, arm: to(A(150, 140), 1), leg: to(A(150, 166)), foot: 20 },
      { hip: [80, 165], torso: 352, arm: to(A(102, 138), 1), leg: to(A(150, 166)), foot: 20 },
    ],
    scene: [{ kind: "rect", x: 56, y: 170, w: 44, h: 15 }, ...stack(190), { kind: "rect", x: 150, y: 150, w: 6, h: 35 }],
    props: [{ kind: "cable", at: "hand", to: [190, 150] }, { kind: "handle", at: "hand" }],
    focus: ["upperArm", "torso"],
  },
  row: {
    view: "side",
    labels: ["Row to your lower ribs", "Lower with control"],
    poses: [side({ hip: [96, 128], torso: 70, arm: to(S(-2, 54)) }), side({ hip: [96, 128], torso: 70, arm: to(A(120, 132), 1) })],
    props: [{ kind: "plate", at: "hand" }],
    focus: ["upperArm", "torso"],
  },
  pendlay: {
    view: "side",
    labels: ["Explode up to your chest", "Set it back on the floor"],
    poses: [side({ hip: [92, 136], torso: 84, arm: to(A(140, 172)) }), side({ hip: [92, 136], torso: 84, arm: to(A(122, 140), 1) })],
    props: [{ kind: "plate", at: "hand" }],
    focus: ["upperArm", "torso"],
  },
  tbarRow: {
    view: "side",
    labels: ["Row to your chest", "Lower with control"],
    poses: [side({ hip: [96, 128], torso: 62, arm: to(S(0, 54)) }), side({ hip: [96, 128], torso: 62, arm: to(A(126, 126), 1) })],
    props: [{ kind: "pivot", at: "hand", to: [34, 184] }, { kind: "plate", at: "hand", d: [-14, 4] }],
    focus: ["upperArm", "torso"],
  },
  dbRow: {
    view: "side",
    labels: ["Pull the dumbbell to your hip", "Lower all the way"],
    poses: [
      { hip: [84, 104], torso: 84, arm: to(S(0, 50)), arm2: to(A(150, 144)), leg: to(A(100, 185)), leg2: ang(178, 270), foot2: 270 },
      { hip: [84, 104], torso: 84, arm: to(A(112, 100), 1), arm2: to(A(150, 144)), leg: to(A(100, 185)), leg2: ang(178, 270), foot2: 270 },
    ],
    scene: [{ kind: "rect", x: 60, y: 146, w: 104, h: 6 }, { kind: "line", a: [150, 152], b: [150, 185], w: 4 }],
    props: [{ kind: "dumbbell", at: "hand" }],
    focus: ["upperArm", "torso"],
  },
  facePull: {
    view: "side",
    labels: ["Pull rope to your face", "Arms forward slowly"],
    poses: [side({ torso: 352, arm: to(A(168, 64)) }), side({ torso: 352, arm: to(A(122, 50), -1) })],
    scene: stack(210),
    props: [{ kind: "cable", at: "hand", to: [210, 62] }, { kind: "handle", at: "hand" }],
    focus: ["upperArm"],
  },
  ohp: {
    view: "side",
    labels: ["Press straight up", "Lower to your collarbone"],
    poses: [side({ arm: to(S(9, -2), 1) }), side({ arm: to(S(2, -54)) })],
    props: [{ kind: "plate", at: "hand" }],
    focus: ["upperArm"],
  },
  seatedPress: {
    view: "side",
    labels: ["Press overhead", "Lower to ear level"],
    poses: [
      { hip: [100, 148], torso: 356, arm: to(S(6, -4), 1), leg: ang(90, 180) },
      { hip: [100, 148], torso: 356, arm: to(S(2, -54)), leg: ang(90, 180) },
    ],
    scene: [...seat(100, 152), backrest(84, 152)],
    props: [{ kind: "dumbbell", at: "hand" }],
    focus: ["upperArm"],
  },
  machinePress: {
    view: "side",
    labels: ["Press the handles up", "Lower slowly"],
    poses: [
      { hip: [100, 148], torso: 356, arm: to(S(6, -4), 1), leg: ang(90, 180) },
      { hip: [100, 148], torso: 356, arm: to(S(2, -54)), leg: ang(90, 180) },
    ],
    scene: [...seat(100, 152), backrest(84, 152)],
    props: [{ kind: "handle", at: "hand" }],
    focus: ["upperArm"],
  },
  frontRaise: {
    view: "side",
    labels: ["Raise to shoulder height", "Lower slowly"],
    poses: [side({ arm: to(S(4, 54)) }), side({ arm: to(S(54, 0)) })],
    props: [{ kind: "dumbbell", at: "hand" }],
    focus: ["upperArm"],
  },
  curl: {
    view: "side",
    labels: ["Curl up, elbows still", "Lower all the way"],
    poses: [side({ arm: ang(180, 180) }), side({ arm: ang(182, 25) })],
    props: [{ kind: "dumbbell", at: "hand" }],
    focus: ["forearm"],
  },
  barbellCurl: {
    view: "side",
    labels: ["Curl up, elbows still", "Lower all the way"],
    poses: [side({ arm: ang(180, 180) }), side({ arm: ang(182, 25) })],
    props: [{ kind: "plate", at: "hand", r: 11 }],
    focus: ["forearm"],
  },
  cableCurl: {
    view: "side",
    labels: ["Curl up, elbows still", "Lower all the way"],
    poses: [side({ arm: ang(178, 160) }), side({ arm: ang(182, 25) })],
    scene: stack(200),
    props: [{ kind: "cable", at: "hand", to: [200, 176] }, { kind: "handle", at: "hand" }],
    focus: ["forearm"],
  },
  preacher: {
    view: "side",
    labels: ["Curl up", "Lower until arms are nearly straight"],
    poses: [
      { hip: [96, 150], torso: 8, arm: ang(145, 140), leg: ang(90, 180) },
      { hip: [96, 150], torso: 8, arm: ang(145, 20), leg: ang(90, 180) },
    ],
    scene: [...seat(96, 154), { kind: "line", a: [100, 112], b: [124, 140], w: 7 }, { kind: "line", a: [120, 140], b: [120, 185], w: 4 }],
    props: [{ kind: "plate", at: "hand", r: 11 }],
    focus: ["forearm"],
  },
  pushdown: {
    view: "side",
    labels: ["Push down until straight", "Let it rise to chest height"],
    poses: [side({ torso: 8, arm: ang(180, 70) }), side({ torso: 8, arm: ang(180, 178) })],
    scene: stack(176),
    props: [{ kind: "cable", at: "hand", to: [176, 18] }, { kind: "handle", at: "hand" }],
    focus: ["forearm"],
  },
  overheadExt: {
    view: "side",
    labels: ["Straighten your arms", "Bend behind your head"],
    poses: [
      { hip: [124, 110], torso: 22, arm: ang(25, 200), leg: to(A(148, 185)), leg2: to(A(92, 185)) },
      { hip: [124, 110], torso: 22, arm: ang(25, 30), leg: to(A(148, 185)), leg2: to(A(92, 185)) },
    ],
    scene: stack(30),
    props: [{ kind: "cable", at: "hand", to: [30, 90] }, { kind: "handle", at: "hand" }],
    focus: ["forearm"],
  },
  plank: {
    view: "side",
    tempo: 4,
    labels: ["Hold a straight line", "Breathe, keep hips level"],
    poses: [
      { hip: [138, 163], torso: 80, arm: to(A(212, 183), -1), leg: to(A(60, 180), 1), foot: 150 },
      { hip: [138, 162], torso: 80, arm: to(A(212, 183), -1), leg: to(A(60, 180), 1), foot: 150 },
    ],
    focus: ["torso"],
  },
  cableCrunch: {
    view: "side",
    labels: ["Curl down, ribs to hips", "Rise slowly"],
    poses: [
      { hip: [110, 142], torso: 12, arm: to(S(8, -10), 1), leg: ang(180, 272) },
      { hip: [114, 142], torso: 110, head: 20, arm: to(S(8, -10), 1), leg: ang(184, 272) },
    ],
    scene: stack(190),
    props: [{ kind: "cable", at: "hand", to: [190, 20] }],
    focus: ["torso"],
  },
  abWheel: {
    view: "side",
    labels: ["Roll out slowly", "Pull back with your abs"],
    poses: [
      { hip: [112, 142], torso: 42, arm: to(A(152, 177)), leg: ang(180, 272) },
      { hip: [143, 156], torso: 84, arm: to(A(232, 177)), leg: ang(230, 270) },
    ],
    props: [{ kind: "wheel", at: "hand" }],
    focus: ["torso"],
  },
  // ---- Front view ----
  lateralRaise: {
    view: "front",
    labels: ["Raise out to shoulder height", "Lower slowly"],
    poses: [{ r: S(6, 54) } as FrontPose, { r: S(52, 6) } as FrontPose],
    props: [{ kind: "dumbbell", at: "handR" }, { kind: "dumbbell", at: "handL" }],
    focus: ["upperArm"],
  },
  cableLateral: {
    view: "front",
    labels: ["Raise out to the side", "Lower across your body"],
    poses: [{ r: S(-12, 50), l: S(-2, 54) } as FrontPose, { r: S(52, 4), l: S(-2, 54) } as FrontPose],
    scene: stack(22),
    props: [{ kind: "cable", at: "handR", to: [22, 176] }, { kind: "handle", at: "handR" }],
    focus: ["upperArm"],
  },
  fly: {
    view: "front",
    noLegs: true,
    labels: ["Bring hands together over chest", "Open wide, slight elbow bend"],
    poses: [{ r: S(52, 8), bend: -1 } as FrontPose, { r: A(126, 74), bend: -1 } as FrontPose],
    props: [{ kind: "dumbbell", at: "handR" }, { kind: "dumbbell", at: "handL" }],
    focus: ["upperArm"],
  },
  crossover: {
    view: "front",
    labels: ["Hug the cables together", "Open wide slowly"],
    poses: [{ r: S(48, -30), bend: -1 } as FrontPose, { r: A(126, 104), bend: -1 } as FrontPose],
    scene: [...stack(226), ...stack(14)],
    props: [{ kind: "cable", at: "handR", to: [226, 14] }, { kind: "cable", at: "handL", to: [14, 14] }, { kind: "handle", at: "handR" }, { kind: "handle", at: "handL" }],
    focus: ["upperArm"],
  },
  pecDeck: {
    view: "front",
    noLegs: true,
    labels: ["Squeeze the pads together", "Open slowly"],
    poses: [{ r: S(40, -24), bend: 1 } as FrontPose, { r: A(128, 34), bend: 1 } as FrontPose],
    props: [{ kind: "pad", at: "handR" }, { kind: "pad", at: "handL" }],
    focus: ["upperArm"],
  },
  rearFly: {
    view: "front",
    labels: ["Bent over, open arms wide", "Lower slowly"],
    poses: [{ r: S(-10, 52) } as FrontPose, { r: S(50, 10) } as FrontPose],
    props: [{ kind: "dumbbell", at: "handR" }, { kind: "dumbbell", at: "handL" }],
    focus: ["upperArm"],
  },
  twist: {
    view: "front",
    noLegs: true,
    labels: ["Rotate to one side", "Rotate to the other"],
    poses: [
      { r: A(98, 104), l: A(90, 104), shift: -8 } as FrontPose,
      { r: A(150, 104), l: A(142, 104), shift: 8 } as FrontPose,
    ],
    props: [{ kind: "plate", at: "handR", d: [-4, 0], r: 8 }],
    focus: ["torso"],
  },
} satisfies Record<string, Pattern>;

export type PatternKey = keyof typeof PATTERNS;
