import Link from "next/link";
import { ArcGauge, ScoreRing, toneFor, toneWord } from "@/components/score/Score";
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
  weekActive: number;
  weekTarget: number;
  garminConnected: boolean;
};

const ADVICE: Record<Readiness["band"], string> = {
  push: "A good day for a hard session or a PR attempt.",
  normal: "Train as planned — keep the intensity steady.",
  easy: "Go light today: a walk, mobility or rest. Sleep early.",
};
const SKY: Record<string, [string, string]> = {
  great: ["rgba(94,234,212,0.38)", "rgba(129,140,248,0.32)"],
  good: ["rgba(125,211,252,0.32)", "rgba(165,180,252,0.30)"],
  low: ["rgba(252,211,77,0.30)", "rgba(244,114,182,0.22)"],
  none: ["rgba(125,211,252,0.18)", "rgba(129,140,248,0.18)"],
};

/** Home's top section: a row of score rings and one big "how am I today" gauge. */
export function TodayScores({ s }: { s: TodayScoresInput }) {
  const fuelPct = s.kcalTarget ? (s.eaten / s.kcalTarget) * 100 : null;
  const stepsPct = s.steps != null ? (s.steps / s.stepGoal) * 100 : null;
  const weekPct = (Math.min(s.weekActive, s.weekTarget) / s.weekTarget) * 100;

  const r = s.readiness;
  const heroValue = r ? r.score : fuelPct != null ? Math.min(100, Math.round(fuelPct)) : null;
  const tone = toneFor(heroValue);
  const [a, b] = SKY[tone];
  const top = r
    ? [...r.contributors].sort((x, y) => y.weight - x.weight).slice(0, 3)
    : [];

  return (
    <section className="space-y-4">
      {/* Score rings */}
      <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
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
          href={s.garminConnected ? "/insights" : "/garmin"}
        />
        <ScoreRing value={weekPct} display={`${s.weekActive}/${s.weekTarget}`} label="Week" href="/history" />
      </div>

      {/* Hero */}
      <Link
        href={r ? "/insights" : "/food"}
        className="hero-sky press relative block overflow-hidden rounded-[28px] border border-white/10 px-5 pb-5 pt-6"
        style={{ ["--sky-a" as string]: a, ["--sky-b" as string]: b }}
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
            {r ? r.label : s.kcalTarget ? `of ${s.kcalTarget.toLocaleString("en-US")} kcal today` : "Set a goal to get targets"}
          </div>
          <p className="mx-auto mt-1 max-w-[30ch] text-sm leading-snug text-zinc-300/90">
            {r
              ? ADVICE[r.band]
              : s.garminConnected
                ? "Recovery appears once your watch has synced a night of sleep."
                : "Connect Garmin to see your recovery score here every morning."}
          </p>
        </div>
        {top.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {top.map((c) => (
              <div key={c.key} className="rounded-2xl bg-black/20 px-2 py-2 text-center">
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
