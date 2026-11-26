import { ArrowDownIcon, ArrowUpIcon, BoltIcon, FlameIcon, InfoIcon, LockIcon, ScaleIcon, TargetIcon } from "@/components/icons";
import { Card } from "@/components/ui";
import type { ExplainStep, MacroLine } from "@/lib/plan-explain";
import { cn } from "@/lib/utils";

const ICON: Record<ExplainStep["key"], (p: { className?: string }) => React.ReactNode> = {
  body: ScaleIcon,
  bmr: BoltIcon,
  maintenance: FlameIcon,
  goal: ArrowDownIcon,
  floor: LockIcon,
  target: TargetIcon,
  locked: LockIcon,
};
const MACRO = {
  protein: { label: "Protein", color: "bg-sky-400", text: "text-sky-300" },
  fat: { label: "Fat", color: "bg-rose-400", text: "text-rose-300" },
  carbs: { label: "Carbs", color: "bg-violet-400", text: "text-violet-300" },
} as const;

/** "How we got your number": the plan's steps with your own numbers. */
export function WhyCard({ steps, macros, target, direction }: { steps: ExplainStep[]; macros: MacroLine[]; target: number; direction: "lose" | "gain" | "maintain" }) {
  const totalKcal = macros.reduce((a, m) => a + m.kcal, 0) || 1;
  return (
    <Card id="why" className="scroll-mt-6 p-0">
      <details className="group" open>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3">
          <InfoIcon className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium">How we got {target.toLocaleString("en-US")} kcal</span>
          <span className="ml-auto text-xs text-zinc-500 group-open:hidden">show</span>
          <span className="ml-auto hidden text-xs text-zinc-500 group-open:inline">hide</span>
        </summary>
        <div className="space-y-4 px-4 pb-4">
          <ol className="relative space-y-3">
            <span className="absolute bottom-4 left-[15px] top-4 w-px bg-zinc-800" aria-hidden="true" />
            {steps.map((s) => {
              const Icon = s.key === "goal" && direction === "gain" ? ArrowUpIcon : ICON[s.key];
              const strong = s.key === "target" || s.key === "locked";
              return (
                <li key={s.key} className="relative flex gap-3">
                  <span
                    className={cn(
                      "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                      strong ? "border-teal-300/50 bg-teal-300/15 text-teal-200" : "border-zinc-700 bg-zinc-900 text-zinc-300",
                      s.tone === "minus" && "text-sky-300",
                      s.tone === "plus" && s.key === "maintenance" && "text-orange-300",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("text-sm", strong ? "font-semibold" : "text-zinc-300")}>{s.title}</span>
                      <span className={cn("shrink-0 text-sm tabular-nums", strong ? "font-semibold text-teal-200" : "text-zinc-100")}>{s.value}</span>
                    </div>
                    {s.math && <div className="mt-0.5 font-mono text-[11px] text-zinc-400">{s.math}</div>}
                    {s.note && <div className="mt-0.5 text-[11px] text-zinc-500">{s.note}</div>}
                  </div>
                </li>
              );
            })}
          </ol>

          {macros.length > 0 && (
            <div className="space-y-2">
              <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
                {macros.map((m) => (
                  <div key={m.key} className={MACRO[m.key].color} style={{ width: `${(m.kcal / totalKcal) * 100}%` }} />
                ))}
              </div>
              <ul className="space-y-1.5">
                {macros.map((m) => (
                  <li key={m.key} className="flex items-baseline gap-2 text-xs">
                    <span className={cn("w-14 shrink-0 font-medium", MACRO[m.key].text)}>{MACRO[m.key].label}</span>
                    <span className="w-12 shrink-0 font-semibold tabular-nums text-zinc-100">{m.grams} g</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-[11px] text-zinc-400">{m.math}</span>
                      <span className="block text-[11px] text-zinc-500">{m.note}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-500">{Math.round((m.kcal / totalKcal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] leading-relaxed text-zinc-600">
            Katch-McArdle and Mifflin-St Jeor equations · about 7,700 kcal per kg of body fat · protein 1.6 to 2.2 g per kg
            (ISSN position stand) · pace capped at 1% of body weight a week (0.5% to gain).
          </p>
        </div>
      </details>
    </Card>
  );
}
