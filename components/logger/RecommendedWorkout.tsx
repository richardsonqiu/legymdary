"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowUpIcon, BoltIcon, CalendarIcon, DumbbellIcon, InfoIcon } from "@/components/icons";
import { Button, Card } from "@/components/ui";
import { setTrainingDays, startRecommendedWorkout } from "@/lib/actions";
import type { Recommendation } from "@/lib/training/program";
import { cn } from "@/lib/utils";

const fmtKg = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Today's recommended gym session, with sets, reps and weights to aim for. */
export function RecommendedWorkout({ rec }: { rec: Recommendation }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  function go() {
    setError(null);
    start(async () => {
      const r = await startRecommendedWorkout();
      if ("error" in r) setError(r.error);
      else router.refresh();
    });
  }
  function days(n: number) {
    start(async () => {
      await setTrainingDays(n);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", rec.lighter ? "bg-amber-400/15 text-amber-200" : "bg-teal-300/15 text-teal-200")}>
          <DumbbellIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Today&apos;s workout</div>
          <div className="text-xl font-semibold leading-tight">{rec.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
            <span>{rec.exercises.length} exercises</span>
            <span>about {rec.minutes} min</span>
            {rec.lighter && (
              <span className="flex items-center gap-1 text-amber-200">
                <BoltIcon className="h-3.5 w-3.5" /> lighter day
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setShowWhy((v) => !v)} aria-expanded={showWhy} aria-label="Why this workout" className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10">
          <InfoIcon className="h-4 w-4" />
        </button>
      </div>

      {showWhy && (
        <ul className="space-y-1 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-zinc-300">
          {rec.why.map((w) => (
            <li key={w}>{w}</li>
          ))}
          <li className="text-zinc-500">Weights come from your last session: hit the top of the rep range on every set and it goes up.</li>
        </ul>
      )}

      <ol className="divide-y divide-white/[0.05]">
        {rec.exercises.map((e, i) => (
          <li key={e.exerciseId} className="flex items-center gap-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs tabular-nums text-zinc-300">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{e.name}</div>
              <div className="text-xs tabular-nums text-zinc-400">
                {e.sets} × {e.reps}
                {e.weight != null && e.weight > 0 ? ` @ ${fmtKg(e.weight)} kg` : ""}
                <span className="text-zinc-600"> · rest {e.restSec >= 120 ? `${Math.round(e.restSec / 60)} min` : `${e.restSec}s`}</span>
              </div>
            </div>
            {e.progression.startsWith("+") ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200" title={e.last ? `Last: ${e.last.top}` : undefined}>
                <ArrowUpIcon className="h-3 w-3" /> {e.progression}
              </span>
            ) : e.last ? (
              <span className="shrink-0 text-[11px] text-zinc-500" title={`Last: ${e.last.top}`}>
                +1 rep
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-sky-300/10 px-2 py-0.5 text-[11px] text-sky-200">new</span>
            )}
          </li>
        ))}
      </ol>

      <Button size="lg" className="w-full" onClick={go} disabled={pending}>
        {pending ? "Starting…" : `Start ${rec.title}`}
      </Button>
      {error && <p className="text-sm text-amber-300">{error}</p>}

      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <CalendarIcon className="h-4 w-4 shrink-0" />
        <span className="shrink-0">Days a week</span>
        <div role="radiogroup" aria-label="Gym days a week" className="flex flex-1 gap-1">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={rec.days === n}
              disabled={pending}
              onClick={() => rec.days !== n && days(n)}
              className={cn(
                "press h-8 flex-1 rounded-lg text-xs font-medium tabular-nums",
                rec.days === n ? "bg-zinc-100 text-zinc-950" : "bg-white/[0.05] text-zinc-300 hover:bg-white/[0.08]",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}
