"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const KEY = "oneup.theme";
type Choice = "system" | "light" | "dark";

function read(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Auto: dark when the phone is dark, or from 7 pm to 7 am on the phone's clock. */
function autoTheme(): "light" | "dark" {
  const h = new Date().getHours();
  const night = h >= 19 || h < 7;
  return window.matchMedia("(prefers-color-scheme: dark)").matches || night ? "dark" : "light";
}

function apply(choice: Choice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {}
  const w = window as Window & { __applyTheme?: () => void };
  if (w.__applyTheme) w.__applyTheme();
  else document.documentElement.dataset.theme = choice === "system" ? autoTheme() : choice;
  listeners.forEach((l) => l());
}

/** Light / Dark / Auto (dark at night or when the phone is dark). */
export function ThemeToggle({ className }: { className?: string }) {
  const choice = useSyncExternalStore(subscribe, read, () => "system" as Choice);
  const opts: { v: Choice; label: string; icon: React.ReactNode }[] = [
    { v: "light", label: "Light", icon: <SunIcon className="h-4 w-4" /> },
    { v: "dark", label: "Dark", icon: <MoonIcon className="h-4 w-4" /> },
    { v: "system", label: "Auto", icon: <span className="h-3.5 w-3.5 rounded-full border-2 border-current [clip-path:inset(0_0_0_50%)] bg-current" /> },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("flex gap-1 rounded-full bg-white/[0.06] p-1", className)}>
      {opts.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={choice === o.v}
          onClick={() => apply(o.v)}
          className={cn(
            "press flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-xs font-medium",
            choice === o.v ? "bg-citron text-carbon" : "text-zinc-400 hover:text-zinc-200",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
