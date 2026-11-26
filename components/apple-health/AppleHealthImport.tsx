"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { WatchIcon } from "@/components/icons";
import { Button, Card } from "@/components/ui";
import { finishAppleHealthImport, importAppleHealthBatch, removeAppleHealthData } from "@/lib/actions";
import { createAppleHealthParser, batchesOf, type AhSummary, formatPretty } from "@legymdary/shared";
import { ExportFileError, openExport } from "@/lib/apple-health/read-file";
import type { AppleHealthStatus } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Phase =
  | { kind: "idle" }
  | { kind: "reading"; pct: number }
  | { kind: "ready"; summary: AhSummary }
  | { kind: "saving"; summary: AhSummary; done: number; total: number }
  | { kind: "done"; text: string };

const RANGES = [
  { key: "all", label: "Everything", days: null },
  { key: "2y", label: "Last 2 years", days: 730 },
  { key: "1y", label: "Last year", days: 365 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

function sinceFor(days: number | null): string {
  if (days == null) return "0000-00-00";
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function trim(s: AhSummary, since: string): AhSummary {
  const keep = <T extends { date: string }>(xs: T[]) => xs.filter((x) => x.date >= since);
  const days = keep(s.days);
  const sleep = keep(s.sleep);
  const workouts = keep(s.workouts);
  const body = keep(s.body);
  const dates = [...days, ...sleep, ...workouts, ...body].map((x) => x.date).sort();
  return { ...s, days, sleep, workouts, body, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null };
}

export function AppleHealthImport({ status, garminConnected }: { status: AppleHealthStatus | null; garminConnected: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("all");
  const [pending, start] = useTransition();
  const busy = phase.kind === "reading" || phase.kind === "saving" || pending;

  async function read(file: File) {
    setError(null);
    setPhase({ kind: "reading", pct: 0 });
    try {
      let total = 1;
      let lastPaint = 0;
      const { total: t, reader } = await openExport(file, (n) => {
        const now = performance.now();
        if (now - lastPaint > 100) {
          lastPaint = now;
          setPhase({ kind: "reading", pct: Math.min(99, Math.round((n / total) * 100)) });
        }
      });
      total = t || 1;
      const parser = createAppleHealthParser();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(value);
      }
      const summary = parser.finish();
      if (!summary.days.length && !summary.sleep.length && !summary.workouts.length) {
        throw new ExportFileError("No steps, sleep or workouts found in this export.");
      }
      setPhase({ kind: "ready", summary });
    } catch (err) {
      console.error(err);
      setPhase({ kind: "idle" });
      setError(
        err instanceof ExportFileError
          ? err.message
          : "Couldn't read that file. Make sure it's the export.zip from the Health app.",
      );
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  async function save(full: AhSummary) {
    const s = trim(full, sinceFor(RANGES.find((r) => r.key === range)!.days));
    const batches = batchesOf(s);
    setError(null);
    setPhase({ kind: "saving", summary: full, done: 0, total: batches.length });
    for (let i = 0; i < batches.length; i++) {
      const res = await importAppleHealthBatch(batches[i]);
      if ("error" in res) {
        setError(`${res.error} (${i} of ${batches.length} parts saved; uploading again is safe.)`);
        setPhase({ kind: "ready", summary: full });
        return;
      }
      setPhase({ kind: "saving", summary: full, done: i + 1, total: batches.length });
    }
    const fin = await finishAppleHealthImport({
      firstDate: s.from,
      lastDate: s.to,
      days: s.days.length,
      nights: s.sleep.length,
      workouts: s.workouts.length,
      weighIns: s.body.length,
    });
    if ("error" in fin) {
      setError(fin.error);
      setPhase({ kind: "ready", summary: full });
      return;
    }
    setPhase({
      kind: "done",
      text: `Imported ✓ ${s.days.length.toLocaleString("en-US")} days, ${s.sleep.length} nights of sleep, ${s.workouts.length} workouts${s.body.length ? `, ${s.body.length} weigh-ins` : ""}.`,
    });
    router.refresh();
  }

  function remove() {
    if (!confirm("Delete all data imported from Apple Health? Your food log, workouts and any Garmin data stay.")) return;
    start(async () => {
      await removeAppleHealthData();
      setPhase({ kind: "done", text: "Apple Health data removed." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {status && (
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
              <WatchIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">Apple Health imported</div>
              <div className="text-xs text-zinc-500">
                Uploaded {formatDistanceToNow(status.importedAt, { addSuffix: true })}
                {status.firstDate && status.lastDate
                  ? ` · ${formatPretty(status.firstDate)} to ${formatPretty(status.lastDate)}`
                  : ""}
              </div>
            </div>
          </div>
          <p className="text-sm text-zinc-400">
            {status.days.toLocaleString("en-US")} days · {status.nights} nights of sleep · {status.workouts} workouts
            {status.weighIns ? ` · ${status.weighIns} weigh-ins` : ""}
          </p>
          <p className="text-xs text-zinc-500">
            Apple Health doesn&apos;t sync to the web, so upload a new export whenever you want fresh numbers. Uploading
            again updates what&apos;s here; nothing is duplicated.
          </p>
        </Card>
      )}

      {garminConnected && (
        <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-400">
          Garmin is connected too. Days and nights Garmin already has are kept as they are; Apple Health fills the rest.
        </p>
      )}

      {phase.kind !== "ready" && phase.kind !== "saving" && (
        <Card className="space-y-4">
          {!status && (
            <div className="space-y-2 text-sm text-zinc-300">
              <p className="font-medium text-zinc-100">Get your export (on your iPhone)</p>
              <ol className="list-decimal space-y-1 pl-5 text-zinc-400">
                <li>Open the <b className="text-zinc-200">Health</b> app and tap your picture (top right).</li>
                <li>
                  Tap <b className="text-zinc-200">Export All Health Data</b>, then <b className="text-zinc-200">Export</b>. It
                  can take a few minutes.
                </li>
                <li>
                  Choose <b className="text-zinc-200">Save to Files</b> (or AirDrop it to your computer), then pick{" "}
                  <b className="text-zinc-200">export.zip</b> below.
                </li>
              </ol>
            </div>
          )}
          <input
            ref={input}
            type="file"
            accept=".zip,.xml,application/zip,text/xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void read(f);
            }}
          />
          <Button className="w-full" onClick={() => input.current?.click()} disabled={busy}>
            {phase.kind === "reading" ? `Reading your export… ${phase.pct}%` : status ? "Upload a newer export" : "Choose export.zip"}
          </Button>
          {phase.kind === "reading" && (
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${phase.pct}%` }} />
            </div>
          )}
          <p className="text-xs text-zinc-500">
            The file is read on this device. Only daily totals, nights of sleep, workouts and weigh-ins are uploaded,
            never the raw file, heart-rate samples, routes or health records.
          </p>
        </Card>
      )}

      {(phase.kind === "ready" || phase.kind === "saving") && (
        <ReadyCard
          summary={phase.summary}
          saving={phase.kind === "saving" ? phase : null}
          range={range}
          setRange={setRange}
          onSave={(s) => void save(s)}
          onCancel={() => setPhase({ kind: "idle" })}
        />
      )}

      {error && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{error}</p>
      )}
      {phase.kind === "done" && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {phase.text}{" "}
          <Link href="/insights" className="underline">
            See Insights
          </Link>
        </p>
      )}

      {status && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="w-full text-center text-xs text-zinc-500 underline disabled:opacity-50"
        >
          Remove Apple Health data
        </button>
      )}
    </div>
  );
}

function ReadyCard({
  summary,
  saving,
  range,
  setRange,
  onSave,
  onCancel,
}: {
  summary: AhSummary;
  saving: { done: number; total: number } | null;
  range: RangeKey;
  setRange: (r: RangeKey) => void;
  onSave: (s: AhSummary) => void;
  onCancel: () => void;
}) {
  const s = summary;
  const view = trim(s, sinceFor(RANGES.find((r) => r.key === range)!.days));
  const stat = (n: number, label: string) => (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
      <div className="text-xl font-semibold tabular-nums">{n.toLocaleString("en-US")}</div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
  return (
    <Card className="space-y-4">
      <div>
        <div className="font-medium">Found in your export</div>
        <div className="text-xs text-zinc-500">
          {view.from && view.to ? `${formatPretty(view.from)} to ${formatPretty(view.to)}` : "Nothing in this range"}
          {s.sources.length ? ` · from ${s.sources.slice(0, 3).join(", ")}` : ""}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stat(view.days.length, "days of activity")}
        {stat(view.sleep.length, "nights of sleep")}
        {stat(view.workouts.length, "workouts")}
        {stat(view.body.length, "weigh-ins")}
      </div>
      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">How far back</div>
        <div className="grid grid-cols-3 gap-2">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              disabled={!!saving}
              onClick={() => setRange(r.key)}
              className={cn(
                "press h-10 rounded-xl border text-sm",
                range === r.key ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200" : "border-zinc-800 text-zinc-400",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {saving ? (
        <div className="space-y-2">
          <div className="text-sm text-zinc-300">
            Saving… part {Math.min(saving.done + 1, saving.total)} of {saving.total}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-emerald-400 transition-[width]"
              style={{ width: `${Math.round((saving.done / saving.total) * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(s)} disabled={!view.days.length && !view.sleep.length && !view.workouts.length}>
            Import
          </Button>
        </div>
      )}
    </Card>
  );
}
