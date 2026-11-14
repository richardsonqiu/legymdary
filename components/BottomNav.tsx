"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarsIcon,
  CalendarIcon,
  DumbbellIcon,
  ForkIcon,
  HomeIcon,
  TrophyIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", Icon: HomeIcon },
  { href: "/log", label: "Log", Icon: DumbbellIcon },
  { href: "/food", label: "Food", Icon: ForkIcon },
  { href: "/history", label: "History", Icon: CalendarIcon },
  { href: "/stats", label: "Stats", Icon: BarsIcon },
  { href: "/prs", label: "PRs", Icon: TrophyIcon },
];

export function BottomNav() {
  const pathname = usePathname();
  const currentIdx = items.findIndex(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800/80 bg-zinc-950/85 backdrop-blur-lg">
      <div className="pb-safe mx-auto flex max-w-2xl items-stretch">
        {items.map(({ href, label, Icon }, idx) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              // Slide toward the tab you picked: right-hand tabs move forward.
              transitionTypes={
                active ? undefined : [currentIdx >= 0 && idx < currentIdx ? "nav-back" : "nav-forward"]
              }
              className={cn(
                "press flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium",
                active ? "text-zinc-50" : "text-zinc-500 active:text-zinc-300",
              )}
            >
              <span className="relative flex h-9 w-11 items-center justify-center">
                {active && (
                  <span className="animate-pill absolute inset-0 rounded-full bg-zinc-100/10" />
                )}
                <Icon className="h-[22px] w-[22px]" />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
