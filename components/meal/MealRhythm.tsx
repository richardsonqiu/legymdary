"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDownIcon, ForkIcon, InfoIcon, SparkIcon } from "@/components/icons";
import { BAND_DOT } from "@/components/meal/QualityParts";
import { MealIntro } from "@/components/meal/MealIntro";
import { RHYTHM_SEEN_KEY } from "@/components/meal/rhythm-seen";
import { Card, SectionTitle } from "@/components/ui";
import { BANDS, fmtClock, type Band, type Regularity, type RhythmTone, type Verdict, formatShort } from "@legymdary/shared";
import { cn } from "@/lib/utils";

export type RhythmMeal = { id: number; date: string; name: string; minutes: number; band: Band | null; calories: number; estimated: boolean };

const hm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};

// Read once per page load, so the panel doesn't snap shut once we mark it seen.
let seenAtLoad: boolean | null = null;
const readSeen = () => {
  if (seenAtLoad == null) {
    try {
      seenAtLoad = localStorage.getItem(RHYTHM_SEEN_KEY) === "1";
    } catch {
      seenAtLoad = true;
    }
  }
  return seenAtLoad;
};
const noSub = () => () => {};

/** Meal timing (24 h clock + regularity) and meal quality through the day or week. */
export function MealRhythm({ date, today, meals, week, regularity }: { date: string; today: string; meals: RhythmMeal[]; week: RhythmMeal[]; regularity: Regularity }) {
  const [view, setView] = useState<"day" | "week">("day");
  const [toggled, setToggled] = useState<boolean | null>(null);
  const seen = useSyncExternalStore(noSub, readSeen, () => true);
  // The first time the rhythm is ready, open it so the new insight is seen.
  const showReg = toggled ?? (!regularity.calibrating && !seen);
  const setShowReg = (f: (v: boolean) => boolean) => setToggled(f(showReg));
  useEffect(() => {
    if (regularity.calibrating) return;
    try {
      localStorage.setItem(RHYTHM_SEEN_KEY, "1");
    } catch {}
  }, [regularity.calibrating]);
  const [intro, setIntro] = useState(false);
  const day = meals.filter((m) => m.calories >= 15).sort((a, b) => a.minutes - b.minutes);
  const isToday = date === today;

  return (
    <section id="meal-timing" className="mt-6 scroll-mt-6 space-y-3">
      <MealIntro open={intro} onClose={() => setIntro(false)} />
      <SectionTitle
        action={
          <button onClick={() => setIntro(true)} aria-label="About meal insights" className="rounded-full p-1 text-zinc-400 hover:text-zinc-200">
            <InfoIcon className="h-4 w-4" />
          </button>
        }
      >
        Meal timing
      </SectionTitle>

      <Card className="space-y-4">
        <MealClock meals={day} isToday={isToday} usual={regularity.calibrating ? null : [regularity.firstAvg!, regularity.lastAvg!]} />

        <button onClick={() => setShowReg((v) => !v)} aria-expanded={showReg} className="press flex w-full items-center gap-3 text-left">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-citron text-carbon">
            <ForkIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Meal regularity</span>
            <span className="block text-sm text-zinc-400">
              {regularity.calibrating ? `Learning your rhythm · ${regularity.days} of ${regularity.needed} days` : `${regularity.label} · ${regularity.score}/100`}
            </span>
          </span>
          <ChevronDownIcon className={cn("h-4 w-4 text-zinc-500 transition-transform", showReg && "rotate-180")} />
        </button>
        {!regularity.calibrating && !showReg && regularity.actions[0] && (
          <p className="-mt-1 flex gap-2 text-sm text-zinc-300">
            <SparkIcon className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
            {regularity.actions[0]}
          </p>
        )}
        {showReg && (
          <div className="space-y-3 rounded-2xl bg-white/[0.04] p-3 text-sm">
            {regularity.calibrating ? (
              <>
                <div className="flex gap-1.5" aria-label={`${regularity.days} of ${regularity.needed} days`}>
                  {Array.from({ length: regularity.needed }, (_, i) => (
                    <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < regularity.days ? "bg-teal-300" : "bg-zinc-700/70")} />
                  ))}
                </div>
                <p className="text-zinc-200">
                  Log at least 2 meals a day, at the time you eat them.{" "}
                  {regularity.needed - regularity.days === 1 ? "1 more day" : `${regularity.needed - regularity.days} more days`} and you&apos;ll see how steady your meal times are, with tips.
                </p>
                {regularity.excluded > 0 && (
                  <p className="text-xs text-zinc-500">
                    {regularity.excluded} older {regularity.excluded === 1 ? "meal has" : "meals have"} no eating time, so {regularity.excluded === 1 ? "it doesn't" : "they don't"} count. Set the time on a meal&apos;s page.
                  </p>
                )}
              </>
            ) : (
              <>
                <VerdictRow
                  label="First meal"
                  value={`around ${fmtClock(regularity.firstAvg!)}`}
                  sub={`Most days ${fmtClock(regularity.firstRange![0])} to ${fmtClock(regularity.firstRange![1])}`}
                  verdict={regularity.verdicts!.first}
                />
                <VerdictRow
                  label="Last meal"
                  value={`around ${fmtClock(regularity.lastAvg!)}`}
                  sub={`Most days ${fmtClock(regularity.lastRange![0])} to ${fmtClock(regularity.lastRange![1])}`}
                  verdict={regularity.verdicts!.last}
                />
                <VerdictRow label="Eating window" value={hm(regularity.windowAvg!)} sub="First to last meal, a typical day" verdict={regularity.verdicts!.window} />
                <VerdictRow label="Late meals" value={`${regularity.lateDays} of ${regularity.days} days`} sub="Last meal at 21:00 or later" verdict={regularity.verdicts!.late} />
                {regularity.sleep && (
                  <VerdictRow
                    label="Sleep after late meals"
                    value={`${regularity.sleep.lateAvg} vs ${regularity.sleep.otherAvg}`}
                    sub={`Sleep score, ${regularity.sleep.lateNights} late vs ${regularity.sleep.otherNights} other nights`}
                    verdict={
                      regularity.sleep.otherAvg - regularity.sleep.lateAvg >= 4
                        ? { tone: "watch", word: "Worse" }
                        : { tone: "good", word: "No clear effect" }
                    }
                  />
                )}
                <div className="space-y-1.5 border-t border-zinc-800/70 pt-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Try this</div>
                  {regularity.actions.map((a) => (
                    <p key={a} className="flex gap-2 text-zinc-200">
                      <SparkIcon className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
                      {a}
                    </p>
                  ))}
                </div>
                <p className="text-xs text-zinc-500">
                  Last {regularity.days} finished days with 2+ meals. Regular meal times keep your body clock steady: more even energy and easier sleep.
                  {regularity.excluded > 0 ? ` ${regularity.excluded} meals without an eating time aren't counted.` : ""}
                </p>
              </>
            )}
          </div>
        )}
      </Card>

      <SectionTitle
        action={
          <div role="tablist" className="flex gap-1 rounded-full bg-white/[0.05] p-0.5">
            {(["day", "week"] as const).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn("rounded-full px-3 py-1 text-xs font-medium capitalize", view === v ? "bg-citron text-carbon" : "text-zinc-400")}
              >
                {v}
              </button>
            ))}
          </div>
        }
      >
        Meal quality
      </SectionTitle>
      <Card className="p-0">
        <QualityLanes view={view} date={date} day={day} week={week} />
      </Card>
    </section>
  );
}

const TONE: Record<RhythmTone, string> = {
  good: "bg-teal-300/15 text-teal-200",
  ok: "bg-white/[0.06] text-zinc-300",
  watch: "bg-amber-400/15 text-amber-200",
};

function VerdictRow({ label, value, sub, verdict }: { label: string; value: string; sub: string; verdict: Verdict }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-zinc-300">{label}</div>
        <div className="text-[11px] text-zinc-500">{sub}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-medium tabular-nums">{value}</div>
        <span className={cn("mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[verdict.tone])}>{verdict.word}</span>
      </div>
    </div>
  );
}

/** 24 h dial: midnight at the top, meals as dots, today's eating window as an arc. */
function MealClock({ meals, usual, isToday }: { meals: RhythmMeal[]; usual: [number, number] | null; isToday: boolean }) {
  const S = 260;
  const c = S / 2;
  const R = 96;
  const pt = (min: number, r: number) => {
    const a = (min / 1440) * 2 * Math.PI - Math.PI / 2;
    return [c + r * Math.cos(a), c + r * Math.sin(a)] as const;
  };
  const arc = (from: number, to: number, r: number) => {
    const [x1, y1] = pt(from, r);
    const [x2, y2] = pt(to, r);
    const large = (to - from + 1440) % 1440 > 720 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const first = meals[0]?.minutes;
  const last = meals[meals.length - 1]?.minutes;
  const window = meals.length >= 2 ? last - first : null;

  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full" role="img" aria-label={`${meals.length} meals today`}>
        {/* hour dots and labels */}
        {Array.from({ length: 24 }, (_, h) => {
          const label = h % 3 === 0;
          const [x, y] = pt(h * 60, label ? 120 : 118);
          return label ? (
            <text key={h} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="11" style={{ fill: "var(--color-zinc-400)" }}>
              {String(h).padStart(2, "0")}
            </text>
          ) : (
            <circle key={h} cx={x} cy={y} r="1.6" style={{ fill: "var(--color-zinc-600)" }} />
          );
        })}
        {/* night shading 22:00 to 06:00 */}
        <path d={arc(22 * 60, 6 * 60, R)} fill="none" strokeWidth="14" strokeLinecap="round" style={{ stroke: "color-mix(in srgb, var(--color-zinc-700) 55%, transparent)" }} />
        <circle cx={c} cy={c} r={R} fill="none" strokeWidth="14" style={{ stroke: "color-mix(in srgb, var(--color-zinc-700) 25%, transparent)" }} />
        {/* your usual window */}
        {usual && <path d={arc(usual[0], usual[1], R - 16)} fill="none" strokeWidth="3" strokeDasharray="2 5" strokeLinecap="round" style={{ stroke: "var(--color-zinc-400)" }} />}
        {/* today's window */}
        {window != null && window > 0 && (
          <path d={arc(first, last, R)} fill="none" strokeWidth="14" strokeLinecap="round" className="score-ring-arc" style={{ stroke: "color-mix(in srgb, var(--color-teal-300) 45%, transparent)" }} />
        )}
        {meals.map((m) => {
          const [x, y] = pt(m.minutes, R);
          return (
            <circle
              key={m.id}
              cx={x}
              cy={y}
              r={Math.max(5, Math.min(9, 4 + m.calories / 150))}
              strokeWidth="2.5"
              style={{ stroke: "var(--color-zinc-900)", fill: m.band === "limited" ? "var(--color-amber-400)" : m.band === "fair" ? "var(--color-zinc-300)" : "var(--color-teal-300)" }}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {meals.length ? (
          <>
            <span className="text-3xl font-semibold tabular-nums">{meals.length}</span>
            <span className="text-xs text-zinc-400">{meals.length === 1 ? "meal" : "meals"}</span>
            {meals.length === 1 ? (
              <span className="mt-1 text-[11px] tabular-nums text-zinc-500">at {fmtClock(meals[0].minutes)}</span>
            ) : window != null && window >= 60 ? (
              <span className="mt-1 text-[11px] tabular-nums text-zinc-500">
                {hm(window)} {isToday ? "so far" : "window"}
              </span>
            ) : window != null ? (
              <span className="mt-1 text-[11px] tabular-nums text-zinc-500">around {fmtClock(meals[0].minutes)}</span>
            ) : null}
          </>
        ) : (
          <span className="max-w-[9rem] text-xs text-zinc-500">Log a meal to see your timing</span>
        )}
      </div>
    </div>
  );
}

const LANES = [...BANDS].reverse();

function QualityLanes({ view, date, day, week }: { view: "day" | "week"; date: string; day: RhythmMeal[]; week: RhythmMeal[] }) {
  const cols =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => {
          const d = new Date(`${date}T12:00:00Z`);
          d.setUTCDate(d.getUTCDate() - (6 - i));
          return d.toISOString().slice(0, 10);
        })
      : [];
  const list = view === "day" ? day : week;
  const rated = list.filter((m) => m.band);

  return (
    <div className="px-4 pb-3 pt-2">
      <div className="relative">
        {LANES.map((b) => (
          <div key={b.key} className="flex h-11 items-center border-b border-zinc-800/70">
            <div className="relative mr-3 h-full flex-1">
            {view === "day"
              ? day
                  .filter((m) => m.band === b.key)
                  .map((m) => (
                    <Link
                      key={m.id}
                      href={`/food/meal/${m.id}`}
                      title={`${m.name} · ${fmtClock(m.minutes)}`}
                      className={cn("absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-zinc-900", BAND_DOT[b.key])}
                      style={{ left: `${(m.minutes / 1440) * 100}%` }}
                    />
                  ))
              : cols.map((d, i) => {
                  const n = week.filter((m) => m.date === d && m.band === b.key);
                  return n.length ? (
                    <span
                      key={d}
                      title={n.map((m) => m.name).join(", ")}
                      className={cn("absolute top-1/2 flex h-5 min-w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-carbon", BAND_DOT[b.key])}
                      style={{ left: `${((i + 0.5) / 7) * 100}%` }}
                    >
                      {n.length > 1 ? n.length : ""}
                    </span>
                  ) : null;
                })}
            </div>
            <span className="w-16 shrink-0 text-right text-[10px] text-zinc-500">{b.label}</span>
          </div>
        ))}
      </div>
      <div className="relative mr-[76px] mt-1.5 h-4 text-[10px] tabular-nums text-zinc-500">
        {view === "day"
          ? [0, 6, 12, 18].map((h) => (
              <span key={h} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: `${(h / 24) * 100}%` }}>
                {String(h).padStart(2, "0")}
              </span>
            ))
          : cols.map((d, i) => (
              <span key={d} className={cn("absolute -translate-x-1/2", d === date && "font-semibold text-zinc-200")} style={{ left: `${((i + 0.5) / 7) * 100}%` }}>
                {new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).slice(0, 2)}
              </span>
            ))}
      </div>
      {rated.length === 0 && <p className="mt-2 text-center text-xs text-zinc-500">{view === "day" ? "No rated meals on this day yet." : `No rated meals since ${formatShort(cols[0] ?? date)}.`}</p>}
    </div>
  );
}
