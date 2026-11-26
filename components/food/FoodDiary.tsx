"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { groupByDish, ItemExplanation } from "@/components/food/ItemExplanation";
import { MacroSummary } from "@/components/food/MacroSummary";
import { MealComposer, type ComposerInit } from "@/components/food/MealComposer";
import { BAND_DOT, BandPill } from "@/components/meal/QualityParts";
import { bandLabel, mealQuality, isDrink, parseItems, MEAL_TYPES, mealBudgets, SKIPPABLE_MEALS, mealTypeForHour, sumMacros, type DailyTargets, withBonus, type MealType, addDaysStr, formatPretty, todayStr } from "@legymdary/shared";
import { amountWords } from "@/components/food/AmountPicker";
import { ConfirmAddSheet, PinPickerSheet, type QuickMeal } from "@/components/food/QuickSheets";
import { TargetChangeNote, type TargetChangeInfo } from "@/components/food/TargetChangeNote";
import {
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparkIcon,
  ForkIcon,
  ImageIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  XIcon,
  TargetIcon,
  TrashIcon,
  FlameIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  LockIcon,
  BarsIcon,
  InfoIcon,
} from "@/components/icons";
import { Button, Card, SectionTitle } from "@/components/ui";
import type { Meal, SavedMeal } from "@/db/schema";
import { deleteMeal, logMenuItem, pinMeal, relogMeal, removeMenuItem, skipMeal, unskipMeal } from "@/lib/actions";
import { prepareMealPhoto } from "@/lib/image";
import { cn } from "@/lib/utils";

const noop = () => () => {};
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}


/** The composer pre-filled to edit a logged meal. */
function editInit(m: Meal): ComposerInit {
  const items = parseItems(m.items);
  return {
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
      advisor: m.advisor,
    };
}

export function FoodDiary({
  meals,
  recentMeals,
  requestedDate,
  targets,
  targetsByDate,
  targetChange,
  targetMode,
  skipped,
  menu,
  planMissing,
  garminByDate,
  macroSplitNote,
  editId,
}: {
  /** Open the editor for this meal on load (from the meal page). */
  editId?: number | null;
  meals: Meal[];
  /** Distinct recent meals, newest first: the first few are "Eat again", all of them feed the My menu picker. */
  recentMeals: Meal[];
  /** From ?date=; null means "today in the user's timezone". */
  requestedDate: string | null;
  targets: DailyTargets;
  /** The target each past day had (locked once the day is over). */
  targetsByDate?: Record<string, NonNullable<DailyTargets>>;
  /** "steady" targets don't grow with exercise. */
  targetMode?: "steady" | "adaptive";
  /** Why today's target differs from the previous day's. */
  targetChange?: TargetChangeInfo | null;
  /** Meals marked as skipped (a window of days around the one shown). */
  skipped: { date: string; mealType: string }[];
  /** "My menu": pinned and custom meals. */
  menu: SavedMeal[];
  planMissing: boolean;
  /** True when macro goals use a standard % split because no weight is logged. */
  macroSplitNote?: boolean;
  /** Garmin burn + activity bonus per date (null when Garmin isn't connected). */
  garminByDate?: Record<string, { burned: number | null; bonus: number }> | null;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const today = mounted ? todayStr() : null;
  const date = requestedDate ?? today;

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [composer, setComposer] = useState<ComposerInit | null>(() => {
    const m = editId ? meals.find((x) => x.id === editId) : null;
    return m ? editInit(m) : null;
  });
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [deleting, startDelete] = useTransition();
  const [relogging, startRelog] = useTransition();
  const [adding, setAdding] = useState<{ meal: QuickMeal; source: "recent" | "menu" } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pinBusyId, setPinBusyId] = useState<number | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [skipping, startSkip] = useTransition();
  const [menuEdit, setMenuEdit] = useState(false);
  const [menuBusy, startMenu] = useTransition();
  const [skipError, setSkipError] = useState<string | null>(null);

  if (!date) {
    return <div className="h-64 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900/50" />;
  }

  const dayMeals = meals.filter((m) => m.date === date);
  const totals = sumMacros(dayMeals);
  const isToday = date === today;
  const skippedTypes = skipped.filter((s) => s.date === date).map((s) => s.mealType as MealType);
  // Past days are judged against the target they had, not today's.
  const baseTarget = !isToday && today && date < today ? targetForDay(date, targets, targetsByDate) : targets;
  const dayTarget = withBonus(baseTarget, garminByDate?.[date]?.bonus);
  const eatenByType = Object.fromEntries(
    MEAL_TYPES.map((t) => [t, sumMacros(dayMeals.filter((m) => m.mealType === t)).calories]),
  ) as Partial<Record<MealType, number>>;
  const budgets = dayTarget ? mealBudgets(dayTarget.calories, eatenByType, skippedTypes) : null;

  function askAdd(meal: QuickMeal, source: "recent" | "menu") {
    setConfirmError(null);
    setAdding({ meal, source });
  }
  function confirmAdd(mealType: MealType) {
    if (!adding) return;
    const { meal, source } = adding;
    startRelog(async () => {
      try {
        if (source === "menu") await logMenuItem({ id: meal.id, date: date!, mealType });
        else await relogMeal({ mealId: meal.id, date: date!, mealType });
        navigator.vibrate?.(12);
        setAdding(null);
        router.refresh();
      } catch {
        setConfirmError("Couldn't add it. Check your connection and try again.");
      }
    });
  }
  const pinKey = (m: { name: string; calories: number }) => `${m.name.trim().toLowerCase()}|${Math.round(m.calories)}`;
  const pinnedKeys = new Set(menu.map(pinKey));
  function pinFromPicker(m: QuickMeal) {
    setPinError(null);
    setPinBusyId(m.id);
    startMenu(async () => {
      const res = await pinMeal(m.id);
      setPinBusyId(null);
      if ("error" in res) setPinError(res.error);
      else router.refresh();
    });
  }
  function removeFromMenu(item: SavedMeal) {
    startMenu(async () => {
      await removeMenuItem(item.id);
      router.refresh();
    });
  }
  function newMenuItem() {
    setComposer({
      date: date!,
      mealType: "snack",
      name: "",
      items: [{ name: "", portion: "", calories: 0, protein: 0, carbs: 0, fat: 0 }],
      notes: "",
      toMenu: true,
    });
  }

  function onSkip(t: MealType) {
    setSkipError(null);
    startSkip(async () => {
      const res = await skipMeal({ date: date!, mealType: t });
      if ("error" in res) setSkipError(res.error);
      navigator.vibrate?.(10);
      router.refresh();
    });
  }
  function onUnskip(t: MealType) {
    startSkip(async () => {
      await unskipMeal({ date: date!, mealType: t });
      router.refresh();
    });
  }

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
    setComposer(editInit(m));
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
        <MacroSummary totals={totals} targets={dayTarget} />
        {isToday && targetChange && today && <TargetChangeNote change={targetChange} today={today} />}
        {isToday && !planMissing && dayTarget && (
          <Link href="/plan#why" className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300">
            <InfoIcon className="h-3.5 w-3.5" /> How is {Math.round(dayTarget.calories).toLocaleString("en-US")} worked out?
          </Link>
        )}
        {!isToday && today && date < today && baseTarget && (
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-400" title="Past days keep the target they had">
            <LockIcon className="h-3.5 w-3.5" /> Target that day: {Math.round(baseTarget.calories).toLocaleString("en-US")} kcal
          </p>
        )}
        {garminByDate && (() => {
          const burned = garminByDate[date]?.burned ?? null;
          const net = burned != null ? Math.round(totals.calories - burned) : null;
          const bonus = garminByDate[date]?.bonus ?? 0;
          return (
            <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-zinc-800/80 pt-3 text-xs">
              <span className="flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1 tabular-nums text-zinc-200" title="Burned (watch or ring)">
                <FlameIcon className="h-3.5 w-3.5 text-orange-300" />
                {burned != null ? Math.round(burned).toLocaleString("en-US") : "–"}
                <span className="text-zinc-500">burned</span>
              </span>
              {net != null && (
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 tabular-nums",
                    net <= 0 ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200",
                  )}
                  title={net <= 0 ? "Deficit: eaten minus burned" : "Surplus: eaten minus burned"}
                >
                  {net <= 0 ? <ArrowDownIcon className="h-3.5 w-3.5" /> : <ArrowUpIcon className="h-3.5 w-3.5" />}
                  {Math.abs(net).toLocaleString("en-US")}
                  <span className="opacity-70">{net <= 0 ? "deficit" : "surplus"}</span>
                </span>
              )}
              {isToday && targetMode === "steady" && (
                <span className="flex items-center gap-1 rounded-full bg-white/[0.05] px-2.5 py-1 text-zinc-300" title="Steady target: exercise doesn't raise it, so extra burn adds to your deficit">
                  <LockIcon className="h-3.5 w-3.5" /> steady
                </span>
              )}
              {!!bonus && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-1 text-emerald-200">+{bonus} activity</span>
              )}
              <Link href="/stats#balance" className="ml-auto flex items-center gap-1 rounded-full px-2 py-1 text-zinc-400 hover:text-zinc-200" aria-label="Calorie balance this week">
                <BarsIcon className="h-3.5 w-3.5" /> week
              </Link>
            </div>
          );
        })()}
        {macroSplitNote && !planMissing && (
          <Link
            href="/stats"
            className="mt-3 block text-[11px] leading-snug text-zinc-500 underline-offset-2 hover:underline"
          >
            Macro goals use a standard split of your calories. Add your weight on Progress so protein
            matches your body (about 1.8 to 2 g per kg) →
          </Link>
        )}
        {planMissing && (
          <Link
            href="/plan" transitionTypes={["nav-forward"]}
            className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-zinc-700 px-3 py-2.5 text-sm text-zinc-300"
          >
            <TargetIcon className="h-4 w-4 shrink-0 text-zinc-500" />
            Set a goal to get your daily calories →
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
            <PencilIcon className="h-4 w-4" /> Describe it
          </Button>
        </div>
        {photoError && <p className="text-center text-sm text-amber-300">{photoError}</p>}
      </section>

      {/* My menu: meals you pinned or created, one tap to log */}
      <section>
        <SectionTitle
          action={
            menu.length > 0 ? (
              <button className="text-xs text-zinc-400" onClick={() => setMenuEdit((v) => !v)}>
                {menuEdit ? "Done" : "Edit"}
              </button>
            ) : null
          }
        >
          My menu
        </SectionTitle>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <button
            onClick={() => {
              setPinError(null);
              setPickerOpen(true);
            }}
            className="press flex w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 p-2 text-xs text-zinc-300"
          >
            <PlusIcon className="h-4 w-4" />
            Add
          </button>
          {menu.map((m) => (
            <div key={m.id} className="relative shrink-0">
              <button
                onClick={() => (menuEdit ? null : askAdd(m, "menu"))}
                disabled={menuBusy}
                className="press flex w-36 items-center gap-2 rounded-xl border border-teal-300/20 bg-teal-300/[0.04] p-2 text-left hover:bg-teal-300/[0.08] disabled:opacity-60"
              >
                {m.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photo} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800/70 text-zinc-500">
                    <PinIcon className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{m.name}</span>
                  <span className="block text-[11px] tabular-nums text-zinc-500">
                    {`+ ${Math.round(m.calories)} kcal`}
                  </span>
                </span>
              </button>
              {menuEdit && (
                <button
                  onClick={() => removeFromMenu(m)}
                  aria-label={`Remove ${m.name} from My menu`}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-citron text-carbon"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {menu.length === 0 && (
          <p className="mt-2 text-xs text-zinc-500">
            Pin meals you eat often, then add them in two taps. Tap Add to pick from meals you have eaten before.
          </p>
        )}
      </section>

      {/* Eat again: instant re-log, no AI cost */}
      {recentMeals.length > 0 && (
        <section>
          <SectionTitle>Eat again</SectionTitle>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {recentMeals.slice(0, 8).map((m) => (
              <button
                key={m.id}
                onClick={() => askAdd(m, "recent")}
                disabled={relogging}
                className="press flex w-36 shrink-0 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-2 text-left hover:bg-zinc-800/60 disabled:opacity-60"
              >
                {m.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photo} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800/70 text-zinc-500">
                    <ForkIcon className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{m.name}</span>
                  <span className="block text-[11px] tabular-nums text-zinc-500">
                    {`+ ${Math.round(m.calories)} kcal`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Meals */}
      <section>
        <SectionTitle>Meals</SectionTitle>
        {skippedTypes.length > 0 && budgets && (
          <p className="mb-3 rounded-xl border border-teal-300/20 bg-teal-300/[0.06] px-3 py-2.5 text-sm text-teal-100">
            Skipped {skippedTypes.join(" and ")}. That frees <b>{budgets.freed.toLocaleString("en-US")} kcal</b> for
            your other meals.
          </p>
        )}
        {skipError && <p className="mb-2 text-sm text-amber-300">{skipError}</p>}
        <div className="space-y-4">
          {MEAL_TYPES.map((t) => {
            const list = dayMeals.filter((m) => m.mealType === t);
            const skippedHere = skippedTypes.includes(t);
            const canSkip = (SKIPPABLE_MEALS as readonly string[]).includes(t);
            if (!list.length && !skippedHere && !canSkip) return null;
            const kcal = Math.round(sumMacros(list).calories);
            const slot = budgets?.slots.find((x) => x.type === t);
            const over = !!slot && slot.budget > 0 && kcal > slot.budget;
            return (
              <div key={t}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="font-medium capitalize text-zinc-300">{t}</span>
                  <span className="tabular-nums text-zinc-500">
                    {skippedHere ? (
                      "Skipped"
                    ) : (
                      <>
                        <span className={over ? "text-amber-300" : undefined}>{kcal} kcal</span>
                        {slot && slot.budget > 0 && <> of about {slot.budget.toLocaleString("en-US")}</>}
                      </>
                    )}
                  </span>
                </div>
                {skippedHere ? (
                  <div className="flex items-center justify-between rounded-xl border border-dashed border-teal-300/30 bg-teal-300/[0.04] px-3 py-2.5 text-sm text-zinc-300">
                    <span>Skipped, nothing to log</span>
                    <Button size="sm" variant="ghost" onClick={() => onUnskip(t)} disabled={skipping}>
                      Undo
                    </Button>
                  </div>
                ) : list.length > 0 ? (
                  <ul className="space-y-2">
                    {list.map((m) => (
                      <MealRow
                        key={m.id}
                        meal={m}
                        onEdit={() => openEdit(m)}
                        onDelete={() => onDelete(m)}
                        disabled={deleting}
                        pinned={pinnedKeys.has(pinKey(m))}
                      />
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-800 px-3 py-2.5 text-sm text-zinc-500">
                    <span>Nothing yet</span>
                    <Button size="sm" variant="secondary" onClick={() => onSkip(t)} disabled={skipping}>
                      Skip {t}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {adding && (
        <ConfirmAddSheet
          key={`${adding.source}-${adding.meal.id}`}
          meal={adding.meal}
          dateLabel={isToday ? "today" : formatPretty(date)}
          defaultType={defaultMealType()}
          busy={relogging}
          error={confirmError}
          onConfirm={confirmAdd}
          onClose={() => !relogging && setAdding(null)}
        />
      )}

      {pickerOpen && (
        <PinPickerSheet
          meals={recentMeals}
          isPinned={(m) => pinnedKeys.has(pinKey(m))}
          busyId={pinBusyId}
          error={pinError}
          onPin={pinFromPicker}
          onCreate={() => {
            setPickerOpen(false);
            newMenuItem();
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {composer && (
        <MealComposer
          key={composer.id ?? composer.thumb ?? "manual"}
          init={composer}
          onClose={() => {
            setComposer(null);
            if (editId) router.replace(`/food?date=${date}`, { scroll: false });
          }}
          onSaved={() => {
            setComposer(null);
            if (editId) router.replace(`/food?date=${date}`, { scroll: false });
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
  pinned,
}: {
  meal: Meal;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
  pinned: boolean;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [pinning, startPin] = useTransition();
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const items = parseItems(meal.items);
  const quality = mealQuality(meal);
  return (
    <li className="animate-item-in overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
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
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{meal.name}</span>
            {quality.band && <span title={bandLabel(quality.band)} className={cn("h-1.5 w-1.5 shrink-0 rounded-full", BAND_DOT[quality.band])} />}
          </div>
          <div className="text-xs tabular-nums text-zinc-500">
            P {Math.round(meal.protein)} · C {Math.round(meal.carbs)} · F {Math.round(meal.fat)}
            {items.some((i) => i.eaten != null && i.eaten !== 1) && <span className="ml-1.5 text-teal-300/80">· amount adjusted</span>}
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
            <div className="mb-2 space-y-2.5">
              {groupByDish(items).map((g, gi) => (
                <div key={gi} className="space-y-1.5">
                  {g.dish && (
                    <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                      <span>{g.dish}</span>
                      <span className="tabular-nums">
                        {g.items.reduce((a, x) => a + x.item.calories, 0)} kcal
                      </span>
                    </div>
                  )}
                  {g.items.map(({ item: it, index }) => (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between gap-3 text-xs">
                        <span className="min-w-0 text-zinc-300">
                          {it.name}
                          {it.portion && <span className="text-zinc-500"> · {it.portion}</span>}
                          {it.eaten != null && it.eaten !== 1 && (
                            <span className="ml-1.5 rounded-full bg-teal-300/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-200">
                              {amountWords(it.eaten, isDrink(it) ? "drink" : "food").toLowerCase()}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-zinc-400">{it.calories} kcal</span>
                      </div>
                      <div className="text-[10px] tabular-nums text-zinc-500">
                        P {it.protein} g · C {it.carbs} g · F {it.fat} g
                      </div>
                      <ItemExplanation item={it} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {meal.notes && <p className="mb-2 text-xs text-zinc-500">{meal.notes}</p>}
          <Link
            href={`/food/meal/${meal.id}`}
            transitionTypes={["nav-forward"]}
            className="press mb-2 flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2.5 text-sm hover:bg-white/[0.08]"
          >
            <SparkIcon className="h-4 w-4 text-teal-300" />
            <span className="flex-1 font-medium">Meal insights</span>
            <BandPill band={quality.band} />
            <ChevronRightIcon className="h-4 w-4 text-zinc-500" />
          </Link>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={onEdit}>
              <PencilIcon className="h-4 w-4" /> How much did you eat?
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pinned || pinning}
              onClick={() =>
                startPin(async () => {
                  const res = await pinMeal(meal.id);
                  setPinMsg("error" in res ? res.error : null);
                  router.refresh();
                })
              }
            >
              <PinIcon className="h-4 w-4" /> {pinned ? "In My menu" : pinning ? "Pinning…" : "Pin"}
            </Button>
            <Button size="sm" variant="danger" onClick={onDelete} disabled={disabled}>
              <TrashIcon className="h-4 w-4" /> Delete
            </Button>
          </div>
          {pinMsg && <p className="mt-1 text-right text-xs text-amber-300">{pinMsg}</p>}
        </div>
      )}
    </li>
  );
}

/** The target a past day had: its saved one, else the nearest saved one after it, else today's. */
function targetForDay(
  date: string,
  today: DailyTargets,
  byDate: Record<string, NonNullable<DailyTargets>> | undefined,
): DailyTargets {
  if (!byDate) return today;
  if (byDate[date]) return byDate[date];
  const later = Object.keys(byDate)
    .filter((d) => d > date)
    .sort()[0];
  return later ? byDate[later] : today;
}
