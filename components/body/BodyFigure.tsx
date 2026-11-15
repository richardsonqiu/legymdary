"use client";

import { useState } from "react";
import { Segmented } from "@/components/charts/common";
import type { Segment, SegValues } from "@/lib/body-scan";
import { cn } from "@/lib/utils";

type Kind = "lean" | "fat";

/** InBody's bands: under 90% of ideal, 90–110% normal, over 110%. */
function band(pct: number | null): "under" | "normal" | "over" | "none" {
  if (pct == null) return "none";
  return pct < 90 ? "under" : pct <= 110 ? "normal" : "over";
}
// For lean mass more is better; for fat, "over" is the warning.
const FILL: Record<Kind, Record<ReturnType<typeof band>, string>> = {
  lean: { under: "#fbbf24", normal: "#2dd4bf", over: "#38bdf8", none: "#333d55" },
  fat: { under: "#38bdf8", normal: "#2dd4bf", over: "#fb7185", none: "#333d55" },
};
const WORD = { under: "Under", normal: "Normal", over: "Over", none: "–" } as const;

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
      <div className="relative mx-auto max-w-[340px]">
        <svg viewBox="0 0 300 300" className="w-full" role="img" aria-label="Body segments">
          <defs>
            <filter id="seg-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g filter="url(#seg-glow)" stroke="rgba(10,15,28,0.6)" strokeWidth="2" strokeLinejoin="round">
            {/* head + neck */}
            <circle cx="150" cy="36" r="19" fill="#4a5570" />
            <rect x="142" y="52" width="16" height="12" rx="4" fill="#4a5570" />
            {/* trunk */}
            <path d="M116 66 Q150 58 184 66 L180 160 Q150 170 120 160 Z" fill={fill("trunk")} />
            {/* arms: person's left arm drawn on the viewer's left, like InBody */}
            <path d="M114 68 L98 72 L82 156 L96 160 L110 100 Z" fill={fill("leftArm")} />
            <path d="M186 68 L202 72 L218 156 L204 160 L190 100 Z" fill={fill("rightArm")} />
            {/* legs */}
            <path d="M121 164 L148 168 L144 286 L124 286 Z" fill={fill("leftLeg")} />
            <path d="M179 164 L152 168 L156 286 L176 286 Z" fill={fill("rightLeg")} />
          </g>
        </svg>
        <Label at="left-[0%] top-[22%]" name="Left arm" v={seg.leftArm} kind={kind} />
        <Label at="right-[0%] top-[22%] text-right" name="Right arm" v={seg.rightArm} kind={kind} />
        <Label at="left-1/2 top-[33%] -translate-x-1/2 text-center" name="Trunk" v={seg.trunk} kind={kind} dark />
        <Label at="left-[0%] top-[66%]" name="Left leg" v={seg.leftLeg} kind={kind} />
        <Label at="right-[0%] top-[66%] text-right" name="Right leg" v={seg.rightLeg} kind={kind} />
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
