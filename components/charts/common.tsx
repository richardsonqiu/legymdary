"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const CHART = {
  // Theme variables, so charts follow light / dark mode.
  line: "var(--color-zinc-50)",
  lineSoft: "var(--color-zinc-400)",
  grid: "var(--color-zinc-800)",
  axis: "var(--color-zinc-500)",
  bar: "var(--color-zinc-300)",
  accent: "var(--color-teal-300)",
};

export const tooltipStyle = {
  background: "var(--color-zinc-900)",
  border: "1px solid var(--color-zinc-700)",
  borderRadius: 10,
  color: "var(--color-zinc-50)",
  fontSize: 12,
  padding: "6px 10px",
};

export const tooltipLabelStyle = { color: "var(--color-zinc-400)", marginBottom: 2 };

const emptySubscribe = () => () => {};

/** True only after client-side mount — keeps Recharts off the server render. */
export function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/** Fixed-height wrapper that only mounts the chart client-side. */
export function ChartFrame({
  height = 220,
  children,
}: {
  height?: number;
  children: ReactNode;
}) {
  const mounted = useMounted();
  return (
    <div style={{ height }} className="w-full">
      {mounted ? (
        children
      ) : (
        <div className="h-full w-full animate-pulse rounded-xl bg-zinc-900/60" />
      )}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-xl border border-zinc-800 bg-zinc-900/60 p-0.5",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-citron text-carbon"
              : "text-zinc-400 hover:text-zinc-200",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const RANGE_OPTIONS = [
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "All", value: 0 },
];
