"use client";

import { useEffect, useState } from "react";
import { CheckIcon, ForkIcon, PencilIcon, PinIcon, SearchIcon, XIcon } from "@/components/icons";
import { Button, inputClass } from "@/components/ui";
import { MEAL_TYPES, type MealType } from "@/lib/nutrition";
import { cn, formatPretty } from "@/lib/utils";

export type QuickMeal = {
  id: number;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  photo: string | null;
  /** When it was last eaten (past meals only). */
  date?: string;
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Bottom sheet shell shared by the quick sheets. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
  return (
    <div
      className="animate-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet pb-safe flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-800 bg-zinc-950 sm:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Thumb({ photo, pinned }: { photo: string | null; pinned?: boolean }) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
  ) : (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-zinc-800/70 text-zinc-500">
      {pinned ? <PinIcon className="h-5 w-5" /> : <ForkIcon className="h-5 w-5" />}
    </span>
  );
}

/** "Add this again?" Shows the meal and lets you pick the slot before logging. */
export function ConfirmAddSheet({
  meal,
  dateLabel,
  defaultType,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  meal: QuickMeal;
  dateLabel: string;
  defaultType: MealType;
  busy: boolean;
  error?: string | null;
  onConfirm: (mealType: MealType) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<MealType>(defaultType);
  return (
    <Sheet title="Add this meal?" onClose={onClose}>
      <div className="space-y-4 overflow-y-auto px-5 pb-5">
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
          <Thumb photo={meal.photo} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{meal.name}</div>
            <div className="text-sm tabular-nums text-zinc-300">{fmt(meal.calories)} kcal</div>
            <div className="text-xs tabular-nums text-zinc-500">
              Protein {fmt(meal.protein)} g · Carbs {fmt(meal.carbs)} g · Fat {fmt(meal.fat)} g
            </div>
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm text-zinc-400">Add to {dateLabel} as</div>
          <div className="grid grid-cols-4 gap-1.5">
            {MEAL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                aria-pressed={type === t}
                className={cn(
                  "h-10 rounded-xl text-sm font-medium capitalize transition-colors",
                  type === t ? "bg-citron text-carbon" : "bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-amber-300">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(type)} disabled={busy}>
            {busy ? "Adding…" : `Add · ${fmt(meal.calories)} kcal`}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Pick past meals to pin to My menu, or create one from scratch. */
export function PinPickerSheet({
  meals,
  isPinned,
  busyId,
  error,
  onPin,
  onCreate,
  onClose,
}: {
  meals: QuickMeal[];
  isPinned: (m: QuickMeal) => boolean;
  busyId: number | null;
  error?: string | null;
  onPin: (m: QuickMeal) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const list = query ? meals.filter((m) => m.name.toLowerCase().includes(query)) : meals;
  return (
    <Sheet title="Add to My menu" onClose={onClose}>
      <div className="space-y-3 px-5 pb-3">
        <p className="text-sm text-zinc-400">Pick from meals you have eaten before.</p>
        {meals.length > 6 && (
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search your meals"
              className={cn(inputClass, "h-11 pl-9")}
              aria-label="Search your meals"
            />
          </label>
        )}
        {error && <p className="text-sm text-amber-300">{error}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        {meals.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No meals logged yet. Create one below.</p>
        ) : list.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No meals match “{q}”.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {list.map((m) => {
              const pinned = isPinned(m);
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5">
                  <Thumb photo={m.photo} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.name}</div>
                    <div className="text-xs tabular-nums text-zinc-500">
                      {fmt(m.calories)} kcal{m.date ? ` · last ${formatPretty(m.date)}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => !pinned && onPin(m)}
                    disabled={pinned || busyId != null}
                    aria-label={pinned ? `${m.name} is in My menu` : `Pin ${m.name}`}
                    className={cn(
                      "press flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium",
                      pinned ? "bg-teal-300/10 text-teal-300" : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-60",
                    )}
                  >
                    {pinned ? <CheckIcon className="h-3.5 w-3.5" /> : <PinIcon className="h-3.5 w-3.5" />}
                    {pinned ? "Pinned" : busyId === m.id ? "Pinning…" : "Pin"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t border-white/[0.06] px-5 py-3">
        <Button variant="secondary" className="w-full" onClick={onCreate}>
          <PencilIcon className="h-4 w-4" /> Create a new item instead
        </Button>
      </div>
    </Sheet>
  );
}
