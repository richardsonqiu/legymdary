"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroupFor } from "@legymdary/shared";
import { cn } from "@/lib/utils";

/** Sub-tabs for the current bottom tab (e.g. Train → Workout · History · Exercises). */
export function SubTabs() {
  const pathname = usePathname();
  const group = navGroupFor(pathname);
  const idx = group?.tabs.findIndex((t) => t.href === pathname) ?? -1;
  // Only on the group's main pages — detail pages (an activity, raw data) keep their own back link.
  if (!group || group.tabs.length < 2 || idx < 0) return null;
  return (
    <div className="vt-subtabs mb-5 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1" role="tablist">
      {group.tabs.map((t, i) => {
        const active = i === idx;
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch
            role="tab"
            aria-selected={active}
            transitionTypes={active ? undefined : [i < idx ? "nav-back" : "nav-forward"]}
            className={cn(
              "press flex-1 rounded-lg px-2 py-2 text-center text-sm font-medium transition-colors",
              active ? "bg-citron text-carbon" : "text-zinc-400 hover:text-zinc-200",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
