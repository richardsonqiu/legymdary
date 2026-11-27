import Link from "next/link";
import { ScoreRing, toneWord } from "@/components/score/Score";
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
  /** Today's data synced but there was no night (watch not worn to bed). */
  noSleepLastNight?: boolean;
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
          href={s.garminConnected || s.appleHealth ? "/insights" : "/connect"}
        />
        <ScoreRing value={s.battery} label="Battery" href="/insights" />
      </div>

      {/* Readiness (or today's food) card: big number, tick bar, top factors. */}
      <Link
        href={r ? "/insights" : "/food"}
        className="glass press relative block overflow-hidden rounded-[28px] border border-zinc-800/70 px-5 pb-5 pt-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              {r ? "Readiness" : "Today's food"}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-[56px] font-semibold leading-none tracking-tight tabular-nums">{heroValue ?? "–"}</span>
              {heroValue != null && <span className="text-lg text-zinc-400">{r ? "/100" : "%"}</span>}
            </div>
          </div>
          <span className="mt-1 rounded-full bg-citron px-3 py-1 text-xs font-semibold text-carbon">
            {r ? toneWord(r.score) : heroValue == null ? "No plan" : `${s.eaten.toLocaleString("en-US")} kcal`}
          </span>
        </div>
        <TickBar value={heroValue ?? 0} />
        <div className="mt-3">
          <div className="text-base font-semibold">
            {r ? r.label : s.kcalTarget ? `of ${s.kcalTarget.toLocaleString("en-US")} kcal today` : "Set a goal to get a target"}
          </div>
          <p className="mt-0.5 text-sm leading-snug text-zinc-400">
            {r
              ? r.label === ADVICE[r.band].replace(/\.$/, "") ? null : ADVICE[r.band]
              : s.noSleepLastNight
                ? "No sleep recorded last night. Wear your watch or ring to bed for Readiness."
                : s.garminConnected
                ? "Shows after your watch or ring syncs a night of sleep."
                : s.appleHealth
                  ? "Upload a fresh Apple Health export to see last night."
                  : "Connect Garmin or Oura, or import Apple Health, to see your recovery here."}
          </p>
        </div>
        {top.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {top.map((c) => (
              <span key={c.key} className="flex items-center gap-1.5 rounded-full border border-zinc-700/80 px-3 py-1 text-xs">
                <span className={cn("h-1.5 w-1.5 rounded-full", c.score >= 75 ? "bg-teal-300" : c.score >= 50 ? "bg-zinc-400" : "bg-amber-400")} />
                <span className="text-zinc-400">{c.label}</span>
                <span className="font-semibold">{toneWord(c.score)}</span>
              </span>
            ))}
          </div>
        )}
      </Link>
    </section>
  );
}

/** 40 thin ticks, filled in Citron up to the score. */
function TickBar({ value }: { value: number }) {
  const n = 40;
  const on = Math.round((Math.max(0, Math.min(100, value)) / 100) * n);
  return (
    <div className="mt-4 flex h-7 items-end gap-[3px]" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={cn("flex-1 rounded-full", i < on ? "bg-citron" : "bg-zinc-700/70")}
          style={{ height: i % 5 === 0 ? "100%" : "62%" }}
        />
      ))}
    </div>
  );
}
