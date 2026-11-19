import Link from "next/link";
import { ArcGauge, ScoreRing, toneWord } from "@/components/score/Score";
import type { Readiness } from "@/lib/analysis/metrics";
import { cn } from "@/lib/utils";

export type TodayScoresInput = {
  readiness: Readiness | null;
  sleepScore: number | null;
  sleepHours: number | null;
  eaten: number;
  kcalTarget: number | null;
  steps: number | null;
  stepGoal: number;
  /** Body Battery when you woke (0 to 100). */
  battery: number | null;
  garminConnected: boolean;
  /** Watch data comes from an Apple Health upload (not a live sync). */
  appleHealth?: boolean;
};

const ADVICE: Record<Readiness["band"], string> = {
  push: "Good day for a hard session.",
  normal: "Train as planned.",
  easy: "Go easy today and sleep early.",
};

/** Home's top section: a row of score rings and one big "how am I today" gauge. */
export function TodayScores({ s }: { s: TodayScoresInput }) {
  const fuelPct = s.kcalTarget ? (s.eaten / s.kcalTarget) * 100 : null;
  const stepsPct = s.steps != null ? (s.steps / s.stepGoal) * 100 : null;

  const r = s.readiness;
  const heroValue = r ? r.score : fuelPct != null ? Math.min(100, Math.round(fuelPct)) : null;
  const top = r
    ? [...r.contributors].sort((x, y) => y.weight - x.weight).slice(0, 3)
    : [];

  return (
    <section className="space-y-4">
      {/* Score rings */}
      <div className="grid grid-cols-5 gap-1">
        <ScoreRing value={r?.score ?? null} label="Readiness" href="/insights" />
        <ScoreRing
          value={s.sleepScore}
          display={s.sleepScore == null && s.sleepHours != null ? `${s.sleepHours}h` : undefined}
          label="Sleep"
          href="/insights"
        />
        <ScoreRing
          value={fuelPct}
          display={fuelPct == null ? "–" : `${Math.round(fuelPct)}%`}
          label="Food"
          href="/food"
        />
        <ScoreRing
          value={stepsPct}
          display={s.steps == null ? "–" : s.steps >= 10000 ? `${Math.round(s.steps / 1000)}k` : `${(s.steps / 1000).toFixed(1)}k`}
          label="Steps"
          href={s.garminConnected || s.appleHealth ? "/insights" : "/garmin"}
        />
        <ScoreRing value={s.battery} label="Battery" href="/insights" />
      </div>

      {/* Hero */}
      <Link
        href={r ? "/insights" : "/food"}
        className="glass press relative block overflow-hidden rounded-[28px] border border-white/15 px-5 pb-5 pt-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]"
      >
        <div className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300/80">
          {r ? "Readiness" : "Today's food"}
        </div>
        <div className="relative mx-auto mt-1 flex w-[220px] justify-center">
          <ArcGauge value={heroValue ?? 0} />
          <div className="absolute inset-x-0 top-[58px] text-center">
            <div className="text-6xl font-light leading-none tabular-nums tracking-tight">
              {heroValue ?? "–"}
              {!r && heroValue != null && <span className="text-2xl">%</span>}
            </div>
            <div className="mt-1.5 text-sm font-medium text-zinc-200">
              {r ? toneWord(r.score) : heroValue == null ? "Set your plan" : `${s.eaten.toLocaleString("en-US")} kcal eaten`}
            </div>
          </div>
        </div>
        <div className="-mt-6 text-center">
          <div className="text-lg font-semibold">
            {r ? r.label : s.kcalTarget ? `of ${s.kcalTarget.toLocaleString("en-US")} kcal today` : "Set a goal to get a target"}
          </div>
          <p className="mx-auto mt-1 max-w-[30ch] text-sm leading-snug text-zinc-300/90">
            {r
              ? ADVICE[r.band]
              : s.garminConnected
                ? "Shows after your watch syncs a night of sleep."
                : s.appleHealth
                  ? "Upload a fresh Apple Health export to see last night."
                  : "Connect Garmin or import Apple Health to see your recovery here."}
          </p>
        </div>
        {top.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {top.map((c) => (
              <div key={c.key} className="rounded-2xl bg-black/25 px-2 py-2 text-center">
                <div className="text-[10px] uppercase tracking-wide text-zinc-400">{c.label}</div>
                <div
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    c.score >= 75 ? "text-teal-200" : c.score >= 50 ? "text-sky-200" : "text-amber-200",
                  )}
                >
                  {toneWord(c.score)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Link>
    </section>
  );
}
