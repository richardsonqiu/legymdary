import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { ChevronDownIcon, ChevronLeftIcon } from "@/components/icons";
import { LevelBar } from "@/components/meal/QualityParts";
import { Card, PageHeader, SectionTitle, type BannerImage } from "@/components/ui";
import { mealQuality, NUTRIENTS, type NutrientKey } from "@/lib/meal-quality";
import { NUTRIENT_INFO } from "@/lib/nutrient-info";
import { getMeal } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LEVELS = [
  { key: "low", position: 0.17 },
  { key: "moderate", position: 0.5 },
  { key: "high", position: 0.9 },
] as const;

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: NUTRIENT_INFO[key as NutrientKey]?.title ?? "Nutrition" };
}

export default async function NutrientPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const { key } = await params;
  if (!NUTRIENTS.some((n) => n.key === key)) notFound();
  const info = NUTRIENT_INFO[key as NutrientKey];
  const sp = await searchParams;
  const mealId = typeof sp.meal === "string" && /^\d{1,9}$/.test(sp.meal) ? Number(sp.meal) : null;
  const meal = mealId ? await getMeal(mealId) : null;
  const mine = meal ? mealQuality(meal).nutrients.find((n) => n.key === key) ?? null : null;
  const back = meal ? `/food/meal/${meal.id}` : "/food";

  return (
    <PageTransition className="space-y-5">
      <Link href={back} transitionTypes={["nav-back"]} className="press -mb-2 inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeftIcon className="h-4 w-4" /> {meal ? meal.name : "Food"}
      </Link>
      <PageHeader title={info.title} eyebrow="Nutrition" image={info.image as BannerImage} />

      {mine && meal && (
        <Card className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-zinc-400">In this meal</span>
            <span className="font-semibold capitalize">{mine.level ?? "Not rated"}</span>
          </div>
          <LevelBar position={mine.position} tone={mine.tone} />
          {mine.detail && <p className="text-xs tabular-nums text-zinc-500">{mine.detail}</p>}
          {mine.level && <p className="text-sm text-zinc-300">{info.levels[mine.level]}</p>}
        </Card>
      )}

      <p className="text-base leading-relaxed text-zinc-200">{info.what}</p>

      <details className="group rounded-3xl border border-zinc-800/70 bg-zinc-900" open>
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
          Good sources
          <ChevronDownIcon className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="space-y-1.5 px-4 pb-4 text-sm text-zinc-300">
          {info.sources.map((s) => (
            <li key={s} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-teal-300" />
              {s}
            </li>
          ))}
        </ul>
      </details>

      <section>
        <SectionTitle>Why it matters</SectionTitle>
        <div className="space-y-2">
          {info.why.map((w) => (
            <details key={w.title} className="group rounded-2xl border border-zinc-800/70 bg-zinc-900">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
                {w.title}
                <ChevronDownIcon className="h-4 w-4 text-zinc-500 transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-4 pb-3 text-sm leading-relaxed text-zinc-300">{w.body}</p>
            </details>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>What the levels mean</SectionTitle>
        <Card className="space-y-3.5">
          {LEVELS.map((l) => (
            <div key={l.key} className={cn("space-y-1.5", mine?.level === l.key && "rounded-xl bg-white/[0.04] p-2 -m-2")}>
              <div className="text-sm font-medium capitalize">{l.key}</div>
              <LevelBar position={l.position} tone="neutral" />
              <p className="text-xs text-zinc-400">{info.levels[l.key]}</p>
            </div>
          ))}
          <p className="border-t border-zinc-800/70 pt-3 text-[11px] text-zinc-500">{info.rule}</p>
        </Card>
      </section>
    </PageTransition>
  );
}
