import { format, parseISO } from "date-fns";
import Link from "next/link";
import { Card } from "@/components/ui";
import { hoursMinutes, type SleepSummary, type Stage, type StageKey } from "@/lib/analysis/sleep";
import { cn } from "@/lib/utils";

const COLOR: Record<StageKey, string> = {
  deep: "#6366f1", // indigo
  rem: "#a78bfa", // violet
  light: "#7dd3fc", // sky
  awake: "#fbbf24", // amber
};
const NAME: Record<StageKey, string> = { deep: "Deep", rem: "REM", light: "Light", awake: "Awake" };

const VERDICT_STYLE = {
  excellent: "text-teal-300",
  good: "text-teal-300",
  fair: "text-sky-300",
  poor: "text-amber-300",
} as const;

function StageBar({ stages, tall }: { stages: Stage[]; tall?: boolean }) {
  const total = stages.reduce((a, s) => a + s.minutes, 0) || 1;
  // Order like a night: light, deep, REM, then awake.
  const order: StageKey[] = ["deep", "light", "rem", "awake"];
  return (
    <div className={cn("flex w-full overflow-hidden rounded-full bg-white/5", tall ? "h-3" : "h-2")} role="img" aria-label="Sleep stages">
      {order.map((k) => {
        const s = stages.find((x) => x.key === k);
        return s ? <div key={k} style={{ width: `${(s.minutes / total) * 100}%`, background: COLOR[k] }} /> : null;
      })}
    </div>
  );
}

function Chip({ label, value, sub, tone }: { label: string; value: string; sub?: string | null; tone?: "good" | "bad" | null }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] px-3 py-2.5">
      <div className="text-[11px] text-zinc-400">{label}</div>
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", tone === "good" && "text-teal-200", tone === "bad" && "text-amber-200")}>{value}</div>
      {sub && <div className="text-[11px] tabular-nums text-zinc-500">{sub}</div>}
    </div>
  );
}

function Dot({ tone }: { tone: "good" | "bad" }) {
  return <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", tone === "good" ? "bg-teal-300" : "bg-amber-300")} />;
}

/** Last night's sleep: score, stages, what shaped it and what to do about it. */
export function SleepSummaryCard({ s, compact }: { s: SleepSummary; compact?: boolean }) {
  if (compact) {
    const top = s.drivers[0];
    return (
      <Link href="/insights#sleep" className="glass press block space-y-3 rounded-3xl border border-white/10 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300/80">Last night</span>
          <span className="text-xs text-zinc-400">Full report →</span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-semibold tabular-nums leading-none">
              {hoursMinutes(s.minutes)}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              {s.pctOfNeed}% of your {s.needHours} h need
            </div>
          </div>
          {s.score != null && (
            <div className="text-right">
              <div className="text-3xl font-semibold tabular-nums leading-none">{s.score}</div>
              <div className={cn("mt-1 text-xs font-medium capitalize", VERDICT_STYLE[s.verdict])}>{s.verdict}</div>
            </div>
          )}
        </div>
        <StageBar stages={s.stages} />
        {top && (
          <div className="flex gap-2 text-sm text-zinc-200">
            <Dot tone={top.tone} />
            <span>{top.text}</span>
          </div>
        )}
      </Link>
    );
  }

  const trendWord =
    s.weekAvgScore != null && s.prevWeekAvgScore != null
      ? `${s.weekAvgScore} avg this week, ${s.weekAvgScore >= s.prevWeekAvgScore ? "up from" : "down from"} ${s.prevWeekAvgScore}`
      : null;
  const bedSub =
    s.bedVsUsualMin == null
      ? null
      : Math.abs(s.bedVsUsualMin) < 10
        ? "your usual"
        : `${hoursMinutes(Math.abs(s.bedVsUsualMin))} ${s.bedVsUsualMin > 0 ? "later" : "earlier"} than usual`;

  return (
    <Card id="sleep" className="space-y-5">
      {/* Headline */}
      <div className="flex items-start justify-between gap-4">
        <p className="min-w-0 text-[15px] leading-snug text-zinc-200">{s.headline}</p>
        {s.score != null && (
          <div className="shrink-0 text-right">
            <div className="text-4xl font-semibold leading-none tabular-nums">{s.score}</div>
            <div className={cn("mt-1 text-xs font-medium capitalize", VERDICT_STYLE[s.verdict])}>{s.verdict}</div>
          </div>
        )}
      </div>

      {/* Stages */}
      <div className="space-y-3">
        <StageBar stages={s.stages} tall />
        <ul className="space-y-1.5">
          {s.stages.map((st) => (
            <li key={st.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-zinc-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[st.key] }} />
                {NAME[st.key]}
              </span>
              <span className="text-right tabular-nums text-zinc-400">
                {hoursMinutes(st.minutes)} · {st.pct}%
                {st.typical && (
                  <span className={cn("ml-2 text-xs", st.status === "ok" ? "text-teal-300/80" : "text-amber-300/90")}>
                    {st.status === "ok" ? "typical" : st.status === "low" ? "low" : "high"} ({st.typical[0]} to {st.typical[1]}%)
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-2">
        {s.efficiency != null && (
          <Chip label="Sleep efficiency" value={`${s.efficiency}%`} sub="time asleep in bed" tone={s.efficiency >= 90 ? "good" : s.efficiency < 80 ? "bad" : null} />
        )}
        {s.awakeMin != null && (
          <Chip
            label="Awake"
            value={`${s.awakeMin} min`}
            sub={[s.awakeCount != null ? `${s.awakeCount} wake-ups` : null, s.restless != null ? `${s.restless} restless moments` : null].filter(Boolean).join(" · ") || null}
            tone={s.awakeMin <= 20 ? "good" : s.awakeMin >= 45 ? "bad" : null}
          />
        )}
        {s.bed && <Chip label="Bed to wake" value={`${s.bed} to ${s.wake ?? "?"}`} sub={bedSub} tone={s.bedVsUsualMin != null && s.bedVsUsualMin >= 45 ? "bad" : null} />}
        {s.recovery.hrv != null && (
          <Chip
            label="Overnight HRV"
            value={`${s.recovery.hrv} ms`}
            sub={s.recovery.hrvUsual != null ? `usual ${s.recovery.hrvUsual} ms` : null}
            tone={s.recovery.hrvUsual != null ? (s.recovery.hrv >= s.recovery.hrvUsual ? "good" : s.recovery.hrv < s.recovery.hrvUsual * 0.85 ? "bad" : null) : null}
          />
        )}
        {s.recovery.rhr != null && (
          <Chip
            label="Sleeping heart rate"
            value={`${s.recovery.rhr} bpm`}
            sub={s.recovery.rhrUsual != null ? `usual ${s.recovery.rhrUsual} bpm` : null}
            tone={s.recovery.rhrUsual != null ? (s.recovery.rhr <= s.recovery.rhrUsual + 1 ? "good" : s.recovery.rhr >= s.recovery.rhrUsual + 5 ? "bad" : null) : null}
          />
        )}
        {s.recovery.bodyBatteryCharged != null && (
          <Chip label="Body Battery gained" value={`+${s.recovery.bodyBatteryCharged}`} sub={s.recovery.bodyBatteryWake != null ? `${s.recovery.bodyBatteryWake} at wake` : null} />
        )}
      </div>

      {/* Garmin's own ratings */}
      {s.parts.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-500">How Garmin rated it</div>
          <div className="flex flex-wrap gap-1.5">
            {s.parts.map((p) => (
              <span
                key={p.label}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs",
                  p.rating === "excellent" || p.rating === "good"
                    ? "bg-teal-300/10 text-teal-200"
                    : p.rating === "fair"
                      ? "bg-sky-300/10 text-sky-200"
                      : "bg-amber-300/10 text-amber-200",
                )}
              >
                {p.label}: {p.rating}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* What shaped it */}
      {s.drivers.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-wide text-zinc-500">What shaped it</div>
          <ul className="space-y-1.5">
            {s.drivers.map((d, k) => (
              <li key={k} className="flex gap-2 text-sm text-zinc-200">
                <Dot tone={d.tone} />
                <span>{d.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.tip && <p className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3 text-sm text-zinc-200">{s.tip}</p>}

      {/* Last 7 nights */}
      <div>
        <div className="mb-1 flex items-baseline justify-between text-[11px] uppercase tracking-wide text-zinc-500">
          <span>Last 7 nights</span>
          {trendWord && <span className="normal-case tracking-normal text-zinc-400">{trendWord}</span>}
        </div>
        <div className="flex h-24 items-end gap-1.5">
          {s.week.map((n) => (
            <div key={n.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div
                className={cn(
                  "w-full rounded-sm",
                  n.score == null ? "bg-white/5" : n.score >= 80 ? "bg-teal-400/80" : n.score >= 60 ? "bg-sky-400/70" : "bg-amber-400/80",
                )}
                style={{ height: n.score == null ? "6%" : `${Math.max(8, n.score)}%` }}
                title={n.score == null ? "No score" : `${n.score}`}
              />
              <span className="text-[10px] tabular-nums leading-none text-zinc-500">{n.score ?? ""}</span>
              <span className="text-[10px] leading-none text-zinc-500">{format(parseISO(n.date), "EEE")}</span>
            </div>
          ))}
        </div>
      </div>

      {s.vsUsual.hours != null && (
        <p className="text-xs text-zinc-500">
          Your usual is {s.vsUsual.hours} h{s.vsUsual.score != null ? ` and a score of ${s.vsUsual.score}` : ""} (last 14 nights).
        </p>
      )}
    </Card>
  );
}
