import Link from "next/link";
import { ArcGauge, RangeBar, toneFor, toneWord } from "@/components/score/Score";
import { Explain } from "@/components/Explain";
import { Card } from "@/components/ui";
import type { DayCard } from "@/lib/analysis/service";
import { cn } from "@/lib/utils";

/** Server-safe presentational cards for the Insights page. */


export function ReadinessHero({ r }: { r: DayCard["readiness"] }) {
  if (!r) {
    return (
      <Card className="text-sm text-zinc-400">
        <p className="font-medium text-zinc-200">Readiness unlocks soon</p>
        <p className="mt-1">
          It compares last night&apos;s HRV, resting HR and sleep with your own baseline, which needs
          about 10–14 nights of Garmin data.
        </p>
      </Card>
    );
  }
  const tone = toneFor(r.score);
  const sky: Record<string, [string, string]> = {
    great: ["rgba(94,234,212,0.38)", "rgba(129,140,248,0.32)"],
    good: ["rgba(125,211,252,0.32)", "rgba(165,180,252,0.30)"],
    low: ["rgba(252,211,77,0.30)", "rgba(244,114,182,0.22)"],
    none: ["rgba(125,211,252,0.18)", "rgba(129,140,248,0.18)"],
  };
  const [a, b] = sky[tone];
  return (
    <div className="space-y-3">
      <div
        className="hero-photo relative overflow-hidden rounded-[28px] border border-white/10 px-5 pb-5 pt-5"
        style={{ ["--sky-a" as string]: a, ["--sky-b" as string]: b }}
      >
        <div className="relative mx-auto flex w-[220px] justify-center">
          <ArcGauge value={r.score} />
          <div className="absolute inset-x-0 top-[58px] text-center">
            <div className="text-6xl font-light leading-none tabular-nums tracking-tight">{r.score}</div>
            <div className="mt-1.5 text-sm font-medium text-zinc-200">{toneWord(r.score)}</div>
          </div>
        </div>
        <div className="-mt-6 text-center">
          <div className="text-lg font-semibold">{r.label}</div>
          <span className="mt-1 inline-flex rounded-full bg-black/25 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-300">
            {r.confidence} confidence
          </span>
        </div>
      </div>
      <Card>
        <ul className="space-y-3.5">
          {r.contributors.map((k) => (
            <li key={k.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-zinc-200">
                  {k.label} <span className="text-xs text-zinc-500">· {k.weight}%</span>
                </span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    k.score >= 75 ? "text-teal-200" : k.score >= 50 ? "text-sky-200" : "text-amber-200",
                  )}
                >
                  {toneWord(k.score)}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[11px] tabular-nums text-zinc-500">{k.detail}</div>
              <RangeBar value={k.score} className="mt-1.5" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | null;
  tone?: "good" | "bad" | null;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          tone === "good" && "text-emerald-300",
          tone === "bad" && "text-amber-300",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

const vs = (now: number | null, usual: number | null, unit = "") =>
  now == null ? null : usual == null ? null : `usual ${usual}${unit}`;

export function SleepRecoveryCard({ card }: { card: DayCard }) {
  const n = card.lastNight;
  const perf = n.sleepHours != null ? Math.round((n.sleepHours / n.sleepNeedHours) * 100) : null;
  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Metric
          label="Sleep"
          value={n.sleepHours != null ? `${n.sleepHours} h` : "–"}
          sub={perf != null ? `${perf}% of ${n.sleepNeedHours} h need` : null}
          tone={perf == null ? null : perf >= 90 ? "good" : perf < 75 ? "bad" : null}
        />
        <Metric
          label="Sleep score"
          value={n.sleepScore != null ? String(n.sleepScore) : "–"}
          sub={[n.deepPct != null ? `deep ${n.deepPct}%` : null, n.remPct != null ? `REM ${n.remPct}%` : null].filter(Boolean).join(" · ") || null}
          tone={n.sleepScore == null ? null : n.sleepScore >= 80 ? "good" : n.sleepScore < 60 ? "bad" : null}
        />
        <Metric
          label="HRV"
          value={n.hrv != null ? `${n.hrv} ms` : "–"}
          sub={vs(n.hrv, n.hrvUsual, " ms") ?? n.hrvStatus?.toLowerCase() ?? null}
          tone={n.hrv != null && n.hrvUsual != null ? (n.hrv >= n.hrvUsual * 0.97 ? "good" : n.hrv < n.hrvUsual * 0.85 ? "bad" : null) : null}
        />
        <Metric
          label="Resting HR"
          value={n.restingHr != null ? `${n.restingHr}` : "–"}
          sub={vs(n.restingHr, n.restingHrUsual, " bpm")}
          tone={n.restingHr != null && n.restingHrUsual != null ? (n.restingHr <= n.restingHrUsual + 1 ? "good" : n.restingHr >= n.restingHrUsual + 5 ? "bad" : null) : null}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        {n.bedtime && <span>Bed {n.bedtime}{n.wake ? ` → ${n.wake}` : ""}</span>}
        {card.sleepDebtHours != null && <span>Sleep debt {card.sleepDebtHours} h (7d)</span>}
        {card.sleepConsistency && <span>Bedtime varies ±{Math.round(card.sleepConsistency.bedSd)} min</span>}
        {n.respiration != null && <span>Breathing {n.respiration}/min</span>}
        {n.spo2Low != null && <span>SpO2 low {n.spo2Low}%</span>}
        {n.bodyBatteryAtWake != null && <span>Body Battery at wake {n.bodyBatteryAtWake}</span>}
      </div>
    </Card>
  );
}

export function YesterdayCard({ card }: { card: DayCard }) {
  const y = card.yesterday;
  const ratio = card.load?.ratio ?? null;
  const p = card.plan;
  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Strain" value={`${y.strain}`} sub="of 21" />
        <Metric
          label="Load ratio"
          value={ratio != null ? String(ratio) : "–"}
          sub={ratio == null ? "needs ~3 weeks" : ratio > 1.5 ? "spike" : ratio < 0.8 ? "low" : "balanced"}
          tone={ratio == null ? null : ratio > 1.5 ? "bad" : ratio >= 0.8 && ratio <= 1.3 ? "good" : null}
        />
        <Metric label="Steps" value={y.steps != null ? y.steps.toLocaleString("en-US") : "–"} />
      </div>
      {(y.activities.length > 0 || y.strengthSets > 0) && (
        <ul className="space-y-1 text-xs text-zinc-400">
          {y.activities.map((a, i) => (
            <li key={i} className="flex justify-between gap-3">
              {a.id ? (
                <Link href={`/activities/${a.id}`} className="truncate text-zinc-200 underline-offset-2 hover:underline">
                  {a.name} ›
                </Link>
              ) : (
                <span className="truncate">{a.name}</span>
              )}
              <span className="shrink-0 tabular-nums text-zinc-500">
                {a.min} min{a.load != null ? ` · load ${a.load}` : ""}{a.kcal != null ? ` · ${Math.round(a.kcal)} kcal` : ""}
              </span>
            </li>
          ))}
          {y.strengthSets > 0 && (
            <li className="flex justify-between gap-3">
              <span>Strength (logged here)</span>
              <span className="tabular-nums text-zinc-500">
                {y.strengthSets} sets · {y.strengthVolumeKg.toLocaleString("en-US")} kg
              </span>
            </li>
          )}
        </ul>
      )}
      <div className="grid grid-cols-3 gap-2 border-t border-zinc-800/80 pt-3">
        <Metric label="Eaten" value={y.meals ? y.eatenKcal.toLocaleString("en-US") : "–"} sub={y.fullyLogged ? null : y.meals ? "partly logged" : "not logged"} />
        <Metric label="Burned" value={y.burnedKcal != null ? y.burnedKcal.toLocaleString("en-US") : "–"} />
        <Metric
          label="Protein"
          value={y.meals ? `${y.protein} g` : "–"}
          sub={p.proteinTarget ? `target ${p.proteinTarget} g` : null}
          tone={y.meals && p.proteinTarget ? (y.protein >= p.proteinTarget * 0.9 ? "good" : y.protein < p.proteinTarget * 0.7 ? "bad" : null) : null}
        />
      </div>
      {card.energy7d.avgNetKcal != null && (
        <p className="text-xs text-zinc-500">
          Last {card.energy7d.fullyLoggedDays} fully-logged days: avg {card.energy7d.avgNetKcal > 0 ? "+" : ""}
          {card.energy7d.avgNetKcal} kcal/day (≈ {card.energy7d.impliedKgPerWeek} kg/week).
        </p>
      )}
    </Card>
  );
}

export function PatternsAndFlags({ card }: { card: DayCard }) {
  if (!card.flags.length && !card.patterns.length) return null;
  return (
    <Card className="space-y-3">
      {card.flags.map((f, i) => (
        <p
          key={i}
          className={cn(
            "rounded-xl border px-3 py-2 text-sm",
            f.level === "warn" ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-zinc-800 bg-zinc-900/60 text-zinc-400",
          )}
        >
          {f.text}
        </p>
      ))}
      {card.patterns.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Your patterns
            <Explain k="patterns" />
          </div>
          <ul className="space-y-1 text-sm text-zinc-300">
            {card.patterns.map((p) => (
              <li key={p.text}>• {p.text}</li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-zinc-600">Associations in your own history, not proof of cause.</p>
        </div>
      )}
    </Card>
  );
}

export function BodyCompositionCard({ card }: { card: DayCard }) {
  const b = card.bodyComposition;
  if (!b) return null;
  const sp = b.sincePrevious;
  const sign = (v: number | null, unit: string) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v} ${unit}`);
  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between text-xs text-zinc-500">
        <span>Latest scan {b.date}</span>
        <span>{b.daysAgo === 0 ? "today" : `${b.daysAgo} days ago`}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Muscle" value={b.skeletalMuscleKg != null ? `${b.skeletalMuscleKg} kg` : "–"} sub={sp ? sign(sp.muscleKg, "kg") : null} tone={sp?.muscleKg == null ? null : sp.muscleKg >= 0 ? "good" : "bad"} />
        <Metric label="Fat mass" value={b.fatMassKg != null ? `${b.fatMassKg} kg` : "–"} sub={sp ? sign(sp.fatKg, "kg") : null} tone={sp?.fatKg == null ? null : sp.fatKg <= 0 ? "good" : "bad"} />
        <Metric label="Body fat" value={b.bodyFatPct != null ? `${b.bodyFatPct}%` : "–"} sub={b.visceralFatLevel != null ? `visceral ${b.visceralFatLevel}` : null} />
      </div>
      {sp?.verdict && <p className="text-sm text-zinc-300">{sp.verdict} (over {sp.days} days).</p>}
      {b.segmental?.advice && <p className="text-xs text-amber-200/90">💡 {b.segmental.advice}</p>}
    </Card>
  );
}
