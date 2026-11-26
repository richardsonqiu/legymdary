"use client";

import { useEffect, useState } from "react";

const KEY = "oneup.booted";

/**
 * Opening screen, once per app session: "one up." rises in and the full stop
 * pops, then it fades to the
 * app. Rendered on the server so it shows before JavaScript loads; an inline
 * script hides it (data-booted) when it has already played this session.
 */
export function LaunchSplash() {
  const [state, setState] = useState<"show" | "leaving" | "gone">("show");

  useEffect(() => {
    const root = document.documentElement;
    let seen = false;
    try {
      seen = sessionStorage.getItem(KEY) === "1";
      sessionStorage.setItem(KEY, "1");
    } catch {}
    // Already played: CSS hides it via data-booted (also on later in-app visits).
    if (seen) {
      root.dataset.booted = "1";
      return;
    }
    const a = setTimeout(() => setState("leaving"), 900);
    const b = setTimeout(() => {
      root.dataset.booted = "1";
      setState("gone");
    }, 1300);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);

  if (state === "gone") return null;
  return (
    <div
      aria-hidden="true"
      className={`launch-splash fixed inset-0 z-[100] flex flex-col items-center justify-center bg-zinc-950 transition-opacity duration-400 ${state === "leaving" ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <p className="text-5xl font-bold tracking-[-0.035em] text-zinc-50">
        <span className="launch-w1 inline-block">one</span> <span className="launch-w2 inline-block">up</span>
        <span className="launch-dot ml-[0.07em] inline-block h-[0.22em] w-[0.22em] rounded-full bg-citron" />
      </p>
      <p className="launch-tag mt-3 text-sm text-zinc-500">One better than yesterday.</p>
    </div>
  );
}
