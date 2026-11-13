import { GarminAttribution } from "@/components/garmin/GarminAttribution";
import { Card } from "@/components/ui";
import type { GarminActivity } from "@/db/schema";
import { formatShort, kg } from "@/lib/utils";

function dur(sec: number | null) {
  if (!sec) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Recent Garmin activities (runs, rides, walks, strength…). */
export function GarminActivityList({ activities }: { activities: GarminActivity[] }) {
  if (!activities.length) {
    return (
      <Card className="text-sm text-zinc-500">No Garmin activities in the last 30 days.</Card>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {activities.map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{a.name}</div>
              <div className="text-xs tabular-nums text-zinc-500">
                {[
                  formatShort(a.date),
                  dur(a.durationSec),
                  a.distanceM ? `${kg(a.distanceM / 1000)} km` : null,
                  a.avgHr ? `${Math.round(a.avgHr)} bpm` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {a.calories != null && (
              <div className="shrink-0 text-right text-sm font-semibold tabular-nums">
                {Math.round(a.calories)}
                <span className="ml-0.5 text-[10px] font-normal text-zinc-500">kcal</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <GarminAttribution />
    </div>
  );
}
