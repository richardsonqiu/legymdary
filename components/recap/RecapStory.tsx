"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CountUp } from "@/components/CountUp";
import { ShareIcon, XIcon } from "@/components/icons";
import type { Recap } from "@/lib/recap";
import { cn } from "@/lib/utils";

type Theme = { bg: string; fg: string; muted: string; accent: string; ghost: string };
const THEMES = {
  ink: { bg: "#111111", fg: "#f6f1e9", muted: "#b9b2a6", accent: "#f2683c", ghost: "rgba(242,104,60,0.22)" },
  orange: { bg: "#f2683c", fg: "#1b1410", muted: "#3a2418", accent: "#fff3e6", ghost: "rgba(27,20,16,0.12)" },
  cream: { bg: "#ece5da", fg: "#1c1a17", muted: "#5c564c", accent: "#c4484f", ghost: "rgba(28,26,23,0.10)" },
  forest: { bg: "#1f3a2b", fg: "#eef5d8", muted: "#b5c9a4", accent: "#c9f06b", ghost: "rgba(201,240,107,0.14)" },
  yellow: { bg: "#f1c84b", fg: "#1d1708", muted: "#4d3f12", accent: "#1d1708", ghost: "rgba(29,23,8,0.10)" },
  indigo: { bg: "#27237a", fg: "#f1efff", muted: "#bdb8ee", accent: "#ff8fd0", ghost: "rgba(255,143,208,0.16)" },
  teal: { bg: "#0f4b4f", fg: "#eafffb", muted: "#a5d9d2", accent: "#7ef0d9", ghost: "rgba(126,240,217,0.14)" },
  night: { bg: "#0d1430", fg: "#eef1ff", muted: "#a7b0d8", accent: "#9fb4ff", ghost: "rgba(159,180,255,0.14)" },
  lime: { bg: "#d4f04c", fg: "#141a05", muted: "#3b4612", accent: "#141a05", ghost: "rgba(20,26,5,0.10)" },
} satisfies Record<string, Theme>;

type Slide = { key: string; theme: Theme; ghost: string; body: React.ReactNode };

const DURATION = 6500;
const nf = (n: number) => Math.round(n).toLocaleString("en-US");
const hm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h} h ${m} m` : `${h} h`) : `${m} min`;
};
const dayName = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
const ICON: Record<string, string> = { Running: "🏃", Cycling: "🚴", "Strength Training": "🏋️", Gym: "🏋️", Walking: "🚶", Swimming: "🏊", Hiking: "🥾", Yoga: "🧘" };

function Kicker({ children, t }: { children: React.ReactNode; t: Theme }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: t.fg }}>
      <span className="h-px w-5" style={{ background: t.accent }} />
      {children}
    </div>
  );
}

function Bars({ items, t, highlight }: { items: { label: string; value: number }[]; t: Theme; highlight: string | null }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex h-28 items-end gap-1.5">
      {items.map((i) => (
        <div key={i.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <div
            className="recap-rise w-full rounded-md"
            style={{
              height: `${Math.max(6, (i.value / max) * 100)}%`,
              background: i.label === highlight ? t.accent : t.ghost.replace(/0\.\d+\)/, "0.45)"),
            }}
          />
          <span className="text-[10px] font-semibold uppercase" style={{ color: t.muted }}>
            {i.label.slice(0, 3)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Builds the slides from the recap, skipping any without data. */
function buildSlides(r: Recap): Slide[] {
  const { training: tr, food, sleep, steps, prs, weight, range } = r;
  const noun = range.noun;
  const slides: Slide[] = [];
  const T = THEMES;

  slides.push({
    key: "intro",
    theme: T.ink,
    ghost: range.period === "year" ? range.label : range.period === "month" ? range.label.slice(0, 3) : "WEEK",
    body: (
      <>
        <Kicker t={T.ink}>Rewind · {range.label}</Kicker>
        <h1 className="recap-serif mt-5 text-[52px] font-bold leading-[0.95]">
          Your
          <br />
          <em style={{ color: T.ink.accent }}>{range.period === "year" ? range.label : range.period === "month" ? range.label : "week"}</em>
          <br />
          {range.partial ? "so far." : "in review."}
        </h1>
        <p className="mt-6 max-w-[28ch] text-[15px] leading-snug" style={{ color: T.ink.muted }}>
          {tr.activeDays} active day{tr.activeDays === 1 ? "" : "s"}, {food.meals} meal{food.meals === 1 ? "" : "s"} logged
          {sleep.nights ? `, ${sleep.nights} nights of sleep` : ""}. Here is how it went.
        </p>
      </>
    ),
  });

  if (tr.activeDays > 0 || tr.minutes > 0) {
    const diff = tr.activeDays - tr.prevActiveDays;
    slides.push({
      key: "moved",
      theme: T.orange,
      ghost: "MOVE",
      body: (
        <>
          <Kicker t={T.orange}>This {noun} you moved</Kicker>
          <div className="recap-serif mt-4 text-[64px] font-black leading-none">{hm(tr.minutes)}</div>
          <div className="mt-3 text-2xl font-bold">
            <CountUp value={tr.activeDays} duration={700} /> active day{tr.activeDays === 1 ? "" : "s"}
            {diff !== 0 && <span className="ml-2 text-base">{diff > 0 ? `↑ ${diff}` : `↓ ${-diff}`} vs last {noun}</span>}
          </div>
          <p className="mt-4 max-w-[30ch] text-[15px] leading-snug" style={{ color: T.orange.muted }}>
            {tr.sessions} session{tr.sessions === 1 ? "" : "s"}
            {tr.kcal ? `, about ${nf(tr.kcal)} kcal burned in workouts` : ""}.{" "}
            {diff > 0 ? "More than before. Nice." : diff < 0 ? `A quieter ${noun}. It happens.` : "Steady as ever."}
          </p>
        </>
      ),
    });
  }

  if (tr.types.length > 0) {
    const top = tr.types[0];
    slides.push({
      key: "top",
      theme: T.cream,
      ghost: "No1",
      body: (
        <>
          <Kicker t={T.cream}>Your number one</Kicker>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-5xl">{ICON[top.name] ?? "⚡"}</span>
            <span className="recap-serif text-[56px] font-black leading-none" style={{ color: T.cream.accent }}>
              {top.pct}%
            </span>
          </div>
          <div className="recap-serif mt-1 text-4xl font-bold">{top.name}</div>
          <p className="mt-2 text-[15px]" style={{ color: T.cream.muted }}>
            {hm(top.minutes)} of your training time.
          </p>
          <ul className="mt-6 space-y-3">
            {tr.types.map((x, k) => (
              <li key={x.name}>
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                  <span>
                    0{k + 1} · {x.name}
                  </span>
                  <span>{hm(x.minutes)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full" style={{ background: T.cream.ghost }}>
                  <div className="recap-grow h-full rounded-full" style={{ width: `${x.pct}%`, background: k === 0 ? T.cream.accent : T.cream.muted }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ),
    });
  }

  if (tr.longest && tr.longest.minutes >= 15) {
    slides.push({
      key: "longest",
      theme: T.forest,
      ghost: "LONG",
      body: (
        <>
          <Kicker t={T.forest}>Your longest session</Kicker>
          <div className="recap-serif mt-5 text-[44px] font-bold italic leading-tight" style={{ color: T.forest.accent }}>
            {tr.longest.name}
          </div>
          <div className="recap-serif mt-3 text-[72px] font-black leading-none">{hm(tr.longest.minutes)}</div>
          <span className="mt-5 inline-block rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ borderColor: T.forest.fg }}>
            {dayName(tr.longest.date)}
          </span>
        </>
      ),
    });
  }

  if (prs.count > 0 && prs.best) {
    slides.push({
      key: "prs",
      theme: T.yellow,
      ghost: "PR",
      body: (
        <>
          <Kicker t={T.yellow}>New personal records</Kicker>
          <div className="recap-serif mt-4 text-[96px] font-black leading-none">
            <CountUp value={prs.count} duration={700} />
          </div>
          <div className="recap-serif mt-2 text-3xl font-bold">{prs.best.name}</div>
          <span className="mt-4 inline-block rounded-full border-2 px-3 py-1 text-sm font-bold" style={{ borderColor: T.yellow.fg }}>
            {prs.best.weight} kg × {prs.best.reps} · {dayName(prs.best.date)}
          </span>
        </>
      ),
    });
  }

  if (tr.bestRhythm) {
    const best = tr.bestRhythm;
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const DAYS: Record<string, string> = { Mon: "Mondays", Tue: "Tuesdays", Wed: "Wednesdays", Thu: "Thursdays", Fri: "Fridays", Sat: "Saturdays", Sun: "Sundays" };
    const word = range.period === "year" ? MONTHS[tr.rhythm.findIndex((x) => x.label === best)] : DAYS[best];
    const active = tr.grid.filter((g) => g.v >= 2).length;
    slides.push({
      key: "rhythm",
      theme: T.indigo,
      ghost: best.toUpperCase(),
      body: (
        <>
          <Kicker t={T.indigo}>Your rhythm</Kicker>
          <h2 className="recap-serif mt-4 text-[44px] font-bold leading-[1.02]">
            <em style={{ color: T.indigo.accent }}>{word}</em>
            <br />
            {range.period === "year" ? "was your biggest month." : "were for moving."}
          </h2>
          <div className="mt-6">
            <Bars items={tr.rhythm.map((x) => ({ label: x.label, value: x.minutes }))} t={T.indigo} highlight={best} />
          </div>
          <div className="mt-6 flex items-baseline gap-2">
            <span className="recap-serif text-5xl font-black">{active}</span>
            <span className="text-sm">active days</span>
          </div>
          <div className={cn("mt-3 flex flex-wrap gap-1", range.period === "year" && "gap-[3px]")}>
            {tr.grid.map((g) => (
              <span
                key={g.date}
                className={cn("rounded-[3px]", range.period === "year" ? "h-2 w-2" : "h-4 w-4")}
                style={{ background: g.v >= 2 ? T.indigo.accent : g.v === 1 ? "rgba(241,239,255,0.35)" : "rgba(241,239,255,0.1)" }}
                title={g.date}
              />
            ))}
          </div>
        </>
      ),
    });
  }

  if (food.daysLogged > 0) {
    const share = food.daysLogged / Math.max(1, tr.days);
    slides.push({
      key: "food",
      theme: T.teal,
      ghost: "EAT",
      body: (
        <>
          <Kicker t={T.teal}>You logged food on</Kicker>
          <div className="recap-serif mt-4 text-[80px] font-black leading-none">
            <CountUp value={food.daysLogged} duration={700} />
            <span className="text-3xl font-bold" style={{ color: T.teal.muted }}>
              {" "}of {tr.days} days
            </span>
          </div>
          <p className="mt-4 text-lg font-semibold">
            {food.meals} meals{food.skipped ? `, ${food.skipped} skipped on purpose` : ""}.
          </p>
          {food.avgKcal != null && (
            <p className="mt-2 text-[15px]" style={{ color: T.teal.muted }}>
              About {nf(food.avgKcal)} kcal and {food.avgProtein} g protein a day.
            </p>
          )}
          <p className="mt-5 text-[15px]" style={{ color: T.teal.accent }}>
            {share >= 0.85 ? "You barely missed a day." : share >= 0.5 ? "More often than not. Good habit forming." : "A start. Every logged meal helps."}
          </p>
        </>
      ),
    });
  }

  if (food.goTo) {
    slides.push({
      key: "goto",
      theme: T.cream,
      ghost: `${food.goTo.count}×`,
      body: (
        <>
          <Kicker t={T.cream}>Your go-to meal</Kicker>
          <div className="recap-serif mt-5 text-[46px] font-black italic leading-[1.02]">{food.goTo.name}</div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="recap-serif text-[80px] font-black leading-none" style={{ color: T.cream.accent }}>
              {food.goTo.count}
            </span>
            <span className="recap-serif text-2xl italic">times</span>
          </div>
          {food.biggest && (
            <p className="mt-5 max-w-[30ch] text-[15px]" style={{ color: T.cream.muted }}>
              Biggest meal: {food.biggest.name}, {nf(food.biggest.kcal)} kcal on {dayName(food.biggest.date)}.
            </p>
          )}
        </>
      ),
    });
  }

  if (sleep.avgHours != null) {
    const h = sleep.avgHours;
    slides.push({
      key: "sleep",
      theme: T.night,
      ghost: "ZZZ",
      body: (
        <>
          <Kicker t={T.night}>Your nights</Kicker>
          <div className="recap-serif mt-4 text-[80px] font-black leading-none">
            {h}
            <span className="text-3xl"> h</span>
          </div>
          <p className="mt-2 text-lg font-semibold">a night, on average</p>
          {sleep.avgScore != null && (
            <p className="mt-3 text-[15px]" style={{ color: T.night.muted }}>
              Average sleep score {sleep.avgScore}.
              {sleep.best ? ` Best night: ${dayName(sleep.best.date)}, score ${sleep.best.score}.` : ""}
            </p>
          )}
          <p className="mt-5 text-[15px]" style={{ color: T.night.accent }}>
            {h >= 7.5 ? "Well rested." : h >= 7 ? "Solid sleep." : h >= 6.5 ? "A little short. Half an hour earlier would help." : "Short nights. Earlier bedtimes would help everything else."}
            {sleep.prevAvgHours != null && Math.abs(h - sleep.prevAvgHours) >= 0.2
              ? ` ${h > sleep.prevAvgHours ? "Up" : "Down"} ${Math.abs(Math.round((h - sleep.prevAvgHours) * 60))} min on last ${noun}.`
              : ""}
          </p>
        </>
      ),
    });
  }

  if (steps.total > 0) {
    slides.push({
      key: "steps",
      theme: T.lime,
      ghost: "STEP",
      body: (
        <>
          <Kicker t={T.lime}>You walked</Kicker>
          <div className="recap-serif mt-4 text-[64px] font-black leading-none">
            <CountUp value={steps.total} duration={900} />
          </div>
          <p className="mt-2 text-xl font-bold">steps</p>
          {steps.avgPerDay != null && (
            <p className="mt-4 text-[15px] font-medium" style={{ color: T.lime.muted }}>
              About {nf(steps.avgPerDay)} a day.
              {steps.best ? ` Best day: ${dayName(steps.best.date)}, ${nf(steps.best.steps)}.` : ""}
            </p>
          )}
        </>
      ),
    });
  }

  if (weight.change != null) {
    const c = weight.change;
    slides.push({
      key: "weight",
      theme: T.ink,
      ghost: "KG",
      body: (
        <>
          <Kicker t={T.ink}>Your weight</Kicker>
          <div className="recap-serif mt-4 text-[80px] font-black leading-none" style={{ color: T.ink.accent }}>
            {c > 0 ? "+" : c < 0 ? "−" : ""}
            {Math.abs(c)}
            <span className="text-3xl"> kg</span>
          </div>
          <p className="mt-3 text-[15px]" style={{ color: T.ink.muted }}>
            From {weight.start} kg to {weight.end} kg this {noun}.
          </p>
        </>
      ),
    });
  }

  return slides;
}

export function RecapStory({ recap, links }: { recap: Recap; links: { label: string; href: string; on: boolean }[] }) {
  const router = useRouter();
  const content = recap.hasData ? buildSlides(recap) : [];
  const t = recap.range;
  const outroTheme = THEMES.orange;
  const top3 = [
    recap.training.activeDays ? { v: `${recap.training.activeDays}`, l: "active days" } : null,
    recap.training.minutes ? { v: hm(recap.training.minutes), l: "moving" } : null,
    recap.food.daysLogged ? { v: `${recap.food.daysLogged}`, l: "days of food logged" } : null,
    recap.sleep.avgHours != null ? { v: `${recap.sleep.avgHours} h`, l: "sleep a night" } : null,
    recap.steps.total ? { v: nf(recap.steps.total), l: "steps" } : null,
  ]
    .filter((x): x is { v: string; l: string } => !!x)
    .slice(0, 3);

  const shareText = `My ${t.noun} on LeGYMdary (${t.label}): ${top3.map((x) => `${x.v} ${x.l}`).join(", ")}.`;
  const slides: Slide[] = [
    ...content,
    {
      key: "outro",
      theme: outroTheme,
      ghost: "FIN",
      body: (
        <>
          <Kicker t={outroTheme}>{recap.hasData ? `Your ${t.noun} in ${top3.length} numbers` : "Not much to show yet"}</Kicker>
          {recap.hasData ? (
            <ul className="mt-5 space-y-4">
              {top3.map((x) => (
                <li key={x.l}>
                  <div className="recap-serif text-5xl font-black leading-none">{x.v}</div>
                  <div className="text-sm font-semibold uppercase tracking-wider" style={{ color: outroTheme.muted }}>
                    {x.l}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="recap-serif mt-5 text-3xl font-bold leading-tight">
              Log a few workouts, meals or nights of sleep and your recap fills in.
            </p>
          )}
          <div className="relative z-10 mt-8 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            {recap.hasData && (
              <button
                onClick={async () => {
                  try {
                    if (navigator.share) await navigator.share({ title: `My ${t.noun} in review`, text: shareText });
                    else await navigator.clipboard.writeText(shareText);
                  } catch {
                    /* cancelled */
                  }
                }}
                className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold"
                style={{ background: outroTheme.fg, color: outroTheme.bg }}
              >
                <ShareIcon className="h-4 w-4" /> Share
              </button>
            )}
            {links
              .filter((l) => !l.on)
              .map((l) => (
                <Link key={l.href} href={l.href} className="rounded-full border-2 px-4 py-2 text-sm font-bold" style={{ borderColor: outroTheme.fg }}>
                  {l.label}
                </Link>
              ))}
          </div>
        </>
      ),
    },
  ];

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const last = slides.length - 1;
  const close = useCallback(() => router.push("/stats"), [router]);
  const next = useCallback(() => setI((v) => Math.min(last, v + 1)), [last]);
  const prev = useCallback(() => setI((v) => Math.max(0, v - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = o;
    };
  }, [next, prev, close]);

  const s = slides[i];
  return (
    <div
      className="fixed inset-0 z-[70] flex select-none items-stretch justify-center bg-black"
      role="region"
      aria-roledescription="story"
      aria-label={`Recap ${t.label}`}
    >
      <div
        className="relative flex h-full w-full max-w-md flex-col overflow-hidden transition-colors duration-500"
        style={{ background: s.theme.bg, color: s.theme.fg }}
        onPointerDown={() => {
          held.current = false;
          holdTimer.current = setTimeout(() => {
            held.current = true;
            setPaused(true);
          }, 220);
        }}
        onPointerUp={(e) => {
          if (holdTimer.current) clearTimeout(holdTimer.current);
          if (held.current) {
            setPaused(false);
            return;
          }
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          if (e.clientX - rect.left < rect.width * 0.3) prev();
          else next();
        }}
        onPointerLeave={() => {
          if (holdTimer.current) clearTimeout(holdTimer.current);
          if (held.current) setPaused(false);
        }}
      >
        {/* progress */}
        <div className="flex gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          {slides.map((sl, k) => (
            <div key={sl.key} className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: `${s.theme.fg}33` }}>
              <div
                key={`${sl.key}-${k === i ? "on" : "off"}`}
                className={cn("h-full rounded-full", k === i && i < last && "recap-progress")}
                style={{
                  background: s.theme.fg,
                  width: k < i ? "100%" : k === i && i === last ? "100%" : k === i ? undefined : "0%",
                  animationDuration: `${DURATION}ms`,
                  animationPlayState: paused ? "paused" : "running",
                }}
                onAnimationEnd={next}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="text-[11px] font-black tracking-[0.18em]">
            REWIND<span style={{ color: s.theme.accent }}>.</span>
          </span>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => {
              e.stopPropagation();
              close();
            }}
            aria-label="Close recap"
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ background: `${s.theme.fg}22` }}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* giant background word */}
        <div
          aria-hidden
          className="recap-serif pointer-events-none absolute -right-6 top-[18%] select-none text-[150px] font-black italic leading-none"
          style={{ color: "transparent", WebkitTextStroke: `1.5px ${s.theme.ghost}` }}
        >
          {s.ghost}
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full"
          style={{ background: s.theme.ghost }}
        />

        <div key={s.key} className="recap-in relative flex flex-1 flex-col justify-center px-6 pb-10">
          {s.body}
        </div>

        <div className="flex items-center justify-between px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: s.theme.muted }}>
          <span>
            {i + 1} / {slides.length}
          </span>
          <span>LeGYMdary · {t.label}</span>
        </div>
      </div>
    </div>
  );
}
