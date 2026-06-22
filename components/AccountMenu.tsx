"use client";

import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { LogoutIcon } from "@/components/icons";

export function AccountMenu({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (name || email || "?").charAt(0).toUpperCase();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-1.5 shadow-xl animate-fade-in">
          <div className="px-2.5 py-2">
            {name && (
              <div className="truncate text-sm font-medium text-zinc-100">
                {name}
              </div>
            )}
            {email && (
              <div className="truncate text-xs text-zinc-500">{email}</div>
            )}
          </div>
          <div className="my-1 h-px bg-zinc-800" />
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
          >
            <LogoutIcon className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
