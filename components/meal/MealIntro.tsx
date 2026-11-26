"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { XIcon } from "@/components/icons";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";

const KEY = "oneup.mealIntro.v1";
const SLIDES = [
  {
    image: "salmon",
    title: "Understand your nutrition",
    body: "Logging shows what you eat and when. Over time you'll see which meals keep your energy up and help you recover.",
  },
  {
    image: "blueberry",
    title: "Quality, not just calories",
    body: "Every meal gets a rating, from Limited to Nutritious, based on protein, fiber, processing, added sugar, fats and carbs.",
  },
  {
    image: "sunrise",
    title: "Meal timing and your body clock",
    body: "Eating at regular times keeps energy steady through the day and makes it easier to fall asleep at night.",
  },
  {
    image: "coffee",
    title: "Snap, describe or tap",
    body: "Take a photo, describe it in a few words, or tap a meal you eat often. We work out the numbers.",
  },
];

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
function seen() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
}

/** Four short slides about meal insights. Shows once, then from the info button. */
export function MealIntro({ open, onClose }: { open: boolean; onClose: () => void }) {
  const alreadySeen = useSyncExternalStore(subscribe, seen, () => true);
  const [i, setI] = useState(0);
  const show = open || !alreadySeen;

  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    listeners.forEach((l) => l());
    setI(0);
    onClose();
  };
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <Portal>
      <div role="dialog" aria-modal="true" aria-label="Meal insights" className="animate-fade-in fixed inset-0 z-[60] flex flex-col bg-zinc-950">
        <div className="pb-safe mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 pt-[max(1rem,env(safe-area-inset-top))]">
          <button onClick={close} aria-label="Close" className="press -ml-2 mt-2 flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10">
            <XIcon className="h-6 w-6" />
          </button>
          <div key={i} className="recap-in flex flex-1 flex-col justify-center">
            <div
              className="editorial-photo mx-auto aspect-[4/3] w-full max-w-sm rounded-[28px] bg-center"
              style={{ backgroundImage: `url("/editorial/${s.image}.webp")` }}
              aria-hidden
            />
            <h2 className="mt-8 text-[26px] font-semibold leading-tight tracking-tight">{s.title}</h2>
            <p className="mt-3 text-base leading-relaxed text-zinc-300">{s.body}</p>
          </div>
          <div className="flex items-center gap-6 pb-8 pt-4">
            <div className="flex flex-1 gap-2" aria-label={`Slide ${i + 1} of ${SLIDES.length}`}>
              {SLIDES.map((_, k) => (
                <button key={k} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} className="flex-1 py-2">
                  <span className={cn("block h-[3px] rounded-full", k <= i ? "bg-zinc-50" : "bg-zinc-700")} />
                </button>
              ))}
            </div>
            <button onClick={() => (last ? close() : setI(i + 1))} className="press rounded-full bg-citron px-6 py-2.5 text-sm font-semibold text-carbon">
              {last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
