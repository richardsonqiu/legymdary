"use client";

import { todayStr } from "@legymdary/shared";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { RefreshIcon } from "@/components/icons";
import { Button, Card, inputClass } from "@/components/ui";
import { retryGarminDataset, runGarminImportStep, setGarminHistoryDays } from "@/lib/actions";
import type { ImportStatus } from "@/lib/garmin/raw-import";
import { cn } from "@/lib/utils";

type Status = Omit<ImportStatus, "calls" | "rowsWritten">;

const DEPTHS = [30, 90, 180, 365, 730];

export function GarminDataExplorer({
  initial,
  historyDays,
}: {
  initial: Status;
  historyDays: number;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(initial);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const stop = useRef(false);
  const [pending, start] = useTransition();

  // Raw viewer
  const [viewDataset, setViewDataset] = useState(initial.datasets.find((d) => d.rows)?.id ?? "daily_summary");
  const [viewKey, setViewKey] = useState(todayStr());
  const [raw, setRaw] = useState<string | null>(null);

  async function importAll() {
    setRunning(true);
    stop.current = false;
    let totalCalls = 0;
    let totalRows = 0;
    for (let step = 1; step <= 60 && !stop.current; step++) {
      const res = await runGarminImportStep();
      if ("error" in res) {
        setLog(res.error);
        break;
      }
      totalCalls += res.calls;
      totalRows += res.rowsWritten;
      setStatus(res);
      setLog(`Step ${step}: ${totalCalls} Garmin requests, ${totalRows.toLocaleString("en-US")} records saved so far…`);
      if (res.done) {
        setLog(`Done ✓ ${totalCalls} requests, ${totalRows.toLocaleString("en-US")} records saved.`);
        break;
      }
      if (res.stoppedReason && !res.stoppedReason.startsWith("time budget")) {
        setLog(res.stoppedReason);
        break;
      }
    }
    setRunning(false);
    router.refresh();
  }

  async function view() {
    setRaw("Loading…");
    const res = await fetch(
      `/api/garmin/raw?dataset=${encodeURIComponent(viewDataset)}&key=${encodeURIComponent(viewKey)}`,
    );
    setRaw(res.ok ? await res.text() : ((await res.json().catch(() => null))?.error ?? "Not found."));
  }

  const overall = Math.round(
    status.datasets.reduce((a, d) => a + d.percent, 0) / Math.max(1, status.datasets.length),
  );
  const groups = [...new Set(status.datasets.map((d) => d.group))];
  const viewable = status.datasets.filter((d) => d.rows > 0);

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="font-semibold">Import everything</div>
          <div className="text-sm tabular-nums text-zinc-400">{overall}%</div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-emerald-400 transition-[width] duration-500"
            style={{ width: `${overall}%` }}
          />
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-500">
            Detailed history (per-day data, heart rate, sleep, HRV…)
          </span>
          <select
            value={historyDays}
            disabled={running || pending}
            onChange={(e) =>
              start(async () => {
                await setGarminHistoryDays(Number(e.target.value));
                router.refresh();
              })
            }
            className={cn(inputClass, "px-2.5")}
          >
            {DEPTHS.map((d) => (
              <option key={d} value={d}>
                {d === 730 ? "2 years" : d === 365 ? "1 year" : `${d} days`}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-zinc-600">
            Daily summaries, sleep, HRV, Body Battery, steps, weigh-ins and activities always cover 1 year.
          </span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            className="col-span-2"
            onClick={importAll}
            disabled={running || pending || !!status.pausedUntil}
          >
            <RefreshIcon className={cn("h-5 w-5", running && "animate-spin")} />
            {running
            ? "Importing… keep this page open"
            : status.done
              ? "Refresh all data"
              : status.pausedUntil
                ? "Paused, resumes automatically"
                : overall > 0
                  ? "Continue import now"
                  : "Import everything"}
          </Button>
          {running && (
            <Button variant="secondary" className="col-span-2" onClick={() => (stop.current = true)}>
              Pause
            </Button>
          )}
        </div>
        {log && <p className="text-sm text-zinc-400">{log}</p>}
        {status.pausedUntil && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Garmin asked us to slow down. The import resumes by itself after{" "}
            {new Date(status.pausedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Your
            newest data is already in.
          </p>
        )}
        {!status.done && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-xs leading-relaxed text-zinc-400">
            <div className="mb-1 font-medium text-zinc-200">The import continues on its own</div>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>Each time you open the app it imports a bit more (at most every 30 min).</li>
              <li>It also runs once a day by itself.</li>
              <li>If Garmin asks it to slow down, it waits and resumes where it stopped.</li>
              <li>Newest data comes first. Older history fills in later.</li>
            </ul>
            <div className="mt-1.5">To speed it up, tap <b className="text-zinc-200">Continue import now</b> and keep this page open.</div>
          </div>
        )}
      </Card>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Datasets</h2>
        {groups.map((g) => (
          <Card key={g} className="space-y-2.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{g}</div>
            {status.datasets
              .filter((d) => d.group === g)
              .map((d) => (
                <div key={d.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{d.label}</span>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                      {d.status === "unavailable" ? (
                        <button
                          className="underline"
                          onClick={() =>
                            start(async () => {
                              await retryGarminDataset(d.id);
                              router.refresh();
                            })
                          }
                        >
                          not on this account · retry
                        </button>
                      ) : (
                        <>
                          {d.rows.toLocaleString("en-US")} rows
                          {d.firstDataDate && d.kind !== "snapshot"
                            ? ` · ${d.firstDataDate} → ${d.lastDataDate}`
                            : ""}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500",
                        d.status === "unavailable" ? "bg-zinc-700" : "bg-emerald-400/80",
                      )}
                      style={{ width: `${d.percent}%` }}
                    />
                  </div>
                  {d.lastError && d.status !== "unavailable" && (
                    <p className="text-[11px] text-amber-300/80">{d.lastError}</p>
                  )}
                </div>
              ))}
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Download</h2>
        <Card className="space-y-2">
          <a href="/api/garmin/inventory" className="block rounded-lg px-1 py-1.5 text-sm hover:bg-zinc-800">
            📋 Data inventory (Markdown): every field, coverage and value ranges, personal identifiers
            redacted. <b>Share this with Claude to design your analysis.</b>
          </a>
          <a href="/api/garmin/inventory?format=json" className="block rounded-lg px-1 py-1.5 text-sm hover:bg-zinc-800">
            📋 Data inventory (JSON)
          </a>
          <a href="/api/garmin/export" className="block rounded-lg px-1 py-1.5 text-sm hover:bg-zinc-800">
            📦 Everything, raw (NDJSON): one Garmin response per line. Contains your
            identifiers; keep it private.
          </a>
          <a href="/api/export?type=garmin" className="block rounded-lg px-1 py-1.5 text-sm hover:bg-zinc-800">
            📊 Daily metrics (CSV)
          </a>
        </Card>
      </section>

      {viewable.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Raw viewer</h2>
          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={viewDataset}
                onChange={(e) => setViewDataset(e.target.value)}
                className={cn(inputClass, "px-2.5 text-sm")}
              >
                {viewable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <input
                value={viewKey}
                onChange={(e) => setViewKey(e.target.value)}
                placeholder="YYYY-MM-DD or activity id"
                className={cn(inputClass, "text-sm")}
              />
            </div>
            <Button variant="secondary" className="w-full" onClick={view}>
              Show raw data
            </Button>
            {raw && (
              <pre className="max-h-96 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-300">
                {raw}
              </pre>
            )}
            <p className="text-xs text-zinc-600">
              Snapshots (profile, HR zones, weight goals) use the key <code>latest</code>.
            </p>
          </Card>
        </section>
      )}
    </div>
  );
}
