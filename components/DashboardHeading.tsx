"use client";

import { format } from "date-fns";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** false during SSR / first paint, true after mount — no setState-in-effect. */
function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** Greeting + today's date computed in the user's local timezone (client). */
export function DashboardHeading({ firstName }: { firstName: string | null }) {
  const mounted = useMounted();
  const now = mounted ? new Date() : null;
  const h = now?.getHours() ?? -1;
  const greet =
    h < 0
      ? "Welcome"
      : h < 12
        ? "Good morning"
        : h < 18
          ? "Good afternoon"
          : "Good evening";
  const date = now ? format(now, "EEE, d MMM yyyy") : "";

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-zinc-100/80 [text-shadow:0_1px_8px_rgba(0,0,0,0.45)]">
        LeGYMdary
      </p>
      <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]">
        {greet}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="min-h-[1.25rem] text-sm text-zinc-100/85 [text-shadow:0_1px_8px_rgba(0,0,0,0.45)]">{date}</p>
    </div>
  );
}
