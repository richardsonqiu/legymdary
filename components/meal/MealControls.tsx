"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { deleteMeal, setMealTime } from "@/lib/actions";
import { fmtClock } from "@/lib/meal-quality";
import { MEAL_TYPES } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

/** Meal type chips and the time it was eaten. */
export function MealTimeEditor({ id, mealType, minutes, estimated }: { id: number; mealType: string; minutes: number; estimated: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState(mealType);
  const [time, setTime] = useState(fmtClock(minutes));
  const [error, setError] = useState<string | null>(null);

  function save(nextType: string, nextTime: string) {
    const m = /^(\d{2}):(\d{2})$/.exec(nextTime);
    if (!m) return;
    setError(null);
    start(async () => {
      const r = await setMealTime({ id, minutes: Number(m[1]) * 60 + Number(m[2]), mealType: nextType });
      if ("error" in r) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="rounded-2xl border border-zinc-800/70 bg-zinc-900 px-3 py-2.5">
        <span className="block text-[10px] uppercase tracking-wide text-zinc-500">Meal type</span>
        <select
          value={type}
          disabled={pending}
          onChange={(e) => {
            setType(e.target.value);
            save(e.target.value, time);
          }}
          className="mt-0.5 w-full bg-transparent text-base font-semibold capitalize outline-none"
        >
          {MEAL_TYPES.map((t) => (
            <option key={t} value={t} className="bg-zinc-900">
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="rounded-2xl border border-zinc-800/70 bg-zinc-900 px-3 py-2.5">
        <span className="block text-[10px] uppercase tracking-wide text-zinc-500">
          Time{estimated ? " (guessed)" : ""}
        </span>
        <input
          type="time"
          value={time}
          disabled={pending}
          onChange={(e) => setTime(e.target.value)}
          onBlur={() => time !== fmtClock(minutes) && save(type, time)}
          className={cn("mt-0.5 w-full bg-transparent text-base font-semibold tabular-nums outline-none", estimated && "text-zinc-400")}
          aria-label="Time eaten"
        />
      </label>
      {error && <p className="col-span-2 text-sm text-amber-300">{error}</p>}
    </div>
  );
}

export function MealActions({ id, back, editHref }: { id: number; back: string; editHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 pt-2">
      <Link href={editHref} className={buttonClass("secondary", "lg", "w-full")}>
        <PencilIcon className="h-4 w-4" /> Edit meal
      </Link>
      <button
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Delete this meal?")) return;
          start(async () => {
            await deleteMeal(id);
            router.replace(back);
          });
        }}
        className="press flex h-11 w-full items-center justify-center gap-2 text-sm font-medium text-rose-300 disabled:opacity-50"
      >
        <TrashIcon className="h-4 w-4" /> Delete
      </button>
      <Link href={back} className={buttonClass("primary", "lg", "w-full")}>
        Done
      </Link>
    </div>
  );
}
