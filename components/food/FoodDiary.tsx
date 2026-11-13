"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { MacroSummary } from "@/components/food/MacroSummary";
import { MealComposer, type ComposerInit } from "@/components/food/MealComposer";
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ForkIcon,
  ImageIcon,
  PencilIcon,
  TargetIcon,
  TrashIcon,
} from "@/components/icons";
import { Button, Card, EmptyState, SectionTitle } from "@/components/ui";
import type { Meal } from "@/db/schema";
import { deleteMeal } from "@/lib/actions";
import { prepareMealPhoto } from "@/lib/image";
import {
  MEAL_TYPES,
  mealTypeForHour,
  sumMacros,
  type DailyTargets,
  type MealItem,
  type MealType,
} from "@/lib/nutrition";
import { addDaysStr, formatPretty, todayStr } from "@/lib/utils";

const noop = () => () => {};
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function parseItems(json: string | null): MealItem[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function FoodDiary({
  meals,
  requestedDate,
  targets,
  planMissing,
}: {
  meals: Meal[];
  /** From ?date=; null means "today in the user's timezone". */
  requestedDate: string | null;
  targets: DailyTargets;
  planMissing: boolean;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const today = mounted ? todayStr() : null;
  const date = requestedDate ?? today;

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [composer, setComposer] = useState<ComposerInit | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [deleting, startDelete] = useTransition();

  if (!date) {
    return <div className="h-64 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />;
  }

  const dayMeals = meals.filter((m) => m.date === date);
  const totals = sumMacros(dayMeals);
  const isToday = date === today;

  function defaultMealType(): MealType {
    return isToday ? mealTypeForHour(new Date().getHours()) : "snack";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file || !date) return;
    setPhotoError(null);
    setPreparing(true);
    try {
      const { analysis, thumb } = await prepareMealPhoto(file);
      setComposer({
        date,
        mealType: defaultMealType(),
        name: "",
        items: [],
        notes: "",
        analysisImage: analysis,
        thumb,
      });
    } catch {
      setPhotoError("Couldn't read that photo. Try a JPEG or PNG.");
    } finally {
      setPreparing(false);
    }
  }

  function openManual() {
    if (!date) return;
    setComposer({
      date,
      mealType: defaultMealType(),
      name: "",
      items: [{ name: "", portion: "", calories: 0, protein: 0, carbs: 0, fat: 0 }],
      notes: "",
    });
  }

  function openEdit(m: Meal) {
    const items = parseItems(m.items);
    setComposer({
      id: m.id,
      date: m.date,
      mealType: (MEAL_TYPES as readonly string[]).includes(m.mealType)
        ? (m.mealType as MealType)
        : "snack",
      name: m.name,
      items: items.length
        ? items
        : [
            {
              name: m.name,
              portion: "",
              calories: m.calories,
              protein: m.protein,
              carbs: m.carbs,
              fat: m.fat,
            },
          ],
      notes: m.notes ?? "",
      thumb: m.photo,
      aiEstimated: m.aiEstimated,
    });
  }

  function onDelete(m: Meal) {
    if (!confirm(`Delete “${m.name}”?`)) return;
    startDelete(async () => {
      await deleteMeal(m.id);
      router.refresh();
    });
  }

  const prev = addDaysStr(date, -1);
  const next = addDaysStr(date, 1);

  return (
    <div className="space-y-6">
      {/* Day switcher */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/food?date=${prev}`}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-800"
          aria-label="Previous day"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <div className="text-center">
          <div className="text-sm font-medium">{isToday ? "Today" : formatPretty(date)}</div>
          {!isToday && (
            <Link href="/food" className="text-xs text-zinc-500">
              Back to today
            </Link>
          )}
        </div>
        {isToday ? (
          <span className="h-10 w-10" />
        ) : (
          <Link
            href={next === today ? "/food" : `/food?date=${next}`}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-800"
            aria-label="Next day"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </Link>
        )}
      </div>

      <Card>
        <MacroSummary totals={totals} targets={targets} />
        {planMissing && (
          <Link
            href="/plan"
            className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-zinc-700 px-3 py-2.5 text-sm text-zinc-300"
          >
            <TargetIcon className="h-4 w-4 shrink-0 text-zinc-500" />
            Set your weight &amp; body-fat goal to get a daily calorie target →
          </Link>
        )}
      </Card>

      {/* Capture */}
      <section className="space-y-2">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onFile}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
        <Button
          size="lg"
          className="w-full"
          onClick={() => cameraRef.current?.click()}
          disabled={preparing}
        >
          <CameraIcon className="h-5 w-5" />
          {preparing ? "Preparing photo…" : "Snap a meal"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => libraryRef.current?.click()} disabled={preparing}>
            <ImageIcon className="h-4 w-4" /> From photos
          </Button>
          <Button variant="secondary" onClick={openManual}>
            <PencilIcon className="h-4 w-4" /> Enter manually
          </Button>
        </div>
        {photoError && <p className="text-center text-sm text-amber-300">{photoError}</p>}
      </section>

      {/* Meals */}
      <section>
        <SectionTitle>Meals</SectionTitle>
        {dayMeals.length === 0 ? (
          <EmptyState
            icon={<ForkIcon className="h-6 w-6" />}
            title="Nothing logged"
            description="Take a photo of what you eat and the AI will estimate the calories."
          />
        ) : (
          <div className="space-y-4">
            {MEAL_TYPES.map((t) => {
              const list = dayMeals.filter((m) => m.mealType === t);
              if (!list.length) return null;
              const kcal = Math.round(sumMacros(list).calories);
              return (
                <div key={t}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="font-medium capitalize text-zinc-300">{t}</span>
                    <span className="tabular-nums text-zinc-500">{kcal} kcal</span>
                  </div>
                  <ul className="space-y-2">
                    {list.map((m) => (
                      <MealRow
                        key={m.id}
                        meal={m}
                        onEdit={() => openEdit(m)}
                        onDelete={() => onDelete(m)}
                        disabled={deleting}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {composer && (
        <MealComposer
          key={composer.id ?? composer.thumb ?? "manual"}
          init={composer}
          onClose={() => setComposer(null)}
          onSaved={() => {
            setComposer(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MealRow({
  meal,
  onEdit,
  onDelete,
  disabled,
}: {
  meal: Meal;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const items = parseItems(meal.items);
  return (
    <li className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      <button
        className="flex w-full items-center gap-3 p-2.5 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {meal.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={meal.photo} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-800/70 text-zinc-500">
            <ForkIcon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{meal.name}</div>
          <div className="text-xs tabular-nums text-zinc-500">
            P {Math.round(meal.protein)} · C {Math.round(meal.carbs)} · F {Math.round(meal.fat)}
            {meal.aiEstimated && <span className="ml-1.5 text-zinc-600">· AI est.</span>}
          </div>
        </div>
        <div className="text-right text-sm font-semibold tabular-nums">
          {Math.round(meal.calories)}
          <span className="ml-0.5 text-[10px] font-normal text-zinc-500">kcal</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-zinc-800/80 px-3 py-2.5">
          {items.length > 0 && (
            <ul className="mb-2 space-y-1 text-xs">
              {items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-zinc-300">
                    {it.name}
                    {it.portion && <span className="text-zinc-500"> · {it.portion}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-500">{it.calories} kcal</span>
                </li>
              ))}
            </ul>
          )}
          {meal.notes && <p className="mb-2 text-xs text-zinc-500">{meal.notes}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <PencilIcon className="h-4 w-4" /> Edit
            </Button>
            <Button size="sm" variant="danger" onClick={onDelete} disabled={disabled}>
              <TrashIcon className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
