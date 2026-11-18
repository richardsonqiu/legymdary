"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, ChartFrame, Segmented, tooltipLabelStyle, tooltipStyle } from "@/components/charts/common";
import { ImageIcon, PencilIcon, PlusIcon, TrashIcon, XIcon } from "@/components/icons";
import { Explain } from "@/components/Explain";
import { BodyFigure } from "@/components/body/BodyFigure";
import { Portal } from "@/components/Portal";
import { Button, Card, inputClass } from "@/components/ui";
import type { BodyScan } from "@/db/schema";
import { deleteBodyScan, extractBodyScansAction, saveBodyScans } from "@/lib/actions";
import type { ExtractedScan } from "@/lib/body-scan-ai";
import {
  compareScans,
  leanMass,
  parseSegments,
  SEGMENT_LABEL,
  SEGMENTS,
  segmentBalance,
} from "@/lib/body-scan";
import { prepareScreenshotTiles } from "@/lib/image";
import { cn, formatMedium, formatShort } from "@/lib/utils";

const fmt = (v: number | null | undefined, p = 1) => (v == null ? "–" : String(Math.round(v * 10 ** p) / 10 ** p));
const signed = (v: number | null | undefined, unit = "", p = 1) =>
  v == null || v === 0 ? null : `${v > 0 ? "+" : ""}${fmt(v, p)}${unit}`;

/** Higher-is-better metrics get green when up; lower-is-better when down. */
function deltaTone(v: number | null, betterWhen: "up" | "down" | "none") {
  if (v == null || v === 0 || betterWhen === "none") return "text-zinc-500";
  const good = betterWhen === "up" ? v > 0 : v < 0;
  return good ? "text-emerald-300" : "text-amber-300";
}

export function BodyScans({ scans, targetBodyFat }: { scans: BodyScan[]; targetBodyFat: number | null }) {
  const router = useRouter();
  const [adding, setAdding] = useState<null | "upload" | "manual">(null);
  const [pending, start] = useTransition();
  const latest = scans[scans.length - 1] ?? null;
  const prev = scans.length > 1 ? scans[scans.length - 2] : null;
  const change = latest && prev ? compareScans(prev, latest) : null;
  const seg = latest ? parseSegments(latest.segmentalLean) : null;
  const segFat = latest ? parseSegments(latest.segmentalFat) : null;
  const balance = segmentBalance(seg);
  const lm = latest ? leanMass(latest) : null;
  const balanceLabels = latest?.balance ? (JSON.parse(latest.balance) as Record<string, string | null>) : null;

  return (
    <div className="space-y-3">
      {!latest ? (
        <Card className="space-y-3 text-sm text-zinc-400">
          <p>
            Add an InBody scan from screenshots of the app&apos;s <b>Detail</b> and <b>History</b> screens. Your
            plan and insights then use your real muscle and fat numbers.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setAdding("upload")}>
              <ImageIcon className="h-4 w-4" /> Upload screenshots
            </Button>
            <Button variant="secondary" onClick={() => setAdding("manual")}>
              <PencilIcon className="h-4 w-4" /> Enter manually
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="space-y-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-semibold">{formatMedium(latest.date)}</div>
                <div className="text-xs text-zinc-500">
                  {latest.device}
                  {latest.score != null ? ` · score ${latest.score}` : ""}
                  {latest.bodyType ? ` · ${latest.bodyType}` : ""}
                </div>
              </div>
              {change && <div className="text-[11px] text-zinc-500">vs {formatShort(prev!.date)}</div>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["Weight", latest.weight, "kg", change?.weight ?? null, "none"],
                  ["Muscle", latest.skeletalMuscle, "kg", change?.muscle ?? null, "up"],
                  ["Fat mass", latest.fatMass, "kg", change?.fat ?? null, "down"],
                  ["Body fat", latest.bodyFatPct, "%", change?.bodyFatPct ?? null, "down"],
                  ["Visceral", latest.visceralFat, "", change?.visceral ?? null, "down"],
                  ["Waist-hip", latest.waistHip, "", prev && latest.waistHip != null && prev.waistHip != null ? Math.round((latest.waistHip - prev.waistHip) * 100) / 100 : null, "down"],
                ] as const
              ).map(([label, v, unit, d, better]) => (
                <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
                  <div className="text-base font-semibold tabular-nums">
                    {fmt(v, label === "Waist-hip" ? 2 : 1)}
                    <span className="ml-0.5 text-[10px] font-normal text-zinc-500">{unit}</span>
                  </div>
                  {signed(d, "", label === "Waist-hip" ? 2 : label === "Visceral" ? 0 : 1) && (
                    <div className={cn("text-[11px] tabular-nums", deltaTone(d, better))}>
                      {signed(d, "", label === "Waist-hip" ? 2 : label === "Visceral" ? 0 : 1)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {change?.verdict && (
              <p
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm",
                  change.verdict.tone === "good" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
                  change.verdict.tone === "bad" && "border-amber-500/30 bg-amber-500/10 text-amber-200",
                  change.verdict.tone === "mixed" && "border-zinc-800 bg-zinc-900/60 text-zinc-300",
                )}
              >
                {change.verdict.text} over {change.days} days.
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
              {lm != null && <span>Lean mass {lm} kg</span>}
              {latest.bmr != null && <span>BMR {fmt(latest.bmr, 0)} kcal</span>}
              {latest.totalBodyWater != null && <span>Body water {fmt(latest.totalBodyWater)} L</span>}
              {latest.protein != null && <span>Protein {fmt(latest.protein)} kg</span>}
              {latest.smi != null && <span>SMI {fmt(latest.smi)}</span>}
              {targetBodyFat != null && lm != null && (
                <span className="text-zinc-300">
                  {targetBodyFat}% body fat at about {Math.round((lm / (1 - targetBodyFat / 100)) * 10) / 10} kg (keeping
                  lean mass)
                </span>
              )}
            </div>
          </Card>

          {(seg || segFat) && (
            <Card className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                By body part (% of ideal)
                <Explain k="segmental" />
              </div>
              <BodyFigure lean={seg} fat={segFat} />
              {balanceLabels && (
                <p className="text-xs text-zinc-500">
                  Balance: upper {balanceLabels.upper ?? "–"}, lower {balanceLabels.lower ?? "–"}, upper vs lower{" "}
                  {balanceLabels.upperLower ?? "–"}
                </p>
              )}
              {balance?.advice && <p className="text-sm text-amber-200/90">{balance.advice.charAt(0).toUpperCase() + balance.advice.slice(1)}.</p>}
            </Card>
          )}

          {scans.length > 1 && <ScanTrend scans={scans} />}

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setAdding("upload")}>
              <ImageIcon className="h-4 w-4" /> Add from screenshots
            </Button>
            <Button variant="secondary" onClick={() => setAdding("manual")}>
              <PlusIcon className="h-4 w-4" /> Enter manually
            </Button>
          </div>

          <details className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm">
            <summary className="cursor-pointer py-1 text-zinc-400">All scans ({scans.length})</summary>
            <ul className="divide-y divide-zinc-800/80">
              {[...scans].reverse().map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 text-xs">
                    <span className="text-zinc-200">{formatMedium(s.date)}</span>
                    <span className="text-zinc-500">
                      {" "}
                      · {fmt(s.weight)} kg · muscle {fmt(s.skeletalMuscle)} · fat {fmt(s.bodyFatPct)}%
                    </span>
                  </span>
                  <button
                    aria-label="Delete scan"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Delete the ${formatMedium(s.date)} scan?`)) return;
                      start(async () => {
                        await deleteBodyScan(s.id);
                        router.refresh();
                      });
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {adding && (
        <AddScanSheet
          mode={adding}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

const TREND = [
  { value: "skeletalMuscle", label: "Muscle", unit: "kg" },
  { value: "fatMass", label: "Fat mass", unit: "kg" },
  { value: "bodyFatPct", label: "Body fat", unit: "%" },
  { value: "weight", label: "Weight", unit: "kg" },
  { value: "visceralFat", label: "Visceral", unit: "" },
] as const;

function ScanTrend({ scans }: { scans: BodyScan[] }) {
  const [metric, setMetric] = useState<(typeof TREND)[number]["value"]>("skeletalMuscle");
  const meta = TREND.find((t) => t.value === metric)!;
  const data = useMemo(() => scans.map((s) => ({ date: s.date, v: s[metric] })), [scans, metric]);
  return (
    <Card className="space-y-3">
      <Segmented options={TREND.map((t) => ({ label: t.label, value: t.value }))} value={metric} onChange={setMetric} className="max-w-full overflow-x-auto" />
      <ChartFrame height={170}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid stroke={CHART.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatShort} stroke={CHART.axis} fontSize={10} tickLine={false} axisLine={false} />
            <YAxis domain={["auto", "auto"]} stroke={CHART.axis} fontSize={10} tickLine={false} axisLine={false} width={40} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              labelFormatter={(l) => formatMedium(String(l))}
              formatter={(v) => [`${v} ${meta.unit}`, meta.label]}
            />
            <Line type="monotone" dataKey="v" stroke={CHART.line} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </Card>
  );
}

const EMPTY: ExtractedScan = {
  date: "",
  time: null,
  score: null,
  weight: null,
  skeletalMuscle: null,
  fatMass: null,
  bodyFatPct: null,
  bmi: null,
  visceralFat: null,
  waistHip: null,
  totalBodyWater: null,
  protein: null,
  mineral: null,
  bmr: null,
  smi: null,
  segmentalLean: null,
  segmentalFat: null,
  bodyType: null,
  balance: null,
};

const FIELDS: [keyof ExtractedScan, string][] = [
  ["weight", "Weight kg"],
  ["skeletalMuscle", "Muscle kg"],
  ["fatMass", "Fat mass kg"],
  ["bodyFatPct", "Body fat %"],
  ["visceralFat", "Visceral lvl"],
  ["waistHip", "Waist-hip"],
  ["bmr", "BMR kcal"],
  ["totalBodyWater", "Water L"],
  ["score", "Score"],
];

function AddScanSheet({ mode, onClose, onSaved }: { mode: "upload" | "manual"; onClose: () => void; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [scans, setScans] = useState<ExtractedScan[]>(mode === "manual" ? [{ ...EMPTY, date: new Date().toISOString().slice(0, 10) }] : []);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, startSave] = useTransition();

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])].slice(0, 4);
    e.target.value = "";
    if (!files.length) return;
    setError(null);
    setBusy(true);
    try {
      setStatus("Preparing screenshots…");
      const tiles = (await Promise.all(files.map(prepareScreenshotTiles))).flat().slice(0, 20);
      setStatus(`Reading ${tiles.length} image section${tiles.length > 1 ? "s" : ""} with AI…`);
      const res = await extractBodyScansAction(tiles);
      if (!res.ok) setError(res.error);
      else {
        setScans(res.scans);
        setStatus(res.notes ? `Check the values below. Note: ${res.notes}` : "Check the values below, then save.");
      }
    } catch {
      setError("Couldn't read those images. Try PNG or JPEG screenshots.");
    } finally {
      setBusy(false);
    }
  }

  function patch(i: number, key: keyof ExtractedScan, value: string) {
    setScans((prev) =>
      prev.map((s, k) => {
        if (k !== i) return s;
        if (key === "date") return { ...s, date: value };
        const n = value.trim() === "" ? null : Number(value);
        return { ...s, [key]: n != null && Number.isFinite(n) ? n : null };
      }),
    );
  }

  function save() {
    setError(null);
    startSave(async () => {
      const res = await saveBodyScans(scans);
      if ("error" in res) setError(res.error);
      else onSaved();
    });
  }

  return (
    <Portal>
      <div className="animate-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
        <div className="animate-sheet pb-safe flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-zinc-800 bg-zinc-950 sm:rounded-3xl">
          <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
            <h2 className="font-semibold">Add body-composition scan</h2>
            <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800">
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {mode === "upload" && (
              <>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
                <Button className="w-full" onClick={() => fileRef.current?.click()} disabled={busy}>
                  <ImageIcon className="h-4 w-4" /> {scans.length ? "Read different screenshots" : "Choose screenshots"}
                </Button>
                <p className="text-xs text-zinc-500">
                  Tip: the InBody app&apos;s <b>Detail</b> screen gives full data incl. segmental analysis; the{" "}
                  <b>History</b> screen adds your earlier scans. Long screenshots are fine (up to 4 at once).
                </p>
              </>
            )}
            {status && <p className="text-sm text-zinc-400">{busy ? "⏳ " : ""}{status}</p>}
            {error && <p className="text-sm text-amber-300">{error}</p>}

            {scans.map((s, i) => (
              <div key={i} className="animate-item-in space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="flex items-center gap-2">
                  <input type="date" value={s.date} onChange={(e) => patch(i, "date", e.target.value)} className={cn(inputClass, "h-10 text-sm")} />
                  <button
                    aria-label="Remove scan"
                    onClick={() => setScans((p) => p.filter((_, k) => k !== i))}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-800"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {FIELDS.map(([k, label]) => (
                    <label key={k} className="block">
                      <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
                      <input
                        inputMode="decimal"
                        defaultValue={s[k] == null ? "" : String(s[k])}
                        onBlur={(e) => patch(i, k, e.target.value)}
                        className={cn(inputClass, "h-9 px-2 text-sm tabular-nums")}
                      />
                    </label>
                  ))}
                </div>
                {s.segmentalLean && (
                  <p className="text-[11px] text-zinc-500">
                    Segmental lean included:{" "}
                    {SEGMENTS.filter((k) => s.segmentalLean?.[k]).map((k) => `${SEGMENT_LABEL[k]} ${s.segmentalLean![k]!.kg ?? "–"} kg${s.segmentalLean![k]!.pct != null ? ` (${s.segmentalLean![k]!.pct}%)` : ""}`).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-zinc-800/80 px-4 py-3">
            <Button size="lg" className="w-full" onClick={save} disabled={saving || busy || !scans.length || scans.some((s) => !s.date)}>
              {saving ? "Saving…" : `Save ${scans.length || ""} scan${scans.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
