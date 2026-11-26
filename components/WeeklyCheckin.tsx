import { Card } from "@/components/ui";
import type { DailyTargets } from "@/lib/nutrition";
import type { WeeklyCheckin as Data } from "@/lib/queries";
import { cn, kg } from "@/lib/utils";

/** This week vs last week: training, nutrition and weight in one glance. */
export function WeeklyCheckin({
  data,
  targets,
  targetsByDate,
}: {
  data: Data;
  targets: DailyTargets;
  /** Each past day's locked target (else today's is used). */
  targetsByDate?: Record<string, NonNullable<DailyTargets>>;
}) {
  const tFor = (date: string) => targetsByDate?.[date] ?? targets;
  const t = data.thisWeek;
  const l = data.lastWeek;
  const proteinHits =
    targets?.protein != null
      ? data.days.filter((d) => d.protein >= (tFor(d.date)?.protein ?? targets.protein!) * 0.9).length
      : null;
  const calorieHits =
    targets != null
      ? data.days.filter((d) => {
          const c = tFor(d.date)?.calories ?? targets.calories;
          return Math.abs(d.calories - c) <= c * 0.1;
        })
          .length
      : null;
  const weightDelta =
    data.weightNow != null && data.weightWeekAgo != null
      ? data.weightNow - data.weightWeekAgo
      : null;

  const tips: string[] = [];
  const sessions = t.workouts + t.activities;
  if (sessions === 0 && l.workouts + l.activities > 0) tips.push("No workouts yet this week.");
  if (proteinHits != null && t.daysLogged >= 2 && proteinHits < t.daysLogged / 2)
    tips.push("Protein is low. Add some to your next meal.");
  if (t.daysLogged === 0)
    tips.push(
      data.today
        ? "Today's meals count from tomorrow."
        : "Log meals to see how you track against your plan.",
    );

  return (
    <Card className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Metric
          label="Workouts"
          value={String(sessions)}
          prev={l.workouts + l.activities}
          cur={sessions}
          note={t.activities ? `${t.workouts} gym · ${t.activities} Garmin` : undefined}
        />
        <Metric label="Sets" value={String(t.sets)} prev={l.sets} cur={t.sets} />
        <Metric
          label="Volume"
          value={t.volume >= 10000 ? `${kg(t.volume / 1000)}t` : `${kg(t.volume)} kg`}
          prev={l.volume}
          cur={t.volume}
        />
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-zinc-800/80 pt-3">
        <Small
          label="Avg kcal"
          value={t.avgCalories != null ? Math.round(t.avgCalories).toLocaleString("en-US") : "–"}
          sub={
            calorieHits != null && t.daysLogged
              ? `${calorieHits}/${t.daysLogged} days on target`
              : `${t.daysLogged} day${t.daysLogged === 1 ? "" : "s"} logged`
          }
        />
        <Small
          label="Protein"
          value={t.avgProtein != null ? `${Math.round(t.avgProtein)} g` : "–"}
          sub={
            proteinHits != null && t.daysLogged
              ? `${proteinHits}/${t.daysLogged} days hit`
              : "daily avg"
          }
        />
        <Small
          label="Weight 7d"
          value={
            weightDelta != null ? `${weightDelta > 0 ? "+" : ""}${kg(weightDelta)} kg` : "–"
          }
          sub={data.weightNow != null ? `now ${kg(data.weightNow)} kg` : "add on Progress"}
        />
      </div>
      {tips.length > 0 && (
        <ul className="space-y-1 text-xs text-zinc-500">
          {tips.map((tip) => (
            <li key={tip}>• {tip}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  prev,
  cur,
  note,
}: {
  label: string;
  value: string;
  prev: number;
  cur: number;
  note?: string;
}) {
  const diff = cur - prev;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      <div
        className={cn(
          "text-[11px] tabular-nums",
          prev === 0 && cur === 0
            ? "text-zinc-600"
            : diff >= 0
              ? "text-emerald-400/80"
              : "text-zinc-500",
        )}
      >
        {prev === 0 && cur === 0
          ? "–"
          : diff === 0
            ? "same as last wk"
            : `${diff > 0 ? "▲" : "▼"} vs last wk`}
        {note && <span className="block text-zinc-500">{note}</span>}
      </div>
    </div>
  );
}

function Small({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-zinc-600">{sub}</div>
    </div>
  );
}
