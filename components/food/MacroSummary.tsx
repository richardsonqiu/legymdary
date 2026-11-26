import { CountUp } from "@/components/CountUp";
import { macroStatus, type DailyTargets, type MacroKind, type Macros } from "@legymdary/shared";
import { cn } from "@/lib/utils";

/** Calorie ring + macro bars for one day. Safe in server or client trees. */
export function MacroSummary({
  totals,
  targets,
  compact = false,
}: {
  totals: Macros;
  targets: DailyTargets;
  compact?: boolean;
}) {
  const eaten = Math.round(totals.calories);
  const target = targets?.calories ?? null;
  const remaining = target != null ? target - eaten : null;
  const pct = target ? Math.min(1, eaten / target) : 0;
  const over = target != null && eaten > target;

  const size = compact ? 96 : 124;
  const stroke = compact ? 9 : 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            className="stroke-zinc-800"
          />
          {target != null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct)}
              style={{ ["--ring-c" as string]: c }}
              className={cn("ring-progress", over ? "stroke-amber-400" : "stroke-teal-300")}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            className={cn(
              "font-semibold tabular-nums tracking-tight",
              compact ? "text-lg" : "text-2xl",
            )}
          >
            <CountUp value={remaining != null ? Math.abs(remaining) : eaten} />
          </span>
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            {remaining == null ? "kcal eaten" : over ? "kcal over" : "kcal left"}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
          <span className="text-zinc-400">Eaten</span>
          <span className="whitespace-nowrap tabular-nums">
            <span className="font-semibold">
              <CountUp value={eaten} />
            </span>
            {target != null && (
              <span className="text-zinc-500"> / {target.toLocaleString("en-US")} kcal</span>
            )}
          </span>
        </div>
        <MacroBar label="Protein" value={totals.protein} target={targets?.protein} color="bg-sky-400" kind="protein" />
        <MacroBar label="Carbs" value={totals.carbs} target={targets?.carbs} color="bg-violet-400" kind="limit" />
        <MacroBar label="Fat" value={totals.fat} target={targets?.fat} color="bg-rose-400" kind="limit" />
      </div>
    </div>
  );
}

/**
 * Macro progress with a verdict. Protein: more is fine ("hit" once reached).
 * Carbs/fat: within ±10% is on target; above that is flagged as over.
 */
function MacroBar({
  label,
  value,
  target,
  color,
  kind,
}: {
  label: string;
  value: number;
  target?: number | null;
  color: string;
  kind: MacroKind;
}) {
  const v = Math.round(value);
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const status = target ? macroStatus(kind, value, target) : null;
  const over = status?.tone === "over";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-zinc-400">{label}</span>
        <span className="tabular-nums text-zinc-500">
          <span className={cn("font-semibold", over ? "text-amber-300" : "text-zinc-200")}>{v}</span>
          {target ? ` / ${target}` : ""} g
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        {target ? (
          <div
            className={cn("bar-fill h-full rounded-full", over ? "bg-amber-400" : color)}
            style={{ width: `${pct}%` }}
          />
        ) : null}
      </div>
      {status && (
        <div
          className={cn(
            "mt-0.5 text-right text-[10px]",
            status.tone === "good" && "text-emerald-300/90",
            status.tone === "over" && "text-amber-300",
            status.tone === "muted" && "text-zinc-600",
          )}
        >
          {status.text}
        </div>
      )}
    </div>
  );
}
