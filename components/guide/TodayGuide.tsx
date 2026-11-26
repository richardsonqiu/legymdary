"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { CheckIcon } from "@/components/icons";
import { Card } from "@/components/ui";
import type { Readiness } from "@/lib/energy";
import type { DailyTargets } from "@/lib/nutrition";
import type { ConsistencyDay, DayTotals } from "@/lib/queries";
import { activeDaysInWeek, isActiveDay, WEEKLY_TARGET } from "@/lib/streaks";
import { cn, formatMedium, formatShort, todayStr } from "@/lib/utils";

const noop = () => () => {};

export type GuideInput = {
  // body
  weight: number | null;
  weightDate: string | null;
  bodyFat: number | null;
  bodyFatSource: string | null;
  scan: { date: string; muscleChange: number | null; fatChange: number | null; legAdvice: boolean } | null;
  // goal / plan
  goalText: string | null; // e.g. "Lose to 69.4 kg (20% body fat)"
  eta: string | null;
  weeklyRate: number | null;
  direction: "lose" | "gain" | "maintain";
  targets: DailyTargets;
  hasGoal: boolean;
  // data
  totals: DayTotals[];
  consistency: ConsistencyDay[];
  readinessByDate: Record<string, Readiness | null>;
  sleepDebtHours: number | null;
  garminConnected: boolean;
  /** Today's meal slots that have food, and the ones marked as skipped. */
  loggedSlots: string[];
  skippedSlots: string[];
  // onboarding
  hasMeal: boolean;
  hasWorkout: boolean;
  hasScan: boolean;
};

type Action = { key: string; text: string; href: string; done: boolean };
type Stat = { label: string; value: string; sub?: string; warn?: boolean };

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
const num = (v: number) => Math.round(v).toLocaleString("en-US");

export function TodayGuide({ g }: { g: GuideInput }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <div className="h-72 animate-pulse rounded-3xl border border-zinc-800 bg-zinc-900/50" />;
  const today = todayStr();
  const hour = new Date().getHours();
  const t = g.totals.find((d) => d.date === today);
  const byDate = new Map(g.consistency.map((d) => [d.date, d]));
  const trainedToday = isActiveDay(byDate.get(today));
  const weekActive = activeDaysInWeek(byDate, today);
  const readiness = g.readinessByDate[today] ?? null;
  const weighedRecently = g.weightDate != null && (Date.parse(today) - Date.parse(g.weightDate)) / 86_400_000 <= 7;

  /* ---------- 1. Now: numbers, not sentences ---------- */
  const now: Stat[] = [];
  now.push(
    g.weight != null
      ? {
          label: "Weight",
          value: `${g.weight} kg`,
          sub: [g.bodyFat != null ? `${g.bodyFat}% body fat` : null, formatShort(g.weightDate!)].filter(Boolean).join(" · "),
        }
      : { label: "Weight", value: "Not set", sub: "Add it on Progress", warn: true },
  );
  if (g.scan?.muscleChange != null && g.scan.fatChange != null) {
    now.push({
      label: "Since last scan",
      value: `Muscle ${signed(g.scan.muscleChange)} kg`,
      sub: `Fat ${signed(g.scan.fatChange)} kg`,
      warn: g.scan.muscleChange < 0 && g.scan.fatChange > 0,
    });
  }
  now.push({ label: "Workouts this week", value: `${weekActive}`, sub: weekActive >= WEEKLY_TARGET ? `Goal of ${WEEKLY_TARGET} hit` : `Goal ${WEEKLY_TARGET}` });
  if (g.targets) {
    now.push({
      label: "Eaten today",
      value: `${num(t?.calories ?? 0)} kcal`,
      sub: [
        `of ${num(g.targets.calories)}`,
        g.targets.protein ? `${Math.round(t?.protein ?? 0)}/${g.targets.protein} g protein` : null,
        g.skippedSlots.length ? `skipped ${g.skippedSlots.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }

  /* ---------- 3. Today's actions ---------- */
  const actions: Action[] = [];
  const meals = t?.count ?? 0;
  // The next main meal for this time of day, passing over meals you skipped or already logged.
  const MAIN = ["breakfast", "lunch", "dinner"] as const;
  const fromSlot = hour < 11 ? 0 : hour < 16 ? 1 : 2;
  const nextMeal =
    hour >= 21
      ? "your next meal"
      : (MAIN.slice(fromSlot).find((s) => !g.skippedSlots.includes(s) && !g.loggedSlots.includes(s)) ?? "your next meal");
  const allSkipped = MAIN.every((s) => g.skippedSlots.includes(s));
  actions.push({
    key: "log",
    text:
      meals > 0
        ? `Food logged (${meals} meal${meals === 1 ? "" : "s"})`
        : allSkipped
          ? "All meals skipped today"
          : `Log ${nextMeal}`,
    href: "/food",
    done: meals > 0 || allSkipped,
  });
  if (g.targets?.protein) {
    const left = Math.round(g.targets.protein - (t?.protein ?? 0));
    actions.push({
      key: "protein",
      text: left > 0 ? `Eat ${left} g more protein` : "Protein goal hit",
      href: "/food",
      done: left <= 0,
    });
  }
  if (weekActive < WEEKLY_TARGET || trainedToday) {
    const easy = readiness?.verdict === "easy";
    actions.push({
      key: "train",
      text: trainedToday
        ? "Workout done"
        : easy
          ? "Easy day: walk or stretch"
          : g.scan?.legAdvice
            ? "Train today, legs first"
            : "Train today",
      href: easy ? "/insights" : "/log",
      done: trainedToday,
    });
  }
  if (!weighedRecently) actions.push({ key: "weigh", text: "Weigh in", href: "/stats", done: false });
  if (g.sleepDebtHours != null && g.sleepDebtHours >= 2) {
    actions.push({ key: "sleep", text: `Sleep earlier tonight (${g.sleepDebtHours} h behind this week)`, href: "/insights", done: false });
  }
  const shown = actions.slice(0, 5);
  const doneCount = shown.filter((a) => a.done).length;

  return (
    <div className="space-y-3">
      <Onboarding g={g} />
      <Card className="space-y-5">
        <Step n={1} title="Now">
          <div className="grid grid-cols-2 gap-2">
            {now.map((x) => (
              <div key={x.label} className="rounded-2xl bg-white/[0.04] px-3 py-2.5">
                <div className="text-[11px] text-zinc-400">{x.label}</div>
                <div className={cn("mt-0.5 font-semibold tabular-nums", x.warn && "text-amber-200")}>{x.value}</div>
                {x.sub && <div className={cn("text-xs tabular-nums", x.warn ? "text-amber-200/80" : "text-zinc-400")}>{x.sub}</div>}
              </div>
            ))}
          </div>
        </Step>

        <Step n={2} title="Target">
          {g.hasGoal && g.goalText ? (
            <div className="space-y-2">
              <div>
                <div className="font-semibold">{g.goalText}</div>
                {(g.eta || (g.weeklyRate && g.direction !== "maintain")) && (
                  <div className="text-xs text-zinc-400">
                    {[
                      g.eta ? `By ${formatMedium(g.eta)}` : null,
                      g.weeklyRate && g.direction !== "maintain" ? `${g.weeklyRate} kg a week` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
              </div>
              {g.targets && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Mini label="Calories" value={num(g.targets.calories)} />
                  <Mini label="Protein" value={g.targets.protein ? `${g.targets.protein} g` : "–"} />
                  <Mini label="Workouts" value={`${WEEKLY_TARGET} a week`} />
                </div>
              )}
            </div>
          ) : (
            <Link href="/plan" className="text-sm font-medium text-amber-200 underline">
              Set a goal (takes a minute)
            </Link>
          )}
        </Step>

        <Step n={3} title={`Today · ${doneCount}/${shown.length} done`}>
          <ul className="space-y-1.5">
            {shown.map((a) => (
              <li key={a.key}>
                <Link
                  href={a.href}
                  className={cn(
                    "press flex items-center gap-3 rounded-xl border px-3 py-2.5",
                    a.done ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      a.done ? "border-emerald-400 bg-emerald-400 text-zinc-950" : "border-zinc-600",
                    )}
                  >
                    {a.done && <CheckIcon className="h-3.5 w-3.5" />}
                  </span>
                  <span className={cn("text-sm font-medium", a.done && "text-emerald-200")}>{a.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Step>
      </Card>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] px-2 py-2">
      <div className="text-[11px] text-zinc-400">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-citron text-xs font-bold text-carbon">{n}</div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</div>
        {children}
      </div>
    </div>
  );
}

function Onboarding({ g }: { g: GuideInput }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem("legymdary.onboarding.hidden") === "1";
    } catch {
      return false;
    }
  });
  const steps = [
    { text: "Set your goal", href: "/plan", done: g.hasGoal },
    { text: "Add your weight (or an InBody scan)", href: "/stats", done: g.weight != null },
    { text: "Log your first meal", href: "/food", done: g.hasMeal },
    { text: "Log your first workout", href: "/log", done: g.hasWorkout },
    { text: "Connect Garmin or Apple Health (optional)", href: "/connect", done: g.garminConnected },
    { text: "Add an InBody scan (optional)", href: "/stats", done: g.hasScan },
  ];
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  return (
    <Card className="space-y-3 border-sky-500/30 bg-sky-500/5">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold">Getting started · {done}/{steps.length}</div>
        <button
          className="text-xs text-zinc-500 underline"
          onClick={() => {
            try {
              localStorage.setItem("legymdary.onboarding.hidden", "1");
            } catch {
              /* ignore */
            }
            setHidden(true);
          }}
        >
          Hide
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="bar-fill h-full rounded-full bg-sky-400" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ul className="grid gap-1.5">
        {steps.map((s) => (
          <li key={s.text}>
            <Link href={s.href} className={cn("flex items-center gap-2 text-sm", s.done ? "text-zinc-500 line-through" : "text-zinc-200")}>
              <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border text-[10px]", s.done ? "border-sky-400 bg-sky-400 text-zinc-950" : "border-zinc-600")}>
                {s.done ? "✓" : ""}
              </span>
              {s.text}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
