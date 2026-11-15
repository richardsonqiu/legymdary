"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { CheckIcon } from "@/components/icons";
import { Card } from "@/components/ui";
import type { Readiness } from "@/lib/energy";
import type { DailyTargets } from "@/lib/nutrition";
import type { ConsistencyDay, DayTotals } from "@/lib/queries";
import { activeDaysInWeek, isActiveDay, WEEKLY_TARGET } from "@/lib/streaks";
import { cn, formatMedium, todayStr } from "@/lib/utils";

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
  // onboarding
  hasMeal: boolean;
  hasWorkout: boolean;
  hasScan: boolean;
};

type Action = { key: string; text: string; why: string; href: string; done: boolean; hint?: string };

export function TodayGuide({ g }: { g: GuideInput }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <div className="h-72 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />;
  const today = todayStr();
  const hour = new Date().getHours();
  const t = g.totals.find((d) => d.date === today);
  const byDate = new Map(g.consistency.map((d) => [d.date, d]));
  const trainedToday = isActiveDay(byDate.get(today));
  const weekActive = activeDaysInWeek(byDate, today);
  const readiness = g.readinessByDate[today] ?? null;
  const weighedRecently = g.weightDate != null && (Date.parse(today) - Date.parse(g.weightDate)) / 86_400_000 <= 7;

  /* ---------- 1. Where you are ---------- */
  const now: { icon: string; text: string; tone?: "good" | "warn" }[] = [];
  if (g.weight != null) {
    const bf = g.bodyFat != null ? ` and ${g.bodyFat}% body fat` : "";
    const src = g.bodyFatSource === "inbody" ? " (InBody)" : "";
    now.push({ icon: "⚖️", text: `You weigh ${g.weight} kg${bf}${src}, measured ${formatMedium(g.weightDate!)}.` });
  } else {
    now.push({ icon: "⚖️", text: "We don't know your weight yet — add it so your targets fit your body.", tone: "warn" });
  }
  if (g.scan?.muscleChange != null && g.scan.fatChange != null) {
    const bad = g.scan.muscleChange < 0 && g.scan.fatChange > 0;
    now.push({
      icon: "🧬",
      text: `Since your previous scan: muscle ${g.scan.muscleChange > 0 ? "+" : ""}${g.scan.muscleChange} kg, fat ${g.scan.fatChange > 0 ? "+" : ""}${g.scan.fatChange} kg.${bad ? " Goal: turn this around — keep muscle, lose fat." : ""}`,
      tone: bad ? "warn" : "good",
    });
  }
  if (readiness) {
    now.push({
      icon: readiness.verdict === "push" ? "🟢" : readiness.verdict === "normal" ? "🔵" : "🟠",
      text: `Recovery: ${readiness.headline.toLowerCase()} — ${readiness.advice.charAt(0).toLowerCase()}${readiness.advice.slice(1)}`,
      tone: readiness.verdict === "easy" ? "warn" : "good",
    });
  }
  now.push({
    icon: "💪",
    text:
      weekActive >= WEEKLY_TARGET
        ? `This week you've trained ${weekActive} days — weekly goal of ${WEEKLY_TARGET} done!`
        : `This week you've trained ${weekActive} of ${WEEKLY_TARGET} days.`,
    tone: weekActive >= WEEKLY_TARGET ? "good" : undefined,
  });
  if (g.targets) {
    now.push({
      icon: "🍽️",
      text: `Today you've eaten ${Math.round(t?.calories ?? 0).toLocaleString("en-US")} of ${g.targets.calories.toLocaleString("en-US")} kcal${g.targets.protein ? ` and ${Math.round(t?.protein ?? 0)} of ${g.targets.protein} g protein` : ""}.`,
    });
  }

  /* ---------- 3. Do this today ---------- */
  const actions: Action[] = [];
  const meals = t?.count ?? 0;
  const nextMeal = hour < 11 ? "breakfast" : hour < 16 ? "lunch" : hour < 21 ? "dinner" : "snacks";
  actions.push({
    key: "log",
    text: meals > 0 ? `Food logged today (${meals} meal${meals === 1 ? "" : "s"})` : `Snap your ${nextMeal}`,
    why: "Logging is the habit that makes everything else work.",
    href: "/food",
    done: meals > 0,
    hint: meals > 0 ? `Keep snapping each meal — ${nextMeal} next.` : undefined,
  });
  if (g.targets?.protein) {
    const left = Math.round(g.targets.protein - (t?.protein ?? 0));
    actions.push({
      key: "protein",
      text: left > 0 ? `Eat ${left} g more protein` : "Protein goal hit",
      why: "Protein protects your muscle while you lose fat.",
      href: "/food",
      done: left <= 0,
    });
  }
  if (weekActive < WEEKLY_TARGET || trainedToday) {
    const easy = readiness?.verdict === "easy";
    actions.push({
      key: "train",
      text: trainedToday
        ? "Workout done today"
        : easy
          ? "Keep it light today: a walk or mobility session"
          : g.scan?.legAdvice
            ? "Do a strength session — start with legs (squats, lunges, RDLs)"
            : "Do a strength session",
      why: easy ? "Your body is still recovering; light movement helps it bounce back." : `${WEEKLY_TARGET} sessions a week keeps you progressing.`,
      href: easy ? "/insights" : "/log",
      done: trainedToday,
    });
  }
  if (!weighedRecently) {
    actions.push({ key: "weigh", text: "Weigh yourself", why: "A weekly weigh-in keeps your plan accurate.", href: "/stats", done: false });
  }
  if (g.sleepDebtHours != null && g.sleepDebtHours >= 2) {
    actions.push({
      key: "sleep",
      text: "Get to bed 30–60 min earlier tonight",
      why: `You're ${g.sleepDebtHours} h short on sleep this week — sleep drives recovery and appetite.`,
      href: "/insights",
      done: false,
    });
  }
  const shown = actions.slice(0, 5);
  const doneCount = shown.filter((a) => a.done).length;

  return (
    <div className="space-y-3">
      <Onboarding g={g} />
      <Card className="space-y-5">
        <Step n={1} title="Where you are now">
          <ul className="space-y-1.5">
            {now.map((x, i) => (
              <li key={i} className={cn("flex gap-2 text-sm", x.tone === "warn" ? "text-amber-200" : "text-zinc-300")}>
                <span className="shrink-0">{x.icon}</span>
                <span>{x.text}</span>
              </li>
            ))}
          </ul>
        </Step>

        <Step n={2} title="Your target">
          {g.hasGoal && g.goalText ? (
            <div className="space-y-1 text-sm text-zinc-300">
              <p>
                🎯 <b className="text-zinc-100">{g.goalText}</b>
                {g.eta ? ` — about ${formatMedium(g.eta)}` : ""}
                {g.weeklyRate && g.direction !== "maintain" ? ` (${g.direction === "lose" ? "−" : "+"}${g.weeklyRate} kg a week)` : ""}.
              </p>
              {g.targets && (
                <p>
                  📋 Every day: <b className="text-zinc-100">{g.targets.calories.toLocaleString("en-US")} kcal</b>
                  {g.targets.protein ? (
                    <>
                      , <b className="text-zinc-100">{g.targets.protein} g protein</b>
                    </>
                  ) : null}
                  ; train <b className="text-zinc-100">{WEEKLY_TARGET}× a week</b>.
                </p>
              )}
            </div>
          ) : (
            <Link href="/plan" className="text-sm text-amber-200 underline">
              Set your goal (target weight or body fat) — it takes 1 minute →
            </Link>
          )}
        </Step>

        <Step n={3} title={`Do this today · ${doneCount}/${shown.length}`}>
          <ul className="space-y-2">
            {shown.map((a) => (
              <li key={a.key}>
                <Link
                  href={a.href}
                  className={cn(
                    "press flex items-start gap-3 rounded-xl border px-3 py-2.5",
                    a.done ? "border-emerald-500/30 bg-emerald-500/10" : "border-zinc-800 bg-zinc-950/40 hover:bg-zinc-800/40",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      a.done ? "border-emerald-400 bg-emerald-400 text-zinc-950" : "border-zinc-600",
                    )}
                  >
                    {a.done && <CheckIcon className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-medium", a.done && "text-emerald-200 line-through decoration-emerald-400/50")}>
                      {a.text}
                    </span>
                    {!a.done && <span className="block text-xs text-zinc-500">{a.why}</span>}
                    {a.done && a.hint && <span className="block text-xs text-emerald-200/60">{a.hint}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Step>
      </Card>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-950">{n}</div>
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
    { text: "Snap your first meal", href: "/food", done: g.hasMeal },
    { text: "Log your first workout", href: "/log", done: g.hasWorkout },
    { text: "Connect Garmin (optional)", href: "/garmin", done: g.garminConnected },
    { text: "Add an InBody scan (optional)", href: "/stats", done: g.hasScan },
  ];
  const done = steps.filter((s) => s.done).length;
  if (hidden || done === steps.length) return null;
  return (
    <Card className="space-y-3 border-sky-500/30 bg-sky-500/5">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold">👋 Getting started · {done}/{steps.length}</div>
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
