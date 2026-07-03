"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarsIcon,
  CalendarIcon,
  DumbbellIcon,
  HomeIcon,
  TrophyIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", Icon: HomeIcon },
  { href: "/log", label: "Log", Icon: DumbbellIcon },
  { href: "/history", label: "History", Icon: CalendarIcon },
  { href: "/stats", label: "Stats", Icon: BarsIcon },
  { href: "/prs", label: "PRs", Icon: TrophyIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800/80 bg-zinc-950/85 backdrop-blur-lg">
      <div className="pb-safe mx-auto flex max-w-2xl items-stretch">
        {items.map(({ href, label, Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                active ? "text-zinc-50" : "text-zinc-500 active:text-zinc-300",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-12 items-center justify-center rounded-full transition-colors",
                  active && "bg-zinc-100/10",
                )}
              >
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
