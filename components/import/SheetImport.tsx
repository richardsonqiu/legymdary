"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { CheckIcon, DownloadIcon, SheetIcon, TrashIcon } from "@/components/icons";
import { Button, Card, SectionTitle } from "@/components/ui";
import { finishSheetImport, importSheetBatch, removeSheetImport, startSheetImport } from "@/lib/actions";
import { activityLabel, exerciseKey, parseSheets, type ImportCardio, type ImportSession, type ParsedImport } from "@/lib/sheet-import/format";
import { readSpreadsheet, SheetFileError } from "@/lib/sheet-import/read";
import { cn, formatPretty, todayStr } from "@/lib/utils";

export type PastImport = { id: number; fileName: string; workouts: number; sets: number; activities: number; createdAt: string };

type Stage =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "preview"; fileName: string; parsed: ParsedImport }
  | { kind: "importing"; done: number; total: number }
  | { kind: "done"; result: Totals }
  | { kind: "error"; message: string };

type Totals = { workouts: number; sets: number; skipped: number; activities: number; activitiesSkipped: number; newExercises: string[] };

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/** Splits the work into requests the server accepts (≤ 80 sessions / 1,500 sets, ≤ 400 activities). */
function batches(sessions: ImportSession[], cardio: ImportCardio[]) {
  const out: { sessions: ImportSession[]; cardio: ImportCardio[] }[] = [];
  let cur: ImportSession[] = [];
  let setN = 0;
  for (const s of sessions) {
    const n = s.exercises.reduce((m, e) => m + e.sets.length, 0);
    if (cur.length && (cur.length >= 80 || setN + n > 1500)) {
      out.push({ sessions: cur, cardio: [] });
      cur = [];
      setN = 0;
    }
    cur.push(s);
    setN += n;
  }
  if (cur.length) out.push({ sessions: cur, cardio: [] });
  for (let i = 0; i < cardio.length; i += 400) out.push({ sessions: [], cardio: cardio.slice(i, i + 400) });
  return out;
}

export function SheetImport({ library, past }: { library: string[]; past: PastImport[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [removing, startRemove] = useTransition();
  const [removeId, setRemoveId] = useState<number | null>(null);
  const known = new Set(library.map(exerciseKey));

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setStage({ kind: "reading" });
    try {
      const wb = await readSpreadsheet(file);
      const parsed = parseSheets(wb.sheets, { today: todayStr(), date1904: wb.date1904 });
      if (!parsed.found.workouts && !parsed.found.cardio) {
        setStage({ kind: "error", message: "No Workouts or Cardio sheet found. Start from the template so the columns match." });
        return;
      }
      setStage({ kind: "preview", fileName: file.name, parsed });
    } catch (err) {
      setStage({ kind: "error", message: err instanceof SheetFileError ? err.message : "Couldn't read that file. Save it as .xlsx or .csv and try again." });
    }
  }

  async function runImport(fileName: string, parsed: ParsedImport) {
    const work = batches(parsed.sessions, parsed.cardio);
    setStage({ kind: "importing", done: 0, total: work.length });
    const start = await startSheetImport(fileName);
    if ("error" in start) {
      setStage({ kind: "error", message: start.error });
      return;
    }
    const totals: Totals = { workouts: 0, sets: 0, skipped: 0, activities: 0, activitiesSkipped: 0, newExercises: [] };
    try {
      for (let i = 0; i < work.length; i++) {
        const res = await importSheetBatch(start.importId, work[i]);
        if ("error" in res) {
          setStage({ kind: "error", message: `${res.error}${totals.workouts || totals.activities ? " The rows before this point were imported; you can undo them below." : ""}` });
          return;
        }
        totals.workouts += res.workouts;
        totals.sets += res.sets;
        totals.skipped += res.skipped;
        totals.activities += res.activities;
        totals.activitiesSkipped += res.activitiesSkipped;
        totals.newExercises.push(...res.newExercises);
        setStage({ kind: "importing", done: i + 1, total: work.length });
      }
      setStage({ kind: "done", result: totals });
    } catch {
      setStage({ kind: "error", message: "The connection dropped during the import. Anything already added is listed below; import the file again to add the rest (duplicates are skipped)." });
    } finally {
      await finishSheetImport(start.importId).catch(() => {});
      router.refresh();
    }
  }

  function onRemove(p: PastImport) {
    const what = [p.workouts ? plural(p.workouts, "workout") : null, p.activities ? plural(p.activities, "activity", "activities") : null].filter(Boolean).join(" and ");
    if (!confirm(`Remove the ${what} imported from “${p.fileName}”? This can't be undone.`)) return;
    setRemoveId(p.id);
    startRemove(async () => {
      await removeSheetImport(p.id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-7">
      {/* Step 1 */}
      <section>
        <SectionTitle>1. Fill in the template</SectionTitle>
        <Card className="space-y-3">
          <p className="text-sm text-zinc-400">
            One row per set on the <b className="text-zinc-200">Workouts</b> sheet, one row per run, ride or class on the{" "}
            <b className="text-zinc-200">Cardio</b> sheet. The Exercise column has a dropdown of your exercises, and the{" "}
            <b className="text-zinc-200">Example</b> sheet shows a filled-in sample.
          </p>
          <a
            href="/api/import/template"
            download
            className="press flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 text-sm font-semibold text-zinc-950 hover:bg-white"
          >
            <DownloadIcon className="h-4 w-4" /> Download Excel template (.xlsx)
          </a>
          <p className="text-xs text-zinc-500">
            Works in Excel, Google Sheets and Numbers. Prefer CSV?{" "}
            <a href="/api/import/template?format=csv&sheet=workouts" download className="underline">
              Workouts CSV
            </a>{" "}
            ·{" "}
            <a href="/api/import/template?format=csv&sheet=cardio" download className="underline">
              Cardio CSV
            </a>
          </p>
        </Card>
      </section>

      {/* Step 2 */}
      <section>
        <SectionTitle>2. Import it</SectionTitle>
        <input ref={fileRef} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="hidden" onChange={onFile} />

        {(stage.kind === "idle" || stage.kind === "error" || stage.kind === "done") && (
          <div className="space-y-3">
            {stage.kind === "error" && (
              <p role="alert" className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-100">
                {stage.message}
              </p>
            )}
            {stage.kind === "done" && <DoneCard t={stage.result} />}
            <Button size="lg" variant={stage.kind === "done" ? "secondary" : "primary"} className="w-full" onClick={() => fileRef.current?.click()}>
              <SheetIcon className="h-5 w-5" /> {stage.kind === "done" ? "Import another file" : "Choose a file (.xlsx or .csv)"}
            </Button>
            <p className="text-center text-xs text-zinc-500">You see a preview before anything is saved. Up to 5 MB.</p>
          </div>
        )}

        {stage.kind === "reading" && <Card className="animate-pulse text-sm text-zinc-400">Reading the file…</Card>}

        {stage.kind === "preview" && (
          <Preview
            fileName={stage.fileName}
            parsed={stage.parsed}
            known={known}
            onCancel={() => setStage({ kind: "idle" })}
            onImport={() => runImport(stage.fileName, stage.parsed)}
          />
        )}

        {stage.kind === "importing" && (
          <Card className="space-y-2">
            <div className="text-sm text-zinc-300">Importing… keep this page open.</div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-teal-300 transition-all" style={{ width: `${Math.max(6, (stage.done / Math.max(1, stage.total)) * 100)}%` }} />
            </div>
          </Card>
        )}
      </section>

      {/* History */}
      {past.length > 0 && (
        <section>
          <SectionTitle>Past imports</SectionTitle>
          <ul className="space-y-2">
            {past.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.fileName}</div>
                  <div className="text-xs text-zinc-500">
                    {formatPretty(p.createdAt.slice(0, 10))} ·{" "}
                    {[p.workouts ? `${plural(p.workouts, "workout")} (${plural(p.sets, "set")})` : null, p.activities ? plural(p.activities, "activity", "activities") : null]
                      .filter(Boolean)
                      .join(", ") || "nothing left"}
                  </div>
                </div>
                <button
                  onClick={() => onRemove(p)}
                  disabled={removing}
                  aria-label={`Undo import ${p.fileName}`}
                  className="press flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-zinc-800 px-3 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-60"
                >
                  <TrashIcon className="h-3.5 w-3.5" /> {removing && removeId === p.id ? "Removing…" : "Undo"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Preview({
  fileName,
  parsed,
  known,
  onCancel,
  onImport,
}: {
  fileName: string;
  parsed: ParsedImport;
  known: Set<string>;
  onCancel: () => void;
  onImport: () => void;
}) {
  const [showIssues, setShowIssues] = useState(false);
  const { sessions, cardio, issues, setCount } = parsed;
  const dates = [...sessions.map((s) => s.date), ...cardio.map((c) => c.date)].sort();
  const newEx = [...new Map(sessions.flatMap((s) => s.exercises).filter((e) => !known.has(exerciseKey(e.name))).map((e) => [exerciseKey(e.name), e.name])).values()];
  const nothing = !sessions.length && !cardio.length;

  return (
    <Card className="space-y-4">
      <div>
        <div className="truncate text-sm text-zinc-400">{fileName}</div>
        <div className="mt-1 text-lg font-semibold">
          {nothing
            ? "Nothing to import"
            : [sessions.length ? plural(sessions.length, "workout") : null, cardio.length ? plural(cardio.length, "activity", "activities") : null].filter(Boolean).join(" and ")}
        </div>
        {!nothing && (
          <div className="text-sm text-zinc-400">
            {setCount ? `${plural(setCount, "set")} · ` : ""}
            {dates.length ? (dates[0] === dates[dates.length - 1] ? formatPretty(dates[0]) : `${formatPretty(dates[0])} to ${formatPretty(dates[dates.length - 1])}`) : ""}
          </div>
        )}
      </div>

      {sessions.length > 0 && (
        <ul className="divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
          {sessions.slice(0, 4).map((s) => (
            <li key={`${s.date}|${s.name}`} className="px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate font-medium">{s.name}</span>
                <span className="shrink-0 text-xs text-zinc-500">{formatPretty(s.date)}</span>
              </div>
              <div className="truncate text-xs text-zinc-500">{s.exercises.map((e) => `${e.name} ×${e.sets.length}`).join(" · ")}</div>
            </li>
          ))}
          {sessions.length > 4 && <li className="px-3 py-2 text-xs text-zinc-500">and {plural(sessions.length - 4, "more workout")}</li>}
        </ul>
      )}

      {cardio.length > 0 && (
        <p className="text-sm text-zinc-400">
          Cardio:{" "}
          {Object.entries(cardio.reduce<Record<string, number>>((a, c) => ((a[c.type] = (a[c.type] ?? 0) + 1), a), {}))
            .map(([t, n]) => `${activityLabel(t)} ×${n}`)
            .join(" · ")}
        </p>
      )}

      {newEx.length > 0 && (
        <p className="rounded-xl border border-teal-300/20 bg-teal-300/[0.06] px-3 py-2.5 text-sm text-teal-100">
          {plural(newEx.length, "new exercise")} will be added to your library: {newEx.slice(0, 8).join(", ")}
          {newEx.length > 8 ? ` and ${newEx.length - 8} more` : ""}. Check the spelling if one should match an existing exercise.
        </p>
      )}

      {issues.length > 0 && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-100">
          <button className="flex w-full items-center justify-between text-left" onClick={() => setShowIssues((v) => !v)} aria-expanded={showIssues}>
            <span>
              {plural(issues.length, "row")} will be skipped. {showIssues ? "Hide" : "See why"}
            </span>
          </button>
          {showIssues && (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs text-amber-100/90">
              {issues.slice(0, 200).map((i, k) => (
                <li key={k}>
                  {i.row ? `${i.sheet} row ${i.row}: ` : `${i.sheet}: `}
                  {i.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="text-xs text-zinc-500">Workouts already in your log with the same date and name are skipped.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onImport} disabled={nothing}>
          Import
        </Button>
      </div>
    </Card>
  );
}

function DoneCard({ t }: { t: Totals }) {
  const added = [t.workouts ? `${plural(t.workouts, "workout")} (${plural(t.sets, "set")})` : null, t.activities ? plural(t.activities, "activity", "activities") : null].filter(Boolean);
  const skipped = t.skipped + t.activitiesSkipped;
  return (
    <Card className={cn("space-y-2 border-teal-300/30")}>
      <div className="flex items-center gap-2 font-semibold">
        <CheckIcon className="h-5 w-5 text-teal-300" /> {added.length ? `Added ${added.join(" and ")}` : "Nothing new to add"}
      </div>
      {skipped > 0 && <p className="text-sm text-zinc-400">{plural(skipped, "item")} already in your log, skipped.</p>}
      {t.newExercises.length > 0 && <p className="text-sm text-zinc-400">New exercises: {t.newExercises.slice(0, 10).join(", ")}{t.newExercises.length > 10 ? "…" : ""}</p>}
      {added.length > 0 && (
        <Link href="/history" transitionTypes={["nav-forward"]} className="inline-block text-sm text-teal-300 underline">
          See them in History
        </Link>
      )}
    </Card>
  );
}
