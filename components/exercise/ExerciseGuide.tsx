"use client";

import { useCallback, useEffect, useState } from "react";
import { ExerciseAnimation } from "@/components/exercise/ExerciseAnimation";
import { CheckIcon, InfoIcon, PlayIcon, XIcon } from "@/components/icons";
import { Portal } from "@/components/Portal";
import { guideFor } from "@/lib/exercise-guide";
import type { Pattern } from "@/lib/exercise-motion";
import { PATTERNS } from "@/lib/exercise-patterns";
import { cn } from "@/lib/utils";

/** "How to" button that opens the animated guide. Renders nothing if we have no guide. */
export function ExerciseHowTo({
  name,
  muscleGroup,
  variant = "pill",
  className,
}: {
  name: string;
  muscleGroup?: string | null;
  variant?: "pill" | "icon";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const guide = guideFor(name, muscleGroup);
  if (!guide) return null;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`How to do ${name}`}
        className={cn(
          "press inline-flex shrink-0 items-center justify-center gap-1 font-medium",
          variant === "pill"
            ? "h-7 rounded-full bg-teal-300/15 px-2.5 text-[11px] text-teal-200 hover:bg-teal-300/25"
            : "h-8 w-8 rounded-full bg-teal-300/15 text-teal-200 hover:bg-teal-300/25",
          className,
        )}
      >
        <PlayIcon className={variant === "pill" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        {variant === "pill" && "How to"}
      </button>
      {open && <ExerciseGuideSheet name={name} muscleGroup={muscleGroup} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ExerciseGuideSheet({ name, muscleGroup, onClose }: { name: string; muscleGroup?: string | null; onClose: () => void }) {
  const guide = guideFor(name, muscleGroup);
  const [playing, setPlaying] = useState(true);
  const [half, setHalf] = useState<0 | 1>(0);
  const onPhase = useCallback((h: 0 | 1) => setHalf(h), []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!guide) return null;
  const pattern = PATTERNS[guide.pattern] as Pattern;

  return (
    <Portal>
      <div className="animate-backdrop fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`How to do ${name}`}
          onClick={(e) => e.stopPropagation()}
          className="animate-sheet pb-safe flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-800 bg-zinc-950 sm:rounded-3xl"
        >
          <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">{name}</h2>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {guide.muscles.map((m) => (
                  <span key={m} className="rounded-full bg-teal-300/15 px-2 py-0.5 text-[11px] font-medium text-teal-200">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800">
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto px-5 pb-6">
            <div className="relative mt-2 overflow-hidden rounded-3xl border border-zinc-800/70 bg-zinc-900">
              <ExerciseAnimation pattern={pattern} playing={playing} onPhase={onPhase} className="block w-full" />
              <div className="flex items-center justify-between gap-2 border-t border-zinc-800/70 px-4 py-2.5">
                <span className="text-sm font-medium" aria-live="polite">
                  {pattern.labels[half]}
                </span>
                <button
                  onClick={() => setPlaying((p) => !p)}
                  aria-label={playing ? "Pause" : "Play"}
                  className="press flex h-9 w-9 items-center justify-center rounded-full bg-citron text-carbon"
                >
                  {playing ? (
                    <span className="flex gap-[3px]">
                      <span className="h-3.5 w-[3px] rounded bg-current" />
                      <span className="h-3.5 w-[3px] rounded bg-current" />
                    </span>
                  ) : (
                    <PlayIcon className="ml-0.5 h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {guide.note && <p className="mt-3 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-200">{guide.note}</p>}

            <ol className="mt-4 space-y-3">
              {guide.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-citron text-xs font-semibold text-carbon">{i + 1}</span>
                  <span className="pt-0.5 text-zinc-200">{s}</span>
                </li>
              ))}
            </ol>

            <ul className="mt-4 space-y-2 rounded-2xl border border-zinc-800/70 p-3">
              {guide.tips.map((t) => (
                <li key={t} className="flex gap-2 text-sm text-zinc-300">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
                  {t}
                </li>
              ))}
            </ul>

            {!guide.exact && (
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <InfoIcon className="h-3.5 w-3.5" /> Closest match we have for this exercise.
              </p>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
