"use client";

import { useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, CalendarIcon, FlameIcon, InfoIcon, LockIcon, ScaleIcon, TargetIcon } from "@/components/icons";
import { cn, formatPretty } from "@/lib/utils";

export type ChangeReason = { kind: "goal" | "source" | "burn" | "weight" | "pace" | "review" | "other"; text: string; from?: number; to?: number };
export type TargetChangeInfo = { from: number; to: number; since: string; reasons: ChangeReason[] };

const ICON = { goal: TargetIcon, source: InfoIcon, burn: FlameIcon, weight: ScaleIcon, pace: CalendarIcon, review: CalendarIcon, other: InfoIcon } as const;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** "↓ 160 kcal  1,640 → 1,480" with tap-to-show reason chips. */
export function TargetChangeNote({ change, today }: { change: TargetChangeInfo; today: string }) {
  const [open, setOpen] = useState(false);
  const diff = change.to - change.from;
  const Arrow = diff < 0 ? ArrowDownIcon : ArrowUpIcon;
  const yesterday = formatPretty(change.since) === formatPretty(new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
  return (
    <div className="mt-3 rounded-xl border border-sky-300/20 bg-sky-300/[0.06] px-3 py-2 text-xs text-sky-100">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
        <span className="flex items-center gap-1 rounded-full bg-sky-300/15 px-2 py-0.5 font-semibold tabular-nums">
          <Arrow className="h-3.5 w-3.5" />
          {fmt(Math.abs(diff))} kcal
        </span>
        <span className="tabular-nums text-sky-100/80">
          {fmt(change.from)} → <b className="text-sky-50">{fmt(change.to)}</b>
        </span>
        <span className="text-sky-100/60">{yesterday ? "vs yesterday" : `since ${formatPretty(change.since)}`}</span>
        <InfoIcon className={cn("ml-auto h-4 w-4 shrink-0 transition-opacity", open ? "opacity-100" : "opacity-60")} />
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {change.reasons.map((r) => {
            const Icon = ICON[r.kind];
            return (
              <span key={r.text} className="flex items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1 text-sky-50" title={r.text}>
                <Icon className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                {r.from != null && r.to != null && r.kind !== "pace" ? (
                  <span className="tabular-nums">
                    {r.kind === "weight" ? `${r.from.toFixed(1)} → ${r.to.toFixed(1)} kg` : `${fmt(r.from)} → ${fmt(r.to)} kcal burn`}
                  </span>
                ) : (
                  <span>{r.text}</span>
                )}
              </span>
            );
          })}
          <span className="flex items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1 text-sky-100/70">
            <LockIcon className="h-3.5 w-3.5" /> Past days stay locked
          </span>
        </div>
      )}
    </div>
  );
}
