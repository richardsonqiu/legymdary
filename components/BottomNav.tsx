"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarsIcon, DumbbellIcon, ForkIcon, HomeIcon, SparkIcon } from "@/components/icons";
import { NAV, navGroupFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS = { home: HomeIcon, train: DumbbellIcon, food: ForkIcon, progress: BarsIcon, insights: SparkIcon } as const;

export function BottomNav() {
  const pathname = usePathname();
  const current = navGroupFor(pathname);
  const currentIdx = current ? NAV.indexOf(current) : -1;

  return (
    <nav className="vt-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-lg">
      <div className="pb-safe mx-auto flex max-w-2xl items-stretch">
        {NAV.map((g, idx) => {
          const active = g === current;
          const Icon = ICONS[g.key as keyof typeof ICONS];
          return (
            <Link
              key={g.key}
              href={g.href}
              // Fully prefetch each tab (data included) so switching is instant.
              prefetch
              aria-current={active ? "page" : undefined}
              // Slide toward the tab you picked: right-hand tabs move forward.
              transitionTypes={active ? undefined : [currentIdx >= 0 && idx < currentIdx ? "nav-back" : "nav-forward"]}
              className={cn(
                "press flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium",
                active ? "text-zinc-50" : "text-zinc-500 active:text-zinc-300",
              )}
            >
              <span className="relative flex h-9 w-12 items-center justify-center">
                {active && <span className="animate-pill absolute inset-0 rounded-full bg-zinc-100/10" />}
                <Icon className="h-[22px] w-[22px]" />
              </span>
              {g.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
