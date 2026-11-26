"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDownIcon, ForkIcon, InfoIcon } from "@/components/icons";
import { BAND_DOT } from "@/components/meal/QualityParts";
import { MealIntro } from "@/components/meal/MealIntro";
import { Card, SectionTitle } from "@/components/ui";
import { BANDS, fmtClock, type Band, type Regularity } from "@/lib/meal-quality";
import { cn, formatShort } from "@/lib/utils";

export type RhythmMeal = { id: number; date: string; name: string; minutes: number; band: Band | null; calories: number; estimated: boolean };

const hm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** Meal timing (24 h clock + regularity) and meal quality through the day or week. */
export function MealRhythm({ date, meals, week, regularity }: { date: string; meals: RhythmMeal[]; week: RhythmMeal[]; regularity: Regularity }) {
  const [view, setView] = useState<"day" | "week">("day");
  const [showReg, setShowReg] = useState(false);
  const [intro, setIntro] = useState(false);
  const day = meals.filter((m) => m.calories >= 15).sort((a, b) => a.minutes - b.minutes);

  return (
    <section className="mt-6 space-y-3">
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
        <MealClock meals={day} usual={regularity.calibrating ? null : [regularity.firstAvg!, regularity.lastAvg!]} />

        <button onClick={() => setShowReg((v) => !v)} aria-expanded={showReg} className="press flex w-full items-center gap-3 text-left">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-citron text-carbon">
            <ForkIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Meal regularity</span>
            <span className="block text-sm text-zinc-400">
              {regularity.calibrating ? `Calibrating · ${regularity.days} of ${regularity.needed} days` : `${regularity.label} · ${regularity.score}/100`}
            </span>
          </span>
          <ChevronDownIcon className={cn("h-4 w-4 text-zinc-500 transition-transform", showReg && "rotate-180")} />
        </button>
        {showReg && (
          <div className="space-y-2 rounded-2xl bg-white/[0.04] p-3 text-sm">
            {regularity.calibrating ? (
              <p className="text-zinc-300">
                Log 2 or more meals a day for {regularity.needed} days to see how steady your meal times are.
                {regularity.days > 0 && ` ${regularity.days} so far.`}
              </p>
            ) : (
              <>
                <Row label="First meal" value={`${fmtClock(regularity.firstAvg!)} ± ${regularity.firstSd} min`} />
                <Row label="Last meal" value={`${fmtClock(regularity.lastAvg!)} ± ${regularity.lastSd} min`} />
                <Row label="Eating window" value={hm(regularity.windowAvg!)} />
                <Row label="Meals after 21:00" value={`${regularity.lateDays} of 14 days`} />
                <p className="pt-1 text-xs text-zinc-500">Regular meal times keep your body clock steady: more even energy and easier sleep.</p>
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** 24 h dial: midnight at the top, meals as dots, today's eating window as an arc. */
function MealClock({ meals, usual }: { meals: RhythmMeal[]; usual: [number, number] | null }) {
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
            {window != null && <span className="mt-1 text-[11px] tabular-nums text-zinc-500">{hm(window)} window</span>}
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
