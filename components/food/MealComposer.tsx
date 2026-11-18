"use client";

import { useEffect, useState, useTransition } from "react";
import { PlusIcon, SparkIcon, TrashIcon, XIcon } from "@/components/icons";
import { ItemExplanation } from "@/components/food/ItemExplanation";
import { Portal } from "@/components/Portal";
import { Button, Field, inputClass } from "@/components/ui";
import { analyzeMeal, saveMeal, saveMenuItem, updateMeal } from "@/lib/actions";
import {
  baseOf,
  EATEN_STEPS,
  eatenLabel,
  MEAL_TYPES,
  sumMacros,
  withEaten,
  type MealItem,
  type MealType,
} from "@/lib/nutrition";
import { cn } from "@/lib/utils";

export type ComposerInit = {
  /** Present when editing an existing meal. */
  id?: number;
  date: string;
  mealType: MealType;
  name: string;
  items: MealItem[];
  notes: string;
  /** Downscaled photo for analysis (new meals only). */
  analysisImage?: string | null;
  /** Thumbnail for display + storage. */
  thumb?: string | null;
  aiEstimated?: boolean;
  /** Save to My menu instead of logging a meal. */
  toMenu?: boolean;
};

type Status =
  | { kind: "idle" }
  | { kind: "analyzing" }
  | { kind: "error"; message: string }
  | { kind: "done"; confidence: string; notes: string; notFood: boolean };

const emptyItem = (): MealItem => ({
  name: "",
  portion: "",
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
});

export function MealComposer({
  init,
  onClose,
  onSaved,
}: {
  init: ComposerInit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mealType, setMealType] = useState<MealType>(init.mealType);
  const [name, setName] = useState(init.name);
  const [items, setItems] = useState<MealItem[]>(init.items);
  const [notes, setNotes] = useState(init.notes);
  const [hint, setHint] = useState("");
  const [aiEstimated, setAiEstimated] = useState(!!init.aiEstimated);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const canAnalyze = !!init.analysisImage && !init.id;

  async function runAnalysis() {
    if (!init.analysisImage) return;
    setStatus({ kind: "analyzing" });
    try {
      const res = await analyzeMeal({ image: init.analysisImage, hint });
      if ("error" in res) {
        setStatus({ kind: "error", message: res.error });
        return;
      }
      setStatus({
        kind: "done",
        confidence: res.confidence,
        notes: res.notes,
        notFood: !res.isFood,
      });
      if (res.isFood) {
        setName(res.name);
        setItems(res.items);
        setAiEstimated(true);
      }
    } catch {
      setStatus({
        kind: "error",
        message: "Upload failed. Check your connection and try again.",
      });
    }
  }

  // Lock background scroll while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const totals = sumMacros(items);
  const analyzing = status.kind === "analyzing";
  const validItems = items.filter((i) => i.name.trim());

  function patchItem(idx: number, patch: Partial<MealItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }

  /** Set how much of the whole meal was eaten (applies to every item). */
  function setMealEaten(x: number) {
    setItems((prev) => prev.map((it) => (it.name.trim() ? withEaten(it, x) : it)));
  }
  const eatenValues = validItems.map((i) => i.eaten ?? 1);
  const mealEaten = eatenValues.length && eatenValues.every((v) => v === eatenValues[0]) ? eatenValues[0] : null;

  function save() {
    setSaveError(null);
    startSave(async () => {
      const payload = {
        date: init.date,
        mealType,
        name: name.trim() || validItems[0]?.name || "Meal",
        items: validItems,
        notes,
        aiEstimated,
      };
      try {
        if (init.toMenu) {
          const res = await saveMenuItem({ ...payload, photo: init.thumb ?? null });
          if ("error" in res) throw new Error(res.error);
        } else if (init.id) await updateMeal(init.id, payload);
        else await saveMeal({ ...payload, photo: init.thumb ?? null });
        navigator.vibrate?.(12);
        onSaved();
      } catch (e) {
        setSaveError(init.toMenu && e instanceof Error ? e.message : "Couldn't save. Please try again.");
      }
    });
  }

  return (
    <Portal>
      <div className="animate-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
        <div className="animate-sheet pb-safe flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-zinc-800 bg-zinc-950 sm:rounded-3xl">
          <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
            <h2 className="font-semibold">
              {init.toMenu ? "New menu item" : init.id ? "Edit meal" : "Log meal"}
            </h2>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800"
              aria-label="Close"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            {init.thumb && (
              <div className="relative overflow-hidden rounded-2xl border border-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={init.thumb}
                  alt="Meal photo"
                  className="max-h-64 w-full object-cover"
                />
                {analyzing && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55">
                    <SparkIcon className="h-7 w-7 animate-spin text-zinc-100 [animation-duration:2.5s]" />
                    <p className="text-sm font-medium">Estimating calories…</p>
                  </div>
                )}
              </div>
            )}

            {canAnalyze && (
              <div className="space-y-2">
                <Field label={status.kind === "idle" ? "Tell the AI about this meal (optional)" : "Add or change details"}>
                  <textarea
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    placeholder="What is it, where from, how it was made. e.g. kopi kosong, 2 slices kaya toast, shared with a friend"
                    className={cn(inputClass, "h-auto min-h-[5.5rem] resize-none py-2.5 text-sm")}
                    maxLength={400}
                    rows={3}
                  />
                </Field>
                <Button
                  size="lg"
                  className="w-full"
                  onClick={runAnalysis}
                  disabled={analyzing}
                >
                  <SparkIcon className="h-4 w-4" />
                  {analyzing ? "Estimating…" : status.kind === "idle" ? "Estimate calories" : "Estimate again"}
                </Button>
                {status.kind === "idle" && (
                  <p className="text-center text-xs text-zinc-500">
                    Or skip the AI and fill it in yourself below.
                  </p>
                )}
                {status.kind === "error" && (
                  <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    {status.message}
                  </p>
                )}
                {status.kind === "done" && status.notFood && (
                  <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    This doesn&apos;t look like food. Add details and
                    estimate again, or enter it manually.
                  </p>
                )}
                {status.kind === "done" && !status.notFood && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm">
                    <span
                      className={cn(
                        "mr-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        status.confidence === "high"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : status.confidence === "medium"
                            ? "bg-sky-500/15 text-sky-300"
                            : "bg-amber-500/15 text-amber-300",
                      )}
                    >
                      {status.confidence} confidence
                    </span>
                    <span className="text-zinc-400">{status.notes}</span>
                  </div>
                )}
              </div>
            )}

            {validItems.length > 0 && (
              <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">How much did you eat?</span>
                  {mealEaten != null && mealEaten !== 1 && (
                    <span className="text-xs tabular-nums text-teal-300">{eatenLabel(mealEaten)} of what&apos;s shown</span>
                  )}
                </div>
                <AmountChips value={mealEaten} onPick={setMealEaten} />
                <p className="text-xs text-zinc-500">
                  Change this after your meal too. Half the noodles is ½×, two cookies when the photo shows one is 2×.
                  Use the buttons on an item below to change just that item.
                </p>
              </div>
            )}

            {!init.toMenu && (
            <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1">
              {MEAL_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setMealType(t)}
                  className={cn(
                    "h-9 rounded-lg text-xs font-medium capitalize transition-colors",
                    mealType === t
                      ? "bg-zinc-100 text-zinc-950"
                      : "text-zinc-400",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            )}

            <Field label="Meal name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={analyzing ? "…" : "e.g. Chicken rice"}
                className={inputClass}
                maxLength={120}
              />
            </Field>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Items
                </span>
                <span className="text-xs tabular-nums text-zinc-400">
                  {Math.round(totals.calories)} kcal · P{" "}
                  {Math.round(totals.protein)} · C {Math.round(totals.carbs)} ·
                  F {Math.round(totals.fat)}
                </span>
              </div>
              <ul className="space-y-2">
                {items.map((it, idx) => (
                  <li
                    key={idx}
                    className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                  >
                    {it.dish &&
                      it.dish.trim().toLowerCase() !== it.name.trim().toLowerCase() &&
                      items[idx - 1]?.dish !== it.dish && (
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                          {it.dish}
                        </div>
                      )}
                    <div className="flex gap-2">
                      <input
                        value={it.name}
                        onChange={(e) =>
                          patchItem(idx, { name: e.target.value })
                        }
                        placeholder="Food"
                        className={cn(inputClass, "h-10 min-w-0 flex-1 basis-0 text-sm")}
                      />
                      <input
                        value={it.portion}
                        onChange={(e) =>
                          patchItem(idx, { portion: e.target.value })
                        }
                        placeholder="Portion"
                        className={cn(inputClass, "h-10 w-28! min-w-0 flex-none text-sm")}
                      />
                      <button
                        onClick={() =>
                          setItems((p) => p.filter((_, i) => i !== idx))
                        }
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                        aria-label="Remove item"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {(
                        [
                          ["calories", "kcal"],
                          ["protein", "P g"],
                          ["carbs", "C g"],
                          ["fat", "F g"],
                        ] as const
                      ).map(([k, label]) => (
                        <label key={k} className="block">
                          <span className="mb-1 block text-[10px] uppercase tracking-wide text-zinc-500">
                            {label}
                          </span>
                          <input
                            inputMode="numeric"
                            value={it[k] ? String(it[k]) : ""}
                            placeholder="0"
                            onChange={(e) => {
                              const n = Number(
                                e.target.value.replace(/[^\d.]/g, ""),
                              );
                              const val = Number.isFinite(n) ? n : 0;
                              const amt = it.eaten && it.eaten > 0 ? it.eaten : 1;
                              patchItem(idx, {
                                [k]: val,
                                // Keep the full-portion numbers in step so changing the amount later still works.
                                base: { ...baseOf(it), [k]: val / amt },
                                ...(it.reference ? { edited: true } : {}),
                              });
                            }}
                            className={cn(
                              inputClass,
                              "h-10 px-2.5 text-sm tabular-nums",
                            )}
                          />
                        </label>
                      ))}
                    </div>
                    {it.name.trim() && (
                      <ItemAmount
                        item={it}
                        onChange={(x) => patchItem(idx, withEaten(it, x))}
                      />
                    )}
                    <ItemExplanation item={it} />
                  </li>
                ))}
              </ul>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setItems((p) => [...p, emptyItem()])}
              >
                <PlusIcon className="h-4 w-4" /> Add item
              </Button>
            </div>

            <Field label="Notes (optional)">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClass}
                maxLength={500}
              />
            </Field>
          </div>

          <div className="border-t border-zinc-800/80 px-4 py-3">
            {saveError && (
              <p className="mb-2 text-center text-sm text-amber-300">
                {saveError}
              </p>
            )}
            <Button
              size="lg"
              className="w-full"
              onClick={save}
              disabled={saving || analyzing || validItems.length === 0}
            >
              {saving
                ? "Saving…"
                : `${init.toMenu ? "Add to menu" : "Save"} · ${Math.round(sumMacros(validItems).calories).toLocaleString("en-US")} kcal`}
            </Button>
            {aiEstimated && (
              <p className="mt-2 text-center text-[11px] text-zinc-600">
                Estimates can be off by 20% or more. Adjust the portions if you know better.
              </p>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

function AmountChips({ value, onPick, small }: { value: number | null; onPick: (x: number) => void; small?: boolean }) {
  const custom = value != null && !(EATEN_STEPS as readonly number[]).includes(value);
  return (
    <div className="flex flex-wrap gap-1.5">
      {EATEN_STEPS.map((x) => (
        <button
          key={x}
          type="button"
          onClick={() => onPick(x)}
          aria-pressed={value === x}
          className={cn(
            "rounded-lg border font-medium tabular-nums transition-colors",
            small ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === x
              ? "border-teal-300 bg-teal-300 text-zinc-950"
              : "border-white/10 bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]",
          )}
        >
          {eatenLabel(x)}
        </button>
      ))}
      <label
        className={cn(
          "flex items-center gap-1 rounded-lg border px-2 tabular-nums",
          small ? "text-xs" : "text-sm",
          custom ? "border-teal-300 text-teal-200" : "border-white/10 text-zinc-400",
        )}
      >
        <span>Other</span>
        <input
          inputMode="decimal"
          aria-label="Other amount, in times the portion shown"
          placeholder="1.2"
          value={custom ? String(value) : ""}
          onChange={(e) => {
            const n = Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""));
            if (Number.isFinite(n) && n > 0) onPick(Math.min(10, n));
          }}
          className="w-10 bg-transparent py-1 text-center outline-none placeholder:text-zinc-600"
        />
      </label>
    </div>
  );
}

function ItemAmount({ item, onChange }: { item: MealItem; onChange: (x: number) => void }) {
  const e = item.eaten ?? 1;
  const b = baseOf(item);
  return (
    <div className="space-y-1.5 border-t border-white/[0.06] pt-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">Amount eaten</span>
        {e !== 1 && (
          <span className="tabular-nums text-zinc-400">
            {Math.round(b.calories)} kcal × {eatenLabel(e)} = <b className="text-zinc-100">{item.calories} kcal</b>
          </span>
        )}
      </div>
      <AmountChips value={e} onPick={onChange} small />
    </div>
  );
}
