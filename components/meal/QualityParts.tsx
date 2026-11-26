import { BANDS, type Band, type Level, type Tone } from "@legymdary/shared";
import { cn } from "@/lib/utils";

export const BAND_DOT: Record<Band, string> = {
  limited: "bg-amber-400",
  fair: "bg-zinc-400",
  good: "bg-teal-400",
  nutritious: "bg-teal-300",
};

/** Limited | Fair | Good | Nutritious with a knob at the score. */
export function QualityScale({ score, className }: { score: number | null; className?: string }) {
  const pos = score == null ? null : Math.max(2, Math.min(98, score));
  return (
    <div className={className}>
      <div className="relative">
        <div className="flex gap-1.5">
          {BANDS.map((b) => {
            const on = score != null && score >= b.min;
            return <span key={b.key} className={cn("h-1.5 flex-1 rounded-full", on ? "bg-teal-300" : "bg-zinc-700/70")} />;
          })}
        </div>
        {pos != null && (
          <span
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-zinc-950 bg-citron shadow"
            style={{ left: `${pos}%` }}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-2 flex text-[11px]">
        {BANDS.map((b, i) => {
          const active = score != null && score >= b.min && (i === BANDS.length - 1 || score < BANDS[i + 1].min);
          return (
            <span key={b.key} className={cn("flex-1 text-center", active ? "font-semibold text-zinc-50" : "text-zinc-500")}>
              {b.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

const TONE_FILL: Record<Tone, string> = { good: "bg-teal-300", neutral: "bg-zinc-300", watch: "bg-amber-400" };
const TONE_TEXT: Record<Tone, string> = { good: "text-teal-200", neutral: "text-zinc-300", watch: "text-amber-300" };

/** A three-part bar (low | moderate | high) filled up to the position. */
export function LevelBar({ position, tone }: { position: number | null; tone: Tone }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {[0, 1, 2].map((i) => {
        const fill = position == null ? 0 : Math.max(0, Math.min(1, (position - i / 3) * 3));
        return (
          <span key={i} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-700/60">
            <span className={cn("absolute inset-y-0 left-0 rounded-full", TONE_FILL[tone])} style={{ width: `${fill * 100}%` }} />
          </span>
        );
      })}
    </div>
  );
}

export function LevelWord({ level, tone }: { level: Level | null; tone: Tone }) {
  if (!level) return <span className="text-zinc-500">Not rated</span>;
  return <span className={cn("font-medium capitalize", TONE_TEXT[tone])}>{level}</span>;
}

export function BandPill({ band, className }: { band: Band | null; className?: string }) {
  if (!band) return null;
  const label = BANDS.find((b) => b.key === band)!.label;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", BAND_DOT[band])} />
      {label}
    </span>
  );
}
