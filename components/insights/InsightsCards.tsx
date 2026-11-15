import { Card } from "@/components/ui";
import type { DayCard } from "@/lib/analysis/service";
import { cn } from "@/lib/utils";

/** Server-safe presentational cards for the Insights page. */

const bandStyle = {
  push: { ring: "stroke-emerald-400", text: "text-emerald-300", chip: "bg-emerald-500/15 text-emerald-300" },
  normal: { ring: "stroke-sky-400", text: "text-sky-300", chip: "bg-sky-500/15 text-sky-300" },
  easy: { ring: "stroke-amber-400", text: "text-amber-300", chip: "bg-amber-500/15 text-amber-300" },
} as const;

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
  const st = bandStyle[r.band];
  const size = 132;
  const stroke = 12;
  const rad = (size - stroke) / 2;
  const c = 2 * Math.PI * rad;
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-5">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
            <circle cx={size / 2} cy={size / 2} r={rad} fill="none" strokeWidth={stroke} className="stroke-zinc-800" />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={rad}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - r.score / 100)}
              style={{ ["--ring-c" as string]: c }}
              className={cn("ring-progress", st.ring)}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-semibold tabular-nums tracking-tight">{r.score}</span>
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">readiness</span>
          </div>
        </div>
        <div className="min-w-0">
          <div className={cn("text-xl font-semibold", st.text)}>{r.label}</div>
          <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", st.chip)}>
            {r.confidence} confidence
          </span>
        </div>
      </div>
      <ul className="space-y-2.5">
        {r.contributors.map((k) => (
          <li key={k.key}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="text-zinc-300">
                {k.label} <span className="text-zinc-600">· {k.weight}%</span>
              </span>
              <span className="truncate text-right tabular-nums text-zinc-500">{k.detail}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className={cn(
                  "bar-fill h-full rounded-full",
                  k.score >= 70 ? "bg-emerald-400" : k.score >= 45 ? "bg-sky-400" : "bg-amber-400",
                )}
                style={{ width: `${Math.max(4, k.score)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Card>
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
              <span className="truncate">{a.name}</span>
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
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Your patterns</div>
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
