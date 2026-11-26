"use client";

import { formatPretty, formatShort } from "@legymdary/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, CalendarIcon, CheckIcon, FlameIcon, ForkIcon, InfoIcon, LockIcon, ScaleIcon } from "@/components/icons";
import { Button, Card } from "@/components/ui";
import type { TargetReview } from "@/db/schema";
import { decideReview } from "@/lib/actions";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString("en-US");

function Chip({ icon, children, title }: { icon: React.ReactNode; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 text-xs tabular-nums text-zinc-200">
      {icon}
      {children}
    </span>
  );
}

const DECISION: Record<string, { label: string; tone: string }> = {
  pending: { label: "waiting", tone: "text-sky-300" },
  updated: { label: "updated", tone: "text-teal-300" },
  auto: { label: "adjusted", tone: "text-teal-300" },
  kept: { label: "kept", tone: "text-zinc-300" },
  no_change: { label: "on pace", tone: "text-emerald-300" },
  not_enough_data: { label: "not enough logs", tone: "text-zinc-500" },
  too_early: { label: "too early", tone: "text-zinc-500" },
};

/** This period's target review (Keep / Update when pending) and the last few. */
export function ReviewCard({ review, history, nextReview }: { review: TargetReview | null; history: TargetReview[]; nextReview: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const r = review;
  const title = r?.cadence === "monthly" ? "Monthly review" : "Weekly review";
  const diff = r?.suggested != null ? r.suggested - r.current : 0;

  function decide(choice: "updated" | "kept") {
    if (!r) return;
    start(async () => {
      setError(null);
      const res = await decideReview(r.id, choice);
      if ("error" in res) setError(res.error);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-300/15 text-sky-200">
          <CalendarIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold">{title}</div>
          <div className="text-[11px] text-zinc-500">{r ? `${formatPretty(r.periodStart)}` : `Next on ${formatPretty(nextReview)}`}</div>
        </div>
        {r && <span className={cn("ml-auto text-xs font-medium", DECISION[r.decision]?.tone)}>{DECISION[r.decision]?.label}</span>}
      </div>

      {r && (
        <div className="flex flex-wrap gap-1.5">
          {r.trendKgWeek != null && (
            <Chip icon={<ScaleIcon className="h-3.5 w-3.5 text-violet-300" />} title="Weight trend line">
              {r.trendKgWeek > 0 ? "+" : ""}
              {r.trendKgWeek} kg/wk
            </Chip>
          )}
          <Chip icon={<ForkIcon className="h-3.5 w-3.5 text-sky-300" />} title="Fully logged days">
            {r.loggedDays}/{r.cadence === "monthly" ? 28 : 7} days
          </Chip>
          {r.avgIntake != null && (
            <Chip icon={<ForkIcon className="h-3.5 w-3.5 text-sky-300" />} title="Average eaten on logged days">
              {fmt(r.avgIntake)} eaten
            </Chip>
          )}
          {r.avgBurn != null && (
            <Chip icon={<FlameIcon className="h-3.5 w-3.5 text-orange-300" />} title="Average burn">
              {fmt(r.avgBurn)} burned
            </Chip>
          )}
        </div>
      )}

      {r?.decision === "pending" && r.suggested != null && (
        <>
          <div className="flex items-center justify-center gap-3 rounded-2xl bg-white/[0.04] py-3">
            <span className="text-xl font-semibold tabular-nums text-zinc-400">{fmt(r.current)}</span>
            <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", diff < 0 ? "bg-sky-300/15 text-sky-200" : "bg-violet-300/15 text-violet-200")}>
              {diff < 0 ? <ArrowDownIcon className="h-3.5 w-3.5" /> : <ArrowUpIcon className="h-3.5 w-3.5" />}
              {fmt(diff)}
            </span>
            <span className="text-2xl font-bold tabular-nums">{fmt(r.suggested)}</span>
            <span className="text-xs text-zinc-500">kcal</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => decide("kept")}>
              <LockIcon className="h-4 w-4" /> Keep {fmt(r.current)}
            </Button>
            <Button disabled={pending} onClick={() => decide("updated")}>
              <CheckIcon className="h-4 w-4" /> Use {fmt(r.suggested)}
            </Button>
          </div>
        </>
      )}
      {r && r.decision !== "pending" && (
        <p className="flex items-center gap-2 text-sm text-zinc-300">
          {r.decision === "not_enough_data" || r.decision === "too_early" ? <InfoIcon className="h-4 w-4 text-zinc-500" /> : <CheckIcon className="h-4 w-4 text-emerald-300" />}
          {r.decision === "updated" && <>Target set to {fmt(r.applied ?? r.current)} kcal</>}
          {r.decision === "auto" && (
            <>
              {fmt(r.current)} → {fmt(r.applied ?? r.current)} kcal{r.suggested != null && r.applied !== r.suggested ? " (max 100 a step)" : ""}
            </>
          )}
          {r.decision === "kept" && <>Kept {fmt(r.current)} kcal</>}
          {r.decision === "no_change" && <>On pace, {fmt(r.current)} kcal stays</>}
          {r.decision === "not_enough_data" && <>Log {r.cadence === "monthly" ? "14" : "4"}+ full days for a review</>}
          {r.decision === "too_early" && <>First review 2 weeks after a goal change</>}
        </p>
      )}
      {error && <p className="text-sm text-amber-300">{error}</p>}

      {history.filter((h) => h.id !== r?.id).length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-zinc-500 hover:text-zinc-300">Past reviews</summary>
          <ul className="mt-2 divide-y divide-white/[0.05] text-xs">
            {history
              .filter((h) => h.id !== r?.id)
              .map((h) => (
                <li key={h.id} className="flex items-center gap-2 py-1.5 tabular-nums">
                  <span className="w-14 text-zinc-500">{formatShort(h.periodStart)}</span>
                  <span className={cn("w-24", DECISION[h.decision]?.tone)}>{DECISION[h.decision]?.label}</span>
                  <span className="text-zinc-300">
                    {fmt(h.current)}
                    {h.applied != null && h.applied !== h.current ? ` → ${fmt(h.applied)}` : ""}
                  </span>
                  {h.trendKgWeek != null && (
                    <span className="ml-auto text-zinc-500">
                      {h.trendKgWeek > 0 ? "+" : ""}
                      {h.trendKgWeek} kg/wk
                    </span>
                  )}
                </li>
              ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
