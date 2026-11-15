import type { MealItem } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

/** "How it was estimated" for one food component: reference → amount → maths → assumptions. */
export function ItemExplanation({ item, className }: { item: MealItem; className?: string }) {
  const rows: [string, string | null | undefined][] = [
    ["Reference", item.reference],
    ["Amount", item.amount],
    ["Maths", item.calculation],
    ["Assumed", item.assumptions],
  ];
  if (!rows.some(([, v]) => v)) return null;
  return (
    <dl className={cn("space-y-0.5 rounded-lg bg-zinc-950/60 px-2.5 py-2 text-[11px] leading-snug", className)}>
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="w-[64px] shrink-0 text-zinc-600">{k}</dt>
            <dd className={cn("min-w-0 text-zinc-400", k === "Maths" && "tabular-nums text-zinc-300")}>{v}</dd>
          </div>
        ))}
      {item.edited && <p className="pt-0.5 text-amber-300/80">You edited the numbers — the reasoning above is the AI&apos;s original estimate.</p>}
    </dl>
  );
}

/** Groups consecutive items by dish so composite foods read as one block. */
export function groupByDish(items: MealItem[]): { dish: string | null; items: { item: MealItem; index: number }[] }[] {
  const groups: { dish: string | null; items: { item: MealItem; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const dish = item.dish && item.dish.trim().toLowerCase() !== item.name.trim().toLowerCase() ? item.dish : null;
    const last = groups[groups.length - 1];
    if (last && dish && last.dish === dish) last.items.push({ item, index });
    else groups.push({ dish, items: [{ item, index }] });
  });
  return groups;
}
