"use client";

import { useState, useSyncExternalStore } from "react";

const COLORS = ["#34d399", "#38bdf8", "#a78bfa", "#fbbf24", "#f472b6", "#fafafa"];
const noop = () => () => {};

function seen(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * A one-time celebration banner (with confetti) for a milestone. Each `id`
 * shows once per device; dismissing or seeing it marks it done.
 */
export function Celebration({ id, emoji, title, text }: { id: string; emoji: string; title: string; text: string }) {
  const key = `legymdary.celebrated.${id}`;
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!mounted || dismissed || seen(key)) return null;
  const close = () => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* private mode */
    }
    setDismissed(true);
  };
  return (
    <div className="animate-celebrate relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/20 to-sky-500/10 p-4">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full">
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${(i * 37) % 100}%`,
              background: COLORS[i % COLORS.length],
              animationDelay: `${(i % 7) * 60}ms`,
              ["--dx" as string]: `${((i * 53) % 80) - 40}px`,
              ["--rot" as string]: `${(i * 97) % 720}deg`,
            }}
          />
        ))}
      </div>
      <div className="relative flex items-start gap-3">
        <div className="text-3xl">{emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <p className="text-sm text-zinc-300">{text}</p>
        </div>
        <button onClick={close} className="shrink-0 text-xs text-zinc-400 underline">
          Nice!
        </button>
      </div>
    </div>
  );
}
