"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { ArrowDownIcon, ArrowUpIcon, BarsIcon, FlameIcon, ForkIcon, TargetIcon, TrophyIcon, XIcon } from "@/components/icons";
import { Portal } from "@/components/Portal";
import { claimBurnBonus } from "@/lib/actions";
import type { Nudge } from "@/lib/nudges";
import { cn } from "@/lib/utils";

const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString("en-US");
const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

// localStorage can be missing or blocked; the popup then simply shows again later.
const store = {
  get(k: string) {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};
const OFF_TRACK_GAP_MS = 3 * 86_400_000;

function seen(n: Nudge): boolean {
  if (store.get(`nudge:${n.id}`)) return true;
  if (n.kind === "offTrack") {
    const last = Number(store.get("nudge:last:offTrack") ?? 0);
    if (Date.now() - last < OFF_TRACK_GAP_MS) return true;
  }
  return false;
}

const noop = () => () => {};

function Confetti() {
  const colors = ["#5eead4", "#fbbf24", "#f472b6", "#93c5fd", "#a7f3d0", "#fdba74"];
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-56 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece absolute top-0 block h-2.5 w-1.5 rounded-sm"
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 7) * 0.08}s`,
            animationDuration: `${1.6 + (i % 5) * 0.25}s`,
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/** One celebratory / encouraging / warning popup, shown once. */
export function NudgePopup({ nudge }: { nudge: Nudge | null }) {
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [closed, setClosed] = useState(false);
  const [after, setAfter] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const show = mounted && !!nudge && !closed && !(nudge.kind === "burn" && nudge.claimed > 0) && !seen(nudge);

  useEffect(() => {
    if (!show) return;
    navigator.vibrate?.(nudge!.kind === "offTrack" ? 30 : [20, 40, 20]);
  }, [show, nudge]);

  if (!show || !nudge) return null;

  function close() {
    store.set(`nudge:${nudge!.id}`, "1");
    if (nudge!.kind === "offTrack") store.set("nudge:last:offTrack", String(Date.now()));
    setClosed(true);
  }
  function claim(amount: number) {
    start(async () => {
      const r = await claimBurnBonus(amount);
      if ("error" in r) {
        setAfter(r.error);
        return;
      }
      setAfter(`+${fmt(amount)} kcal added to today. Enjoy it.`);
      router.refresh();
      setTimeout(close, 1400);
    });
  }
  function keep() {
    setAfter("Saved as extra deficit. That's the fast lane. 🔥");
    setTimeout(close, 1400);
  }

  const celebrate = nudge.kind !== "offTrack";
  const tone =
    nudge.kind === "burn"
      ? "from-orange-400/30 via-rose-400/15"
      : nudge.kind === "onTrack"
        ? "from-emerald-400/30 via-teal-400/15"
        : "from-amber-400/30 via-amber-400/10";

  return (
    <Portal>
      <div className="animate-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={close}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={nudge.kind === "burn" ? "Big burn day" : nudge.kind === "onTrack" ? "On track" : "Heads up"}
          onClick={(e) => e.stopPropagation()}
          className="animate-sheet pb-safe relative w-full max-w-md overflow-hidden rounded-t-3xl border border-zinc-800 bg-zinc-950 sm:rounded-3xl"
        >
          <div className={cn("absolute inset-x-0 top-0 h-48 bg-gradient-to-b to-transparent", tone)} />
          {celebrate && <Confetti />}
          <button onClick={close} aria-label="Close" className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10">
            <XIcon className="h-4 w-4" />
          </button>

          <div className="relative space-y-4 px-5 pb-5 pt-8 text-center">
            {nudge.kind === "burn" && (
              <>
                <Badge className="bg-gradient-to-br from-orange-400 to-rose-500">
                  <FlameIcon className="h-9 w-9 text-white" />
                </Badge>
                <div>
                  <div className="text-sm font-medium uppercase tracking-wider text-orange-200">Big burn day</div>
                  <div className="mt-1 text-4xl font-bold tabular-nums">+{fmt(nudge.extra)}</div>
                  <div className="text-sm text-zinc-400">kcal above your usual</div>
                </div>
                <div className="flex justify-center gap-2 text-xs">
                  <Pill icon={<TrophyIcon className="h-3.5 w-3.5 text-amber-300" />}>{ord(nudge.monthCount)} this month</Pill>
                  <Pill icon={<ForkIcon className="h-3.5 w-3.5 text-sky-300" />}>earned +{fmt(nudge.earned)}</Pill>
                </div>
                {after ? (
                  <p className="rounded-xl bg-white/[0.06] px-3 py-3 text-sm text-zinc-100">{after}</p>
                ) : nudge.canClaim ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => claim(nudge.earned)}
                      disabled={pending}
                      className="press rounded-2xl border border-sky-300/30 bg-sky-300/10 px-3 py-3 text-sm font-semibold text-sky-100"
                    >
                      <ForkIcon className="mx-auto mb-1 h-5 w-5" />
                      Eat +{fmt(nudge.earned)}
                      <span className="block text-[11px] font-normal text-sky-200/70">today only</span>
                    </button>
                    <button
                      onClick={keep}
                      disabled={pending}
                      className="press rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-3 text-sm font-semibold text-emerald-100"
                    >
                      <ArrowDownIcon className="mx-auto mb-1 h-5 w-5" />
                      Keep as deficit
                      <span className="block text-[11px] font-normal text-emerald-200/70">reach goal sooner</span>
                    </button>
                  </div>
                ) : (
                  <button onClick={close} className="press w-full rounded-2xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-950">
                    Nice!
                  </button>
                )}
              </>
            )}

            {nudge.kind === "onTrack" && (
              <>
                <Badge className="bg-gradient-to-br from-emerald-400 to-teal-500">
                  <TargetIcon className="h-9 w-9 text-white" />
                </Badge>
                <div>
                  <div className="text-sm font-medium uppercase tracking-wider text-emerald-200">Right direction</div>
                  <div className="mt-1 text-2xl font-bold">You&apos;re doing great</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat icon={nudge.direction === "lose" ? <ArrowDownIcon className="h-4 w-4 text-emerald-300" /> : <ArrowUpIcon className="h-4 w-4 text-emerald-300" />} value={fmt(nudge.weekBalance)} label={nudge.direction === "lose" ? "deficit · 7 days" : "surplus · 7 days"} />
                  <Stat icon={<BarsIcon className="h-4 w-4 text-sky-300" />} value={nudge.kgChange != null ? `${nudge.kgChange > 0 ? "+" : ""}${nudge.kgChange} kg` : "–"} label="per week" />
                  <Stat icon={<TrophyIcon className="h-4 w-4 text-amber-300" />} value={String(nudge.streak)} label={nudge.streak === 1 ? "day on target" : "days on target"} />
                </div>
                <button onClick={close} className="press w-full rounded-2xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-950">
                  Keep going
                </button>
              </>
            )}

            {nudge.kind === "offTrack" && (
              <>
                <Badge className="bg-gradient-to-br from-amber-400 to-orange-500">
                  <TargetIcon className="h-9 w-9 text-white" />
                </Badge>
                <div>
                  <div className="text-sm font-medium uppercase tracking-wider text-amber-200">Heads up</div>
                  <div className="mt-1 text-xl font-bold">
                    {nudge.direction === "lose" ? "This isn't matching your goal yet" : "Eating too little to gain"}
                  </div>
                </div>
                <div className="flex justify-center gap-1.5" aria-label={`${nudge.overDays} of the last ${nudge.of} days missed the target`}>
                  {Array.from({ length: nudge.of }, (_, i) => (
                    <span key={i} className={cn("h-3 w-8 rounded-full", i < nudge.overDays ? "bg-amber-400" : "bg-emerald-400/70")} />
                  ))}
                </div>
                <div className="text-sm text-zinc-300">
                  {nudge.overDays} of {nudge.of} days {nudge.direction === "lose" ? "over" : "under"} target · about{" "}
                  <b className="tabular-nums">{fmt(nudge.avgOver)}</b> kcal a day
                </div>
                <div className="flex flex-wrap justify-center gap-1.5 text-xs">
                  {nudge.direction === "lose" ? (
                    <>
                      <Pill icon={<FlameIcon className="h-3.5 w-3.5 text-orange-300" />}>30 min walk: 150 kcal</Pill>
                      <Pill icon={<ForkIcon className="h-3.5 w-3.5 text-sky-300" />}>lighter dinner</Pill>
                      {nudge.lowActivity && <Pill icon={<BarsIcon className="h-3.5 w-3.5 text-zinc-300" />}>move a bit more</Pill>}
                    </>
                  ) : (
                    <>
                      <Pill icon={<ForkIcon className="h-3.5 w-3.5 text-sky-300" />}>add a snack</Pill>
                      <Pill icon={<FlameIcon className="h-3.5 w-3.5 text-orange-300" />}>eat more on training days</Pill>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/stats#balance" onClick={close} className="press rounded-2xl border border-white/10 py-3 text-sm font-semibold text-zinc-100">
                    See my week
                  </Link>
                  <button onClick={close} className="press rounded-2xl bg-zinc-100 py-3 text-sm font-semibold text-zinc-950">
                    Got it
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <div className={cn("badge-pop mx-auto flex h-20 w-20 items-center justify-center rounded-3xl shadow-lg", className)}>{children}</div>;
}
function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/[0.07] px-2.5 py-1 text-zinc-200">
      {icon}
      {children}
    </span>
  );
}
function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-2 py-2.5">
      <div className="flex items-center justify-center gap-1">
        {icon}
        <span className="text-base font-semibold tabular-nums">{value}</span>
      </div>
      <div className="mt-0.5 text-[10px] text-zinc-400">{label}</div>
    </div>
  );
}
