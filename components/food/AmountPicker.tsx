"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * "How much did you eat / drink?": a plate (food) or glass (drink) that fills
 * as you drag, a plain-words label ("Half the plate · 270 of 545 kcal"),
 * and − / + buttons for quick quarter steps. 1 = the portion shown.
 */

const MAX_SLIDER = 3;
const STEP = 0.25;
const TICKS = [0, 0.5, 1, 1.5, 2, 3];

const FRACTION: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };
function amountText(v: number): string {
  const whole = Math.floor(v);
  const rest = Math.round((v - whole) * 100) / 100;
  if (rest === 0) return String(whole);
  if (FRACTION[String(rest)]) return `${whole || ""}${FRACTION[String(rest)]}`;
  return String(Math.round(v * 10) / 10);
}

/** Plain words for an amount, e.g. "Half the plate", "1½ glasses". */
export function amountWords(v: number, kind: "food" | "drink"): string {
  const unit = kind === "drink" ? "glass" : "plate";
  const units = kind === "drink" ? "glasses" : "plates";
  if (v <= 0) return kind === "drink" ? "None of it (didn't drink)" : "None of it (didn't eat)";
  if (v === 0.25) return `A quarter of the ${unit}`;
  if (v === 0.5) return `Half the ${unit}`;
  if (v === 0.75) return `Three quarters of the ${unit}`;
  if (v === 1) return `The whole ${unit}`;
  if (v < 1) return `${Math.round(v * 100)}% of the ${unit}`;
  return `${amountText(v)} ${units}`;
}

function Plate({ fill, size }: { fill: number; size: number }) {
  const r = 15;
  const f = Math.max(0, Math.min(1, fill));
  const a = f * 2 * Math.PI;
  const x = 24 + r * Math.sin(a);
  const y = 24 - r * Math.cos(a);
  const wedge = f >= 0.999 ? null : `M24 24 L24 ${24 - r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="shrink-0">
      <circle cx="24" cy="24" r="22" className="fill-zinc-800/80 stroke-zinc-600" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="17" className="fill-zinc-900/80 stroke-zinc-700" strokeWidth="1" />
      {f > 0 &&
        (wedge ? (
          <path d={wedge} className="fill-teal-300/85 transition-all duration-150" />
        ) : (
          <circle cx="24" cy="24" r={r} className="fill-teal-300/85" />
        ))}
    </svg>
  );
}

function Glass({ fill, size, clipId }: { fill: number; size: number; clipId: string }) {
  const f = Math.max(0, Math.min(1, fill));
  const top = 8;
  const bottom = 42;
  const level = bottom - (bottom - top - 2) * f;
  const outline = "M12 6 L36 6 L32.5 42 Q32.2 44 30 44 L18 44 Q15.8 44 15.5 42 Z";
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="shrink-0">
      <defs>
        <clipPath id={clipId}>
          <path d={outline} />
        </clipPath>
      </defs>
      <path d={outline} className="fill-zinc-900/80" />
      {f > 0 && (
        <g clipPath={`url(#${clipId})`}>
          <rect x="8" y={level} width="32" height={48 - level} className="fill-sky-300/85 transition-all duration-150" />
          <path d={`M10 ${level} Q17 ${level - 1.2} 24 ${level} T38 ${level}`} className="fill-none stroke-sky-100/70" strokeWidth="1" />
        </g>
      )}
      <path d={outline} className="fill-none stroke-zinc-500" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function AmountPicker({
  value,
  onChange,
  kind,
  fullKcal,
  currentKcal,
  compact,
}: {
  /** Times the portion shown; null when items in the meal differ. */
  value: number | null;
  onChange: (x: number) => void;
  kind: "food" | "drink";
  /** Calories of the full portion (1×), for the "270 of 545 kcal" line. */
  fullKcal?: number | null;
  /** Calories as saved (sum of rounded items), so the label matches the Save button. */
  currentKcal?: number | null;
  compact?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const v = value ?? 1;
  const shown = Math.min(v, MAX_SLIDER);
  const vessels = Math.max(1, Math.min(MAX_SLIDER, Math.ceil(v - 1e-9)));
  const size = compact ? 30 : 46;
  const words = value == null ? "Items differ. Slide to set them all" : amountWords(v, kind);
  const kcal = value == null ? null : currentKcal != null ? Math.round(currentKcal) : fullKcal != null ? Math.round(fullKcal * v) : null;
  const set = (x: number) => {
    const next = Math.max(0, Math.min(10, Math.round(x / STEP) * STEP));
    if (next !== value) {
      navigator.vibrate?.(4);
      onChange(next);
    }
  };

  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      <div className="flex items-center gap-3">
        <div className="flex items-center -space-x-1.5">
          {Array.from({ length: vessels }, (_, i) =>
            kind === "drink" ? (
              <Glass key={i} fill={v - i} size={size} clipId={`g${id}${i}`} />
            ) : (
              <Plate key={i} fill={v - i} size={size} />
            ),
          )}
          {v > MAX_SLIDER && <span className="pl-2.5 text-xs font-semibold text-zinc-300">+</span>}
        </div>
        <div className="min-w-0 flex-1" aria-live="polite">
          <div className={cn("font-semibold leading-tight", compact ? "text-sm" : "text-base")}>{words}</div>
          <div className="text-xs tabular-nums text-zinc-400">
            {value != null ? `${amountText(v)}× the portion` : "Each item keeps its own amount"}
            {kcal != null && fullKcal != null && v < 1 ? ` · ${kcal.toLocaleString("en-US")} of ${Math.round(fullKcal).toLocaleString("en-US")} kcal` : ""}
            {kcal != null && v === 1 ? ` · ${kcal.toLocaleString("en-US")} kcal` : ""}
            {kcal != null && fullKcal != null && v > 1 ? ` · ${kcal.toLocaleString("en-US")} kcal (${Math.round(fullKcal).toLocaleString("en-US")} per portion)` : ""}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => set(v - STEP)}
          disabled={v <= 0}
          aria-label="Less"
          className={cn(
            "press flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-lg leading-none text-zinc-200 disabled:opacity-40",
            compact ? "h-8 w-8" : "h-10 w-10",
          )}
        >
          −
        </button>
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={MAX_SLIDER}
            step={STEP}
            value={shown}
            onChange={(e) => set(Number(e.target.value))}
            aria-label={kind === "drink" ? "How much you drank" : "How much you ate"}
            aria-valuetext={words}
            className={cn("amount-range w-full", kind === "drink" ? "amount-range-drink" : "")}
            style={{ ["--fill" as string]: `${(shown / MAX_SLIDER) * 100}%` }}
          />
          {!compact && (
            <div className="pointer-events-none relative mt-1 h-4 text-[11px] tabular-nums text-zinc-500">
              {TICKS.map((t) => (
                <span
                  key={t}
                  className={cn("absolute -translate-x-1/2", t === v && "font-semibold text-zinc-200")}
                  style={{ left: `calc(${(t / MAX_SLIDER) * 100}% + ${(0.5 - t / MAX_SLIDER) * 22}px)` }}
                >
                  {t === 0 ? "0" : `${amountText(t)}×`}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => set(v + STEP)}
          disabled={v >= 10}
          aria-label="More"
          className={cn(
            "press flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-lg leading-none text-zinc-200 disabled:opacity-40",
            compact ? "h-8 w-8" : "h-10 w-10",
          )}
        >
          +
        </button>
      </div>
    </div>
  );
}
