"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FRONT, GROUND, lerpPose, phase, solveFront, solveSide, type FrontPose, type Pattern, type Prop, type Pt, type SceneItem, type Segment, type SidePose } from "@legymdary/shared";

const BODY = "var(--color-zinc-200)";
const FOCUS = "var(--color-teal-300)";
const KIT = "var(--color-zinc-400)";
const KIT_FILL = "var(--color-zinc-700)";
const SCENE = "var(--color-zinc-700)";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const noop = () => () => {};

/** Looping stick-figure demo of one exercise. */
export function ExerciseAnimation({
  pattern,
  playing = true,
  className,
  onPhase,
}: {
  pattern: Pattern;
  playing?: boolean;
  className?: string;
  /** Called when the rep switches half (0: A → B, 1: B → A). */
  onPhase?: (half: 0 | 1) => void;
}) {
  const reduce = useSyncExternalStore(noop, reducedMotion, () => false);
  const [time, setTime] = useState(0);
  const ref = useRef<SVGSVGElement>(null);
  const visible = useRef(true);
  const lastHalf = useRef<0 | 1>(0);
  const tempo = pattern.tempo ?? 3;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || reduce) return;
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      if (visible.current) setTime((t) => t + Math.min(dt, 0.1));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduce]);

  const { t, half } = reduce ? { t: 1, half: 0 as const } : phase(time, tempo);
  useEffect(() => {
    if (half !== lastHalf.current) {
      lastHalf.current = half;
      onPhase?.(half);
    }
  }, [half, onPhase]);

  const [a, b] = pattern.poses;
  return (
    <svg ref={ref} viewBox="0 -18 240 218" className={className} role="img" aria-label={pattern.labels.join(", then ")}>
      {!pattern.noFloor && <line x1="6" y1={GROUND + 1.5} x2="234" y2={GROUND + 1.5} stroke={SCENE} strokeWidth="2" strokeLinecap="round" />}
      {pattern.scene?.map((s, i) => <SceneShape key={i} s={s} />)}
      {reduce && <Figure pattern={pattern} pose={a} ghost />}
      <Figure pattern={pattern} pose={lerpPose(a, b, t)} />
    </svg>
  );
}

function SceneShape({ s }: { s: SceneItem }) {
  if (s.kind === "rect") return <rect x={s.x} y={s.y} width={s.w} height={s.h} rx="2.5" fill={SCENE} />;
  if (s.kind === "circle") return <circle cx={s.c[0]} cy={s.c[1]} r={s.r} fill={SCENE} />;
  return <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={SCENE} strokeWidth={s.w ?? 4} strokeLinecap="round" />;
}

function Figure({ pattern, pose, ghost }: { pattern: Pattern; pose: SidePose | FrontPose; ghost?: boolean }) {
  const focus = new Set<Segment>(pattern.focus ?? []);
  const col = (seg: Segment) => (focus.has(seg) ? FOCUS : BODY);
  const g = ghost ? { opacity: 0.22 } : undefined;

  if (pattern.view === "front") {
    const f = solveFront(pose as FrontPose);
    const s = f.shift;
    const sr: Pt = [FRONT.shoulderR[0] + s, FRONT.shoulderR[1]];
    const sl: Pt = [FRONT.shoulderL[0] + s, FRONT.shoulderL[1]];
    const joints: Record<string, Pt> = { handR: f.handR, handL: f.handL, elbow: f.elbowR, shoulder: sr };
    return (
      <g style={g}>
        {!pattern.noLegs && (
          <>
            <Seg a={FRONT.hipR} b={[134, GROUND]} w={9} c={col("thigh")} />
            <Seg a={FRONT.hipL} b={[106, GROUND]} w={9} c={col("thigh")} />
          </>
        )}
        {pattern.props?.filter((p) => p.kind === "cable").map((p, i) => <PropShape key={i} p={p} joints={joints} />)}
        <path d={`M ${sl[0]} ${sl[1]} L ${sr[0]} ${sr[1]} L ${FRONT.hipR[0]} ${FRONT.hipR[1]} L ${FRONT.hipL[0]} ${FRONT.hipL[1]} Z`} fill={col("torso")} stroke={col("torso")} strokeWidth="8" strokeLinejoin="round" />
        <Seg a={sr} b={f.elbowR} w={7} c={col("upperArm")} />
        <Seg a={f.elbowR} b={f.handR} w={6} c={col("forearm")} />
        <Seg a={sl} b={f.elbowL} w={7} c={col("upperArm")} />
        <Seg a={f.elbowL} b={f.handL} w={6} c={col("forearm")} />
        <circle cx={120 + s * 1.4} cy={36} r={11} fill={BODY} />
        <Seg a={[120 + s, 56]} b={[120 + s * 1.2, 46]} w={6} c={BODY} />
        {pattern.props?.filter((p) => p.kind !== "cable").map((p, i) => <PropShape key={i} p={p} joints={joints} />)}
      </g>
    );
  }

  const j = solveSide(pose as SidePose);
  const joints: Record<string, Pt> = { ...j };
  const isBehind = (p: Prop) => p.kind === "cable" || p.kind === "pivot" || (p.kind === "plate" && p.behind);
  const behind = pattern.props?.filter(isBehind) ?? [];
  const front = pattern.props?.filter((p) => !isBehind(p)) ?? [];
  return (
    <g style={g}>
      {behind.map((p, i) => <PropShape key={i} p={p} joints={joints} />)}
      {/* far limbs */}
      <g opacity="0.4">
        <Seg a={j.hip} b={j.knee2} w={8} c={col("thigh")} />
        <Seg a={j.knee2} b={j.ankle2} w={7} c={col("shin")} />
        <Seg a={j.ankle2} b={j.toe2} w={5} c={BODY} />
        <Seg a={j.shoulder} b={j.elbow2} w={7} c={col("upperArm")} />
        <Seg a={j.elbow2} b={j.hand2} w={6} c={col("forearm")} />
      </g>
      <Seg a={j.hip} b={j.shoulder} w={11} c={col("torso")} />
      <Seg a={j.shoulder} b={j.neck} w={6} c={BODY} />
      <Seg a={j.hip} b={j.knee} w={9} c={col("thigh")} />
      <Seg a={j.knee} b={j.ankle} w={7.5} c={col("shin")} />
      <Seg a={j.ankle} b={j.toe} w={5} c={BODY} />
      <circle cx={j.head[0]} cy={j.head[1]} r={10} fill={BODY} />
      {front.map((p, i) => <PropShape key={i} p={p} joints={joints} />)}
      <Seg a={j.shoulder} b={j.elbow} w={7} c={col("upperArm")} />
      <Seg a={j.elbow} b={j.hand} w={6} c={col("forearm")} />
    </g>
  );
}

function Seg({ a, b, w, c }: { a: Pt; b: Pt; w: number; c: string }) {
  return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={c} strokeWidth={w} strokeLinecap="round" />;
}

function PropShape({ p, joints }: { p: Prop; joints: Record<string, Pt> }) {
  const base = joints[p.at] ?? [0, 0];
  const d = "d" in p && p.d ? p.d : [0, 0];
  const [x, y] = [base[0] + d[0], base[1] + d[1]];
  switch (p.kind) {
    case "plate":
      return (
        <g>
          <circle cx={x} cy={y} r={p.r ?? 13} fill={KIT_FILL} stroke={KIT} strokeWidth="2.5" />
          <circle cx={x} cy={y} r="2.5" fill={KIT} />
        </g>
      );
    case "dumbbell":
      return (
        <g>
          <rect x={x - 9} y={y - 2} width="18" height="4" rx="2" fill={KIT} />
          <rect x={x - 10} y={y - 6} width="6" height="12" rx="2" fill={KIT_FILL} stroke={KIT} strokeWidth="1.5" />
          <rect x={x + 4} y={y - 6} width="6" height="12" rx="2" fill={KIT_FILL} stroke={KIT} strokeWidth="1.5" />
        </g>
      );
    case "handle":
      return <rect x={x - 5} y={y - 3} width="10" height="6" rx="3" fill={KIT} />;
    case "bar":
      return <line x1={x - (p.w ?? 30) / 2} y1={y} x2={x + (p.w ?? 30) / 2} y2={y} stroke={KIT} strokeWidth="3.5" strokeLinecap="round" />;
    case "wheel":
      return <circle cx={x} cy={y} r="8" fill={KIT_FILL} stroke={KIT} strokeWidth="2.5" />;
    case "pad":
      return <rect x={x - 7} y={y - 5} width="14" height="10" rx="4" fill={KIT_FILL} stroke={KIT} strokeWidth="1.5" />;
    case "sled":
      return <line x1={x - 6} y1={y - 22} x2={x + 22} y2={y + 6} stroke={KIT} strokeWidth="6" strokeLinecap="round" />;
    case "cable":
      return (
        <g>
          <line x1={x} y1={y} x2={p.to[0]} y2={p.to[1]} stroke={KIT} strokeWidth="1.5" />
          <circle cx={p.to[0]} cy={p.to[1]} r="4" fill={KIT_FILL} stroke={KIT} strokeWidth="1.5" />
        </g>
      );
    case "pivot":
      return <line x1={x} y1={y} x2={p.to[0]} y2={p.to[1]} stroke={KIT} strokeWidth="3.5" strokeLinecap="round" />;
  }
}
