import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTransition } from "@/components/PageTransition";
import { GarminAttribution } from "@/components/garmin/GarminAttribution";
import { ArrowLeftIcon } from "@/components/icons";
import { Card, SectionTitle } from "@/components/ui";
import { getActivityView, trainingEffectWords, ZONES } from "@/lib/garmin/activity";
import { requireUserId } from "@/lib/session";
import { cn, formatPretty } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Activity" };

const r = (v: number | null, p = 0) => (v == null ? null : Math.round(v * 10 ** p) / 10 ** p);
function dur(sec: number | null) {
  if (sec == null) return "–";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
const pace = (minPerKm: number | null) => {
  if (minPerKm == null || !Number.isFinite(minPerKm)) return "–";
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, "0")} /km`;
};

function Big({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-zinc-500">{sub}</div>}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  if (value == null) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-zinc-400">
        {label}
        {hint && <span className="block text-[11px] text-zinc-600">{hint}</span>}
      </span>
      <span className="shrink-0 tabular-nums text-zinc-100">{value}</span>
    </div>
  );
}

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  if (!/^[\w-]{1,40}$/.test(id)) notFound();
  const a = await getActivityView(userId, id);
  if (!a) notFound();
  const fromApple = a.id.startsWith("apple-");
  const fromSheet = a.id.startsWith("sheet-");

  const zoneTotal = a.zonesSec.reduce<number>((acc, z) => acc + (z ?? 0), 0);
  const teWords = trainingEffectWords(a.aerobicTE);
  const anTeWords = trainingEffectWords(a.anaerobicTE);

  return (
    <PageTransition className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/history"
          transitionTypes={["nav-back"]}
          className="-ml-2 inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-zinc-400 hover:bg-zinc-800"
        >
          <ArrowLeftIcon className="h-4 w-4" /> History
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{a.name}</h1>
        <p className="text-sm text-zinc-400">
          {a.typeLabel}
          {a.date ? ` · ${formatPretty(a.date)}` : ""}
          {a.startLocal ? ` · ${a.startLocal.slice(11, 16)}` : ""}
          {a.location ? ` · ${a.location}` : ""}
        </p>
      </header>

      <section className="grid grid-cols-3 gap-2">
        <Big label="Time" value={dur(a.durationSec)} sub={a.movingSec && a.durationSec && a.movingSec < a.durationSec - 30 ? `moving ${dur(a.movingSec)}` : null} />
        <Big label="Distance" value={a.distanceKm != null ? `${r(a.distanceKm, 2)} km` : "–"} />
        {a.paceMinPerKm != null ? (
          <Big label="Avg pace" value={pace(a.paceMinPerKm)} />
        ) : (
          <Big label="Avg speed" value={a.speedKmh != null ? `${r(a.speedKmh, 1)} km/h` : "–"} />
        )}
        <Big label="Avg HR" value={a.avgHr != null ? `${r(a.avgHr)}` : "–"} sub={a.maxHr != null ? `max ${r(a.maxHr)} bpm` : "bpm"} />
        <Big label="Calories" value={a.calories != null ? `${r(a.calories)}` : "–"} sub="kcal" />
        <Big label="Climb" value={a.elevationGain != null ? `${r(a.elevationGain)} m` : "–"} />
      </section>

      {(a.aerobicTE != null || a.load != null) && (
        <section>
          <SectionTitle>What this did for you</SectionTitle>
          <Card className="space-y-3">
            {a.aerobicTE != null && (
              <div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-zinc-300">Aerobic effect (endurance)</span>
                  <span className="font-semibold tabular-nums">{r(a.aerobicTE, 1)} / 5</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="bar-fill h-full rounded-full bg-emerald-400" style={{ width: `${(a.aerobicTE / 5) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-zinc-500">{teWords}</p>
              </div>
            )}
            {a.anaerobicTE != null && (
              <div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-zinc-300">Anaerobic effect (speed &amp; power)</span>
                  <span className="font-semibold tabular-nums">{r(a.anaerobicTE, 1)} / 5</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="bar-fill h-full rounded-full bg-violet-400" style={{ width: `${(a.anaerobicTE / 5) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-zinc-500">{anTeWords}</p>
              </div>
            )}
            <div className="divide-y divide-zinc-800/70">
              <Row label="Training load" value={a.load != null ? `${r(a.load)}` : null} hint="How hard this was on your body" />
              <Row label="Main benefit" value={a.teLabel ? a.teLabel.replace(/_/g, " ").toLowerCase() : null} />
              <Row label="Body Battery used" value={a.bodyBatteryImpact != null ? `${r(a.bodyBatteryImpact)}` : null} />
              <Row
                label="Intensity minutes"
                value={a.intensityModerate != null || a.intensityVigorous != null ? `${r(a.intensityModerate ?? 0)} moderate · ${r(a.intensityVigorous ?? 0)} vigorous` : null}
                hint="Guideline: 150 moderate (or 75 vigorous) a week"
              />
            </div>
          </Card>
        </section>
      )}

      {zoneTotal > 0 && (
        <section>
          <SectionTitle>Heart-rate zones</SectionTitle>
          <Card className="space-y-2.5">
            {ZONES.map((z, i) => {
              const sec = a.zonesSec[i] ?? 0;
              const pct = Math.round((sec / zoneTotal) * 100);
              return (
                <div key={z.n}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="text-zinc-300">
                      Zone {z.n} · {z.name} <span className="text-zinc-500">· {z.hint}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-400">
                      {dur(sec)} · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={cn(
                        "bar-fill h-full rounded-full",
                        ["bg-zinc-400", "bg-sky-400", "bg-emerald-400", "bg-amber-400", "bg-rose-400"][i],
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {a.splits.length > 0 && (
        <section>
          <SectionTitle>Splits</SectionTitle>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-right font-medium">Dist</th>
                  <th className="px-3 py-2 text-right font-medium">Time</th>
                  <th className="px-3 py-2 text-right font-medium">{a.paceMinPerKm != null ? "Pace" : "HR"}</th>
                  <th className="px-3 py-2 text-right font-medium">{a.paceMinPerKm != null ? "HR" : "Climb"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {a.splits.map((s) => (
                  <tr key={s.n}>
                    <td className="px-3 py-1.5 text-zinc-500">{s.n}</td>
                    <td className="px-3 py-1.5 text-right">{s.distanceKm != null ? s.distanceKm.toFixed(2) : "–"}</td>
                    <td className="px-3 py-1.5 text-right">{dur(s.durationSec)}</td>
                    <td className="px-3 py-1.5 text-right">{a.paceMinPerKm != null ? pace(s.paceMinPerKm) : (r(s.avgHr) ?? "–")}</td>
                    <td className="px-3 py-1.5 text-right">{a.paceMinPerKm != null ? (r(s.avgHr) ?? "–") : s.elevationGain != null ? `${r(s.elevationGain)} m` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {(a.sets.length > 0 || a.steps.length > 0) && (
        <section>
          <SectionTitle>Strength</SectionTitle>
          <Card className="divide-y divide-zinc-800/70">
            {a.sets.map((s, i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="text-zinc-200">{s.name}</span>
                <span className="shrink-0 tabular-nums text-zinc-400">
                  {[s.sets != null ? `${s.sets} sets` : null, s.reps != null ? `${s.reps} reps` : null, s.maxWeightKg ? `top ${r(s.maxWeightKg, 1)} kg` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            ))}
            {a.sets.length === 0 &&
              a.steps.map((s, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className="text-zinc-200">{s.name}</span>
                  <span className="shrink-0 text-zinc-400">{s.detail}</span>
                </div>
              ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>More details</SectionTitle>
        <Card className="divide-y divide-zinc-800/70">
          <Row label="Min heart rate" value={a.minHr != null ? `${r(a.minHr)} bpm` : null} />
          <Row label="Max speed" value={a.maxSpeedKmh != null ? `${r(a.maxSpeedKmh, 1)} km/h` : null} />
          <Row label="Descent" value={a.elevationLoss != null ? `${r(a.elevationLoss)} m` : null} />
          <Row label="Cadence" value={a.cadenceAvg != null ? `${r(a.cadenceAvg)}${a.cadenceMax != null ? ` (max ${r(a.cadenceMax)})` : ""} ${a.cadenceUnit ?? ""}` : null} />
          <Row label="Power" value={a.powerAvg != null ? `${r(a.powerAvg)} W avg${a.powerNorm != null ? ` · ${r(a.powerNorm)} W normalised` : ""}${a.powerMax != null ? ` · ${r(a.powerMax)} W max` : ""}` : null} />
          <Row label="Stride length" value={a.strideCm != null ? `${r(a.strideCm)} cm` : null} />
          <Row label="Ground contact" value={a.groundContactMs != null ? `${r(a.groundContactMs)} ms` : null} hint="Shorter = springier running" />
          <Row label="Vertical bounce" value={a.verticalOscCm != null ? `${r(a.verticalOscCm, 1)} cm` : null} />
          <Row label="VO2 max" value={a.vo2max != null ? `${r(a.vo2max)}` : null} hint="Aerobic fitness. Higher is fitter" />
          <Row label="Temperature" value={a.tempMin != null || a.tempMax != null ? `${r(a.tempMin) ?? "–"}–${r(a.tempMax) ?? "–"} °C` : null} />
          <Row label="Sweat loss (estimate)" value={a.sweatMl != null ? `${r(a.sweatMl)} ml` : null} hint="Roughly how much to drink back" />
        </Card>
        {!fromApple && !fromSheet && (
          <a href={`/api/garmin/fit/${a.id}`} className="mt-2 block text-center text-xs text-zinc-500 underline">
            Download original .FIT file
          </a>
        )}
      </section>
      {fromApple || fromSheet ? (
        <p className="text-center text-[11px] text-zinc-600">{fromApple ? "Data from Apple Health" : "Imported from a spreadsheet"}</p>
      ) : (
        <GarminAttribution className="text-center" />
      )}
    </PageTransition>
  );
}
