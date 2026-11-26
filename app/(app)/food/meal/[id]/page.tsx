import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, SparkIcon } from "@/components/icons";
import { MealActions, MealTimeEditor } from "@/components/meal/MealControls";
import { BandPill, LevelBar, LevelWord, QualityScale } from "@/components/meal/QualityParts";
import { Card, SectionTitle } from "@/components/ui";
import { advisorFallback, mealQuality, parseItems, formatPretty } from "@legymdary/shared";
import { getMeal, mealMinutes } from "@/lib/queries";
import { userTimeZone } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meal" };

export default async function MealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meal = /^\d{1,9}$/.test(id) ? await getMeal(Number(id)) : null;
  if (!meal) notFound();
  const q = mealQuality(meal);
  const items = parseItems(meal.items);
  const time = mealMinutes(meal, await userTimeZone());
  const advisor = meal.advisor || advisorFallback(q);
  const back = `/food?date=${meal.date}`;

  const stats: [string, string][] = [
    ["kcal", String(Math.round(meal.calories))],
    ["Protein", `${Math.round(meal.protein)} g`],
    ["Carbs", `${Math.round(meal.carbs)} g`],
    ["Fat", `${Math.round(meal.fat)} g`],
    ["Fiber", meal.fiber != null ? `${Math.round(meal.fiber * 10) / 10} g` : "–"],
    ["Added sugar", meal.sugar != null ? `${Math.round(meal.sugar * 10) / 10} g` : "–"],
  ];

  return (
    <PageTransition className="space-y-5">
      {/* Photo header */}
      <div
        className="banner-photo editorial-photo relative -mx-4 -mt-[max(1.5rem,env(safe-area-inset-top))] flex min-h-[260px] items-end px-5 pb-5 pt-[max(1.5rem,env(safe-area-inset-top))]"
        style={{
          ["--banner" as string]: `url("${meal.photo ?? "/editorial/linen.webp"}")`,
          ["--banner-pos" as string]: "center",
        }}
      >
        <Link
          href={back}
          transitionTypes={["nav-back"]}
          aria-label="Back to Food"
          className="press absolute left-4 top-[max(1rem,env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-paper backdrop-blur"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-paper/75">
            {meal.mealType} · {formatPretty(meal.date)}
          </p>
          <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight text-paper">{meal.name}</h1>
        </div>
      </div>

      {/* Advisor + quality */}
      <Card className="space-y-4">
        {advisor && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-teal-200">
              <SparkIcon className="h-4 w-4" /> Advisor
            </div>
            <p className="text-sm leading-relaxed text-zinc-200">{advisor}</p>
          </div>
        )}
        {q.score != null ? (
          <QualityScale score={q.score} />
        ) : (
          <p className="text-sm text-zinc-400">Too few calories to rate.</p>
        )}
      </Card>

      {/* Nutrition breakdown */}
      {q.score != null && (
        <section>
          <SectionTitle action={<BandPill band={q.band} />}>Nutrition breakdown</SectionTitle>
          <Card className="divide-y divide-zinc-800/70 p-0">
            {q.nutrients.map((n) => (
              <Link
                key={n.key}
                href={`/food/learn/${n.key}?meal=${meal.id}`}
                transitionTypes={["nav-forward"]}
                className="press block px-4 py-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                  <span>{n.label}</span>
                  <span className="flex items-center gap-1 text-xs">
                    <LevelWord level={n.level} tone={n.tone} />
                    <ChevronRightIcon className="h-4 w-4 text-zinc-500" />
                  </span>
                </div>
                <LevelBar position={n.position} tone={n.tone} />
                {n.detail && <div className="mt-1.5 text-[11px] tabular-nums text-zinc-500">{n.detail}</div>}
              </Link>
            ))}
          </Card>
          {q.partial && (
            <p className="mt-2 text-[11px] text-zinc-500">
              Fiber, sugar and processing come with AI estimates. Re-estimate this meal to rate them.
            </p>
          )}
        </section>
      )}

      {/* Numbers */}
      <div className="grid grid-cols-3 gap-2">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-zinc-800/70 bg-zinc-900 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">{k}</div>
            <div className="text-base font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      {/* Type + time */}
      <MealTimeEditor id={meal.id} mealType={meal.mealType} minutes={time.minutes} estimated={time.estimated} />

      {/* Items */}
      {items.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link href={`/food?date=${meal.date}&edit=${meal.id}`} className="flex items-center gap-1 text-xs text-zinc-400">
                <PencilIcon className="h-3.5 w-3.5" /> Edit
              </Link>
            }
          >
            Meal items
          </SectionTitle>
          <Card className="divide-y divide-zinc-800/70 p-0">
            {items.map((it, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{it.name}</span>
                  {it.portion && <span className="block truncate text-xs text-zinc-500">{it.portion}</span>}
                </span>
                <span className="shrink-0 tabular-nums text-zinc-400">{it.calories} kcal</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      <MealActions id={meal.id} back={back} editHref={`/food?date=${meal.date}&edit=${meal.id}`} />
    </PageTransition>
  );
}
