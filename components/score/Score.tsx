import Link from "next/link";
import { cn } from "@/lib/utils";

export type Tone = "great" | "good" | "low" | "none";

/** Colour for a 0–100 score: teal when strong, sky when fine, amber when low. */
export function toneFor(score: number | null): Tone {
  if (score == null) return "none";
  return score >= 75 ? "great" : score >= 50 ? "good" : "low";
}
const STROKE: Record<Tone, string> = {
  great: "#5eead4", // teal-300
  good: "#7dd3fc", // sky-300
  low: "#fcd34d", // amber-300
  none: "#333d55",
};
export const toneWord = (score: number | null) =>
  score == null ? "No data" : score >= 85 ? "Optimal" : score >= 70 ? "Good" : score >= 50 ? "Fair" : "Pay attention";

/** Small circular score with a label, for the row at the top of Home. */
export function ScoreRing({
  value,
  display,
  label,
  href,
  icon,
}: {
  /** 0–100 fill. */
  value: number | null;
  /** Text inside the ring (defaults to the value). */
  display?: string;
  label: string;
  href: string;
  icon?: string;
}) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const tone = toneFor(value);
  return (
    <Link href={href} className="press flex min-w-0 flex-col items-center gap-1.5">
      <span className="relative block h-[60px] w-[60px]">
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
          <circle cx="32" cy="32" r={r} fill="rgba(10,15,28,0.25)" stroke="rgba(255,255,255,0.14)" strokeWidth="4" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={STROKE[tone]}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
            className="score-ring-arc"
            style={{ ["--ring-c" as string]: `${c}` }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[14px] font-semibold tabular-nums drop-shadow">
          {display ?? (value == null ? "–" : Math.round(value))}
        </span>
      </span>
      <span className="flex max-w-full items-center gap-0.5 truncate text-[11px] text-zinc-50/90 [text-shadow:0_1px_6px_rgba(0,0,0,0.5)]">
        {icon && <span className="text-[10px]">{icon}</span>}
        {label}
      </span>
    </Link>
  );
}

/** Large 240° arc gauge with the score in the middle. */
export function ArcGauge({ value, size = 220, className }: { value: number; size?: number; className?: string }) {
  const r = 90;
  const sweep = 240;
  const arcLen = (2 * Math.PI * r * sweep) / 360;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  // Arc from 150° to 390° (bottom-left → top → bottom-right).
  const pt = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${100 + r * Math.cos(a)} ${100 + r * Math.sin(a)}`;
  };
  const d = `M ${pt(150)} A ${r} ${r} 0 1 1 ${pt(30)}`;
  const tone = toneFor(value);
  const knobDeg = 150 + sweep * pct;
  const [kx, ky] = pt(knobDeg).split(" ").map(Number);
  return (
    <svg viewBox="0 0 200 170" width={size} height={(size * 170) / 200} className={cn("overflow-visible", className)}>
      <defs>
        <linearGradient id="arc-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor={STROKE[tone]} />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke="url(#arc-grad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={arcLen}
        strokeDashoffset={arcLen * (1 - pct)}
        className="score-ring-arc"
        style={{ ["--ring-c" as string]: `${arcLen}` }}
      />
      <circle cx={kx} cy={ky} r="7" fill="#f5f7fb" className="animate-fade-in" />
    </svg>
  );
}

/** Thin bar with a marker, like a "where you are on the range" indicator. */
export function RangeBar({ value, className }: { value: number | null; className?: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative h-1.5 rounded-full bg-white/10", className)}>
      <div className="bar-fill absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: STROKE[toneFor(value)] }} />
      {value != null && (
        <div className="absolute top-1/2 h-3.5 w-1 -translate-y-1/2 rounded-full bg-zinc-50" style={{ left: `calc(${pct}% - 2px)` }} />
      )}
    </div>
  );
}
