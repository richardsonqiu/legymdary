"use client";

import { useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@legymdary/shared";

/** A small "?" that expands a plain-language explanation. */
export function Explain({ k }: { k: GlossaryKey }) {
  const [open, setOpen] = useState(false);
  if (!GLOSSARY[k]) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="What does this mean?"
        className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-600 align-middle text-[10px] font-semibold normal-case leading-none text-zinc-400 hover:border-zinc-400 hover:text-zinc-200"
      >
        ?
      </button>
      {open && (
        <span className="animate-item-in mt-1.5 block rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-zinc-300">
          {GLOSSARY[k]}
        </span>
      )}
    </>
  );
}
