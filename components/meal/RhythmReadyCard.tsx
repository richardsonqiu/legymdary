"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ForkIcon, SparkIcon, XIcon } from "@/components/icons";
import { RHYTHM_SEEN_KEY } from "@/components/meal/rhythm-seen";

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const read = () => {
  try {
    return localStorage.getItem(RHYTHM_SEEN_KEY) === "1";
  } catch {
    return true;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(RHYTHM_SEEN_KEY, "1");
  } catch {}
  listeners.forEach((l) => l());
};

/** On Home, once: "Your meal rhythm is ready", until opened or dismissed. */
export function RhythmReadyCard({ label, score, action }: { label: string; score: number; action: string | null }) {
  const seen = useSyncExternalStore(subscribe, read, () => true);
  if (seen) return null;
  return (
    <div className="animate-fade-in relative rounded-3xl border border-teal-300/30 bg-teal-300/[0.07] p-4">
      <button onClick={markSeen} aria-label="Dismiss" className="absolute right-2 top-2 rounded-full p-2 text-zinc-400 hover:bg-white/10">
        <XIcon className="h-4 w-4" />
      </button>
      {/* Food marks it seen when it opens the panel; dismissing here marks it too. */}
      <Link href="/food#meal-timing" className="flex items-start gap-3 pr-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-citron text-carbon">
          <ForkIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-teal-200">
            <SparkIcon className="h-3.5 w-3.5" /> New insight
          </span>
          <span className="block font-semibold">Your meal rhythm is ready</span>
          <span className="block text-sm text-zinc-300">
            {label} · {score}/100{action ? `. ${action}` : ""}
          </span>
          <span className="mt-1 block text-sm font-medium text-teal-200">See your meal timing →</span>
        </span>
      </Link>
    </div>
  );
}
