"use client";

import { useState } from "react";
import { Segmented } from "@/components/charts/common";
import type { BodyScanSegment as Segment, SegValues } from "@legymdary/shared";
import { cn } from "@/lib/utils";

type Kind = "lean" | "fat";

/** InBody's bands: under 90% of ideal, 90–110% normal, over 110%. */
function band(pct: number | null): "under" | "normal" | "over" | "none" {
  if (pct == null) return "none";
  return pct < 90 ? "under" : pct <= 110 ? "normal" : "over";
}
// For lean mass more is better; for fat, "over" is the warning.
const FILL: Record<Kind, Record<ReturnType<typeof band>, string>> = {
  lean: { under: "#fbbf24", normal: "#ded97a", over: "#38bdf8", none: "var(--color-zinc-700)" },
  fat: { under: "#38bdf8", normal: "#ded97a", over: "#fb7185", none: "var(--color-zinc-700)" },
};
const WORD = { under: "Under", normal: "Normal", over: "Over", none: "–" } as const;

/* ---- Silhouette (viewBox 200×400, centred on x = 100) ---- */
const TRUNK =
  "M88 62 C78 64 66 66 60 74 C56 80 56 90 60 100 C63 112 65 124 67 136 C68 148 66 160 66 172 " +
  "C66 184 72 194 84 198 L100 204 L116 198 C128 194 134 184 134 172 C134 160 132 148 133 136 " +
  "C135 124 137 112 140 100 C144 90 144 80 140 74 C134 66 122 64 112 62 Z";
const NECK = "M91 50 C92 58 90 62 86 64 L114 64 C110 62 108 58 109 50 Z";
const ARM_L =
  "M59 74 C50 77 45 88 45 102 C44 118 42 132 40 146 C38 160 36 174 35 186 " +
  "C34 194 32 202 33 210 C34 220 44 222 46 213 C47 205 46 197 47 189 " +
  "C49 177 52 165 54 153 C56 141 58 127 60 113 C61 105 62 97 62 90 Z";
const LEG_L =
  "M68 186 C64 206 63 230 65 252 C67 270 70 284 70 298 C70 314 67 330 69 346 " +
  "C70 358 72 368 72 376 C68 382 62 386 65 390 L91 390 C93 384 89 378 88 372 " +
  "C87 358 90 344 90 330 C90 316 88 306 90 296 C92 280 96 258 98 236 C99 220 99 208 98 200 Z";

/** Mirror a path left↔right around x = 100. */
function mirror(d: string) {
  return d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${200 - Number(x)} ${y}`);
}

/**
 * Front-facing body with each segment coloured by % of ideal, labels on the
 * sides — the same layout as the InBody app (your left arm on the left).
 */
export function BodyFigure({ lean, fat }: { lean: SegValues | null; fat: SegValues | null }) {
  const [kind, setKind] = useState<Kind>(lean ? "lean" : "fat");
  const seg = (kind === "lean" ? lean : fat) ?? {};
  const fill = (k: Segment) => FILL[kind][band(seg[k]?.pct ?? null)];

  return (
    <div className="space-y-3">
      {lean && fat && (
        <Segmented
          options={[
            { label: "Muscle (lean)", value: "lean" },
            { label: "Fat", value: "fat" },
          ]}
          value={kind}
          onChange={(v) => setKind(v as Kind)}
        />
      )}
      <div className="relative mx-auto h-[380px] max-w-[360px]">
        <svg
          viewBox="0 0 200 400"
          className="absolute left-1/2 top-0 h-full -translate-x-1/2"
          role="img"
          aria-label="Body segments coloured by % of ideal"
        >
          <defs>
            {/* Soft light from the upper left so the body reads as rounded, not flat. */}
            <linearGradient id="bf-sheen" x1="0" y1="0" x2="1" y2="0.35">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
              <stop offset="45%" stopColor="#ffffff" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
            </linearGradient>
            <radialGradient id="bf-head" cx="40%" cy="35%" r="70%">
              <stop offset="0%" stopColor="#8c98b0" />
              <stop offset="100%" stopColor="#4a5570" />
            </radialGradient>
            <filter id="bf-glow" x="-40%" y="-20%" width="180%" height="140%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#bf-glow)" stroke="#191919" strokeWidth="1.6" strokeLinejoin="round">
            {/* legs first, so the pelvis sits over their tops */}
            <path d={LEG_L} fill={fill("leftLeg")} />
            <path d={mirror(LEG_L)} fill={fill("rightLeg")} />
            {/* arms: person's left arm on the viewer's left, like the InBody app */}
            <path d={ARM_L} fill={fill("leftArm")} />
            <path d={mirror(ARM_L)} fill={fill("rightArm")} />
            <path d={TRUNK} fill={fill("trunk")} />
            <path d={NECK} fill="url(#bf-head)" />
            <ellipse cx="100" cy="34" rx="16.5" ry="20.5" fill="url(#bf-head)" />
          </g>
          {/* shading pass */}
          <g fill="url(#bf-sheen)" stroke="none" pointerEvents="none">
            <path d={LEG_L} />
            <path d={mirror(LEG_L)} />
            <path d={ARM_L} />
            <path d={mirror(ARM_L)} />
            <path d={TRUNK} />
          </g>
          {/* subtle anatomy lines */}
          <g fill="none" stroke="#191919" strokeOpacity="0.22" strokeWidth="1.2" strokeLinecap="round">
            <path d="M80 96 Q100 104 120 96" />
            <path d="M100 108 L100 170" />
            <path d="M84 150 Q100 156 116 150" />
          </g>
        </svg>
        <Label at="left-0 top-[24%]" name="Left arm" v={seg.leftArm} kind={kind} />
        <Label at="right-0 top-[24%] text-right" name="Right arm" v={seg.rightArm} kind={kind} />
        <Label at="left-1/2 top-[1%] ml-[30px]" name="Trunk" v={seg.trunk} kind={kind} />
        <Label at="left-0 top-[66%]" name="Left leg" v={seg.leftLeg} kind={kind} />
        <Label at="right-0 top-[66%] text-right" name="Right leg" v={seg.rightLeg} kind={kind} />
      </div>
      <div className="flex justify-center gap-4 text-[11px] text-zinc-400">
        {(["under", "normal", "over"] as const).map((b) => (
          <span key={b} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: FILL[kind][b] }} />
            {b === "under" ? "Under 90%" : b === "normal" ? "Normal 90–110%" : "Over 110%"}
          </span>
        ))}
      </div>
    </div>
  );
}

function Label({
  at,
  name,
  v,
  kind,
  dark,
}: {
  at: string;
  name: string;
  v: { kg: number | null; pct: number | null } | undefined;
  kind: Kind;
  dark?: boolean;
}) {
  const b = band(v?.pct ?? null);
  return (
    <div className={cn("absolute leading-tight", at)}>
      <div className={cn("text-[10px] uppercase tracking-wide", dark ? "text-zinc-950/70" : "text-zinc-400")}>{name}</div>
      <div className={cn("text-sm font-semibold tabular-nums", dark ? "text-zinc-950" : "text-zinc-50")}>
        {v?.kg != null ? `${v.kg} kg` : "–"}
      </div>
      {v?.pct != null && (
        <div className={cn("text-[11px] tabular-nums", dark ? "text-zinc-950/80" : "")} style={dark ? undefined : { color: FILL[kind][b] }}>
          {dark ? (
            <>
              {v.pct}%<br />
              {WORD[b]}
            </>
          ) : (
            `${v.pct}% · ${WORD[b]}`
          )}
        </div>
      )}
    </div>
  );
}
