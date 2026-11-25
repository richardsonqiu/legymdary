import { Card } from "@/components/ui";
import type { OuraExtras } from "@/lib/queries";
import { cn } from "@/lib/utils";

const RESILIENCE: Record<string, string> = {
  limited: "Limited",
  adequate: "Adequate",
  solid: "Solid",
  strong: "Strong",
  exceptional: "Exceptional",
};
const STRESS: Record<string, string> = { restored: "Restored", normal: "Normal", stressful: "Stressful" };

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string | null; tone?: "good" | "warn" | null }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={cn("mt-0.5 text-lg font-semibold tabular-nums", tone === "good" && "text-emerald-300", tone === "warn" && "text-amber-300")}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-400">{sub}</div>}
    </div>
  );
}

/** Oura's own measures for one day: readiness, body temperature, SpO2, stress, resilience. */
export function OuraExtrasCard({ day, usual }: { day: OuraExtras; usual?: { readiness: number | null } }) {
  const temp = day.temperatureDeviation;
  const tiles = [
    day.readinessScore != null && (
      <Tile
        key="r"
        label="Oura readiness"
        value={String(Math.round(day.readinessScore))}
        sub={usual?.readiness != null ? `usual ${usual.readiness}` : null}
        tone={day.readinessScore >= 85 ? "good" : day.readinessScore < 70 ? "warn" : null}
      />
    ),
    temp != null && (
      <Tile
        key="t"
        label="Body temperature"
        value={`${temp > 0 ? "+" : ""}${temp.toFixed(1)} °C`}
        sub="vs your usual"
        tone={Math.abs(temp) >= 0.5 ? "warn" : null}
      />
    ),
    day.spo2Avg != null && (
      <Tile
        key="s"
        label="Blood oxygen"
        value={`${day.spo2Avg.toFixed(1)}%`}
        sub={day.breathingDisturbanceIndex != null ? `breathing disturbances ${Math.round(day.breathingDisturbanceIndex)}/h` : "overnight average"}
        tone={day.spo2Avg < 94 ? "warn" : null}
      />
    ),
    (day.stressHighMin != null || day.recoveryHighMin != null) && (
      <Tile
        key="st"
        label="Stress / recovery"
        value={`${day.stressHighMin ?? 0} / ${day.recoveryHighMin ?? 0} min`}
        sub={day.stressSummary ? STRESS[day.stressSummary] ?? day.stressSummary : "time in high stress / high recovery"}
      />
    ),
    day.resilienceLevel && <Tile key="re" label="Resilience" value={RESILIENCE[day.resilienceLevel] ?? day.resilienceLevel} />,
    day.vo2Max != null && <Tile key="v" label="VO2 max" value={String(Math.round(day.vo2Max))} sub="ml/kg/min" />,
    day.vascularAge != null && <Tile key="a" label="Cardiovascular age" value={`${Math.round(day.vascularAge)} y`} />,
  ].filter(Boolean);
  if (!tiles.length) return null;
  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-2 gap-2">{tiles}</div>
      {temp != null && Math.abs(temp) >= 0.5 && (
        <p className="text-xs text-amber-200/90">
          Your temperature is {Math.abs(temp).toFixed(1)} °C {temp > 0 ? "above" : "below"} usual. That can mean you&apos;re fighting
          something off, a late meal or drinks, or your cycle. Go easier if you feel off.
        </p>
      )}
      <p className="text-[11px] text-zinc-500">From your Oura Ring.</p>
    </Card>
  );
}
