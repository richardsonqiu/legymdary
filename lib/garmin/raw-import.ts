import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { garminConnections, garminDatasets, garminRaw } from "@/db/schema";
import { GarminError } from "@/lib/garmin/client";
import {
  DATASETS,
  type ActivityDataset,
  type DailyDataset,
  type Dataset,
  type RangeDataset,
  type RawItem,
  type SnapshotDataset,
} from "@/lib/garmin/datasets";
import { bearerToken } from "@/lib/garmin/sync";
import { addDaysStr, todayStr } from "@/lib/utils";

/**
 * Server-only, resumable "import everything" engine. Each call does as much
 * work as fits in `budgetMs`, saving progress per dataset, so it can be
 * driven by repeated calls from the UI and by the daily cron.
 *
 * Order of work: snapshots → refresh recent days → back-fill history
 * (newest first) → per-activity details.
 */

const SUMMARY_DAYS = 365; // range datasets back-fill a year
const RECENT_DAYS = 3; // re-fetch the last few days (data keeps changing)
const STALE_MS = 3 * 60 * 60 * 1000;
const SNAPSHOT_STALE_MS = 24 * 60 * 60 * 1000;
const UNAVAILABLE_AFTER = 21; // consecutive empty/4xx results → "not on this account"
const CONCURRENCY = 4;

type Progress = typeof garminDatasets.$inferSelect;

export type ImportStatus = {
  done: boolean;
  /** When Garmin rate-limited us; the import resumes automatically after this. */
  pausedUntil: string | null;
  stoppedReason?: string;
  calls: number;
  rowsWritten: number;
  datasets: {
    id: string;
    label: string;
    group: string;
    kind: Dataset["kind"];
    status: string;
    lastError: string | null;
    backfilledTo: string | null;
    targetFrom: string | null;
    latestDate: string | null;
    rows: number;
    /** Actual date range that has data. */
    firstDataDate: string | null;
    lastDataDate: string | null;
    percent: number;
  }[];
};

class StopImport extends Error {}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function saveRows(userId: string, dataset: string, items: RawItem[]): Promise<number> {
  const now = new Date();
  for (let i = 0; i < items.length; i += 40) {
    const chunk = items.slice(i, i + 40);
    await db
      .insert(garminRaw)
      .values(
        chunk.map((it) => ({
          userId,
          dataset,
          key: it.key,
          date: it.date,
          payload: JSON.stringify(it.payload),
          fetchedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [garminRaw.userId, garminRaw.dataset, garminRaw.key],
        set: { payload: sql`excluded.payload`, date: sql`excluded.date`, fetchedAt: now },
      });
  }
  return items.length;
}

export async function runGarminImport(
  userId: string,
  opts: { budgetMs?: number } = {},
): Promise<ImportStatus> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 40_000;
  const timeLeft = () => budget - (Date.now() - started);

  const [conn] = await db
    .select()
    .from(garminConnections)
    .where(eq(garminConnections.userId, userId))
    .limit(1);
  if (!conn) throw new Error("Garmin isn't connected.");
  if (conn.importPausedUntil && conn.importPausedUntil.getTime() > Date.now()) {
    const status = await getImportStatus(userId);
    return { ...status, stoppedReason: "Paused by Garmin's rate limit", calls: 0, rowsWritten: 0 };
  }

  const today = addDaysStr(todayStr(), 1); // pad for users ahead of the server's timezone
  const summaryFrom = addDaysStr(today, -SUMMARY_DAYS);
  const detailFrom = addDaysStr(today, -Math.max(7, Math.min(conn.historyDays, 730)));

  // Load or create progress rows.
  const existing = await db.select().from(garminDatasets).where(eq(garminDatasets.userId, userId));
  const progress = new Map<string, Progress>(existing.map((p) => [p.dataset, p]));
  for (const d of DATASETS) {
    if (!progress.has(d.id)) {
      const [row] = await db
        .insert(garminDatasets)
        .values({ userId, dataset: d.id })
        .onConflictDoNothing()
        .returning();
      if (row) progress.set(d.id, row);
    }
  }
  const update = async (id: string, patch: Partial<Progress>) => {
    const p = { ...progress.get(id)!, ...patch, updatedAt: new Date() };
    progress.set(id, p);
    await db
      .update(garminDatasets)
      .set({ ...patch, updatedAt: p.updatedAt })
      .where(and(eq(garminDatasets.userId, userId), eq(garminDatasets.dataset, id)));
  };

  let token = await bearerToken(conn);
  let retriedAuth = false;
  let calls = 0;
  let rowsWritten = 0;
  let stoppedReason: string | undefined;

  /** One API call with auth-retry, rate-limit stop, and empty/4xx tracking. */
  const call = async (ds: Dataset, run: (tok: string) => Promise<RawItem[]>): Promise<RawItem[] | null> => {
    if (timeLeft() < 2_000) throw new StopImport("time budget used");
    calls++;
    try {
      const items = await run(token);
      if (items.length) {
        rowsWritten += await saveRows(userId, ds.id, items);
        if (progress.get(ds.id)!.emptyStreak) await update(ds.id, { emptyStreak: 0, status: "ok", lastError: null });
      } else {
        const streak = progress.get(ds.id)!.emptyStreak + 1;
        await update(ds.id, { emptyStreak: streak });
      }
      return items;
    } catch (err) {
      if (err instanceof GarminError && err.isAuth && !retriedAuth) {
        retriedAuth = true;
        token = await bearerToken(conn, true);
        return call(ds, run);
      }
      if (err instanceof GarminError && err.isAuth) {
        throw new StopImport("Garmin rejected the API key — reconnect on the Garmin page.");
      }
      if (err instanceof GarminError && err.status === 429) {
        // Respect Retry-After (default 30 min, capped 6 h); resume automatically after.
        const waitSec = Math.min(6 * 3600, Math.max(60, err.retryAfterSec ?? 30 * 60));
        const until = new Date(Date.now() + waitSec * 1000);
        await db.update(garminConnections).set({ importPausedUntil: until }).where(eq(garminConnections.userId, userId));
        throw new StopImport("Garmin rate limit reached — the import resumes automatically.");
      }
      const status = err instanceof GarminError ? err.status : 0;
      const streak = progress.get(ds.id)!.emptyStreak + 1;
      // 4xx (e.g. 400/404 for data this account/device doesn't have) counts toward "unavailable".
      await update(ds.id, {
        emptyStreak: status >= 400 && status < 500 ? streak : progress.get(ds.id)!.emptyStreak,
        lastError: (err as Error).message.slice(0, 300),
      });
      return null;
    }
  };

  const markUnavailableIfEmpty = async (ds: Dataset) => {
    const p = progress.get(ds.id)!;
    if (p.emptyStreak >= UNAVAILABLE_AFTER && p.status !== "unavailable") {
      const rows = await countRows(userId, ds.id);
      if (rows === 0) await update(ds.id, { status: "unavailable" });
    }
  };

  const fresh = (p: Progress) =>
    p.latestDate != null && p.latestDate >= addDaysStr(today, -1) && Date.now() - p.updatedAt.getTime() < STALE_MS;

  try {
    /* 1. Snapshots */
    for (const ds of DATASETS.filter((d): d is SnapshotDataset => d.kind === "snapshot")) {
      const p = progress.get(ds.id)!;
      if (p.status === "unavailable") continue;
      if (p.latestDate && Date.now() - p.updatedAt.getTime() < SNAPSHOT_STALE_MS) continue;
      const items = await call(ds, (t) => ds.fetch(t, todayStr()));
      // Snapshots are single calls: an empty/4xx answer with nothing stored means
      // this account doesn't have the data (e.g. no cycle tracking).
      if ((!items || items.length === 0) && (await countRows(userId, ds.id)) === 0) {
        await update(ds.id, { status: "unavailable", latestDate: todayStr() });
      } else {
        await update(ds.id, { latestDate: todayStr(), status: "ok", lastError: null });
      }
    }

    /* 2+3. Range datasets: refresh recent, then back-fill older chunks */
    const ranges = DATASETS.filter((d): d is RangeDataset => d.kind === "range");
    for (const ds of ranges) {
      const p = progress.get(ds.id)!;
      if (p.status === "unavailable" || fresh(p)) continue;
      const start = p.backfilledTo ? addDaysStr(today, -(RECENT_DAYS + 4)) : addDaysStr(today, -(ds.chunkDays - 1));
      await call(ds, (t) => ds.fetch(t, start, today));
      await update(ds.id, { latestDate: today, backfilledTo: p.backfilledTo ?? start });
    }
    let progressed = true;
    while (progressed && timeLeft() > 2_000) {
      progressed = false;
      for (const ds of ranges) {
        const p = progress.get(ds.id)!;
        const target = ds.depth === "summary" ? summaryFrom : detailFrom;
        if (p.status === "unavailable" || !p.backfilledTo || p.backfilledTo <= target) continue;
        const end = addDaysStr(p.backfilledTo, -1);
        const s = addDaysStr(end, -(ds.chunkDays - 1));
        const start = s < target ? target : s;
        await call(ds, (t) => ds.fetch(t, start, end));
        await update(ds.id, { backfilledTo: start });
        progressed = true;
      }
    }

    /* 2+3. Per-day detail datasets: newest days first */
    const dailies = DATASETS.filter((d): d is DailyDataset => d.kind === "daily");
    for (const ds of dailies) {
      const p = progress.get(ds.id)!;
      if (p.status === "unavailable") continue;
      if (!fresh(p)) {
        const days = Array.from({ length: RECENT_DAYS }, (_, i) => addDaysStr(today, -i));
        await pool(days, CONCURRENCY, async (d) => void (await call(ds, (t) => ds.fetch(t, d))));
        await update(ds.id, { latestDate: today, backfilledTo: p.backfilledTo ?? days[days.length - 1] });
      }
    }
    progressed = true;
    while (progressed && timeLeft() > 3_000) {
      progressed = false;
      for (const ds of dailies) {
        const p = progress.get(ds.id)!;
        if (p.status === "unavailable" || !p.backfilledTo || p.backfilledTo <= detailFrom) continue;
        // Next batch of up to 8 older days.
        const days: string[] = [];
        let d = addDaysStr(p.backfilledTo, -1);
        while (days.length < 8 && d >= detailFrom) {
          days.push(d);
          d = addDaysStr(d, -1);
        }
        await pool(days, CONCURRENCY, async (day) => void (await call(ds, (t) => ds.fetch(t, day))));
        await update(ds.id, { backfilledTo: days[days.length - 1] });
        await markUnavailableIfEmpty(ds);
        progressed = true;
        if (timeLeft() < 3_000) break;
      }
    }

    /* 4. Per-activity detail for activities within the detail window */
    const activityIds = await db
      .select({ key: garminRaw.key, date: garminRaw.date })
      .from(garminRaw)
      .where(and(eq(garminRaw.userId, userId), eq(garminRaw.dataset, "activities"), gte(garminRaw.date, detailFrom)));
    for (const ds of DATASETS.filter((d): d is ActivityDataset => d.kind === "activity")) {
      if (progress.get(ds.id)!.status === "unavailable" || !activityIds.length) continue;
      const have = new Set(
        (
          await db
            .select({ key: garminRaw.key })
            .from(garminRaw)
            .where(
              and(
                eq(garminRaw.userId, userId),
                eq(garminRaw.dataset, ds.id),
                inArray(garminRaw.key, activityIds.map((a) => a.key)),
              ),
            )
        ).map((r) => r.key),
      );
      const todo = activityIds.filter((a) => !have.has(a.key));
      // Activities with no workout structure return empty; remember them so we don't re-ask.
      await pool(todo, CONCURRENCY, async (a) => {
        const items = await call(ds, (t) => ds.fetch(t, a.key, a.date));
        if (items && items.length === 0) await saveRows(userId, ds.id, [{ key: a.key, date: a.date, payload: null }]);
      });
      await update(ds.id, { latestDate: today, backfilledTo: detailFrom, emptyStreak: 0 });
    }
  } catch (err) {
    if (err instanceof StopImport) stoppedReason = err.message;
    else throw err;
  }

  if (stoppedReason && !stoppedReason.startsWith("time budget")) {
    await db
      .update(garminConnections)
      .set({ lastError: stoppedReason })
      .where(eq(garminConnections.userId, userId));
  }
  const status = await getImportStatus(userId);
  return { ...status, stoppedReason, calls, rowsWritten };
}

async function countRows(userId: string, dataset: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(garminRaw)
    .where(and(eq(garminRaw.userId, userId), eq(garminRaw.dataset, dataset)));
  return Number(r?.n ?? 0);
}

/** Progress per dataset, for the Data page. */
export async function getImportStatus(userId: string): Promise<Omit<ImportStatus, "calls" | "rowsWritten">> {
  const [conn] = await db
    .select({ historyDays: garminConnections.historyDays, pausedUntil: garminConnections.importPausedUntil })
    .from(garminConnections)
    .where(eq(garminConnections.userId, userId))
    .limit(1);
  const today = addDaysStr(todayStr(), 1);
  const summaryFrom = addDaysStr(today, -SUMMARY_DAYS);
  const detailFrom = addDaysStr(today, -Math.max(7, Math.min(conn?.historyDays ?? 90, 730)));
  const [rows, counts] = await Promise.all([
    db.select().from(garminDatasets).where(eq(garminDatasets.userId, userId)),
    db
      .select({
        dataset: garminRaw.dataset,
        n: sql<number>`count(*)`,
        first: sql<string | null>`min(${garminRaw.date})`,
        last: sql<string | null>`max(${garminRaw.date})`,
      })
      .from(garminRaw)
      .where(and(eq(garminRaw.userId, userId), sql`${garminRaw.payload} != 'null'`))
      .groupBy(garminRaw.dataset),
  ]);
  const byId = new Map(rows.map((r) => [r.dataset, r]));
  const countById = new Map(counts.map((c) => [c.dataset, c]));

  const datasets = DATASETS.map((d) => {
    const p = byId.get(d.id);
    const target =
      d.kind === "snapshot" ? null : d.kind === "range" && d.depth === "summary" ? summaryFrom : detailFrom;
    let percent = 0;
    if (p?.status === "unavailable") percent = 100;
    else if (d.kind === "snapshot") percent = p?.latestDate ? 100 : 0;
    else if (p?.backfilledTo && target) {
      const total = Math.max(1, (Date.parse(today) - Date.parse(target)) / 86_400_000);
      const doneDays = (Date.parse(today) - Date.parse(p.backfilledTo)) / 86_400_000;
      percent = Math.max(0, Math.min(100, Math.round((doneDays / total) * 100)));
      if (p.backfilledTo <= target) percent = 100;
    }
    return {
      id: d.id,
      label: d.label,
      group: d.group,
      kind: d.kind,
      status: p?.status ?? "pending",
      lastError: p?.lastError ?? null,
      backfilledTo: p?.backfilledTo ?? null,
      targetFrom: target,
      latestDate: p?.latestDate ?? null,
      rows: Number(countById.get(d.id)?.n ?? 0),
      firstDataDate: countById.get(d.id)?.first ?? null,
      lastDataDate: countById.get(d.id)?.last ?? null,
      percent,
    };
  });
  const paused = conn?.pausedUntil && conn.pausedUntil.getTime() > Date.now() ? conn.pausedUntil.toISOString() : null;
  return { done: datasets.every((d) => d.percent >= 100), pausedUntil: paused, datasets };
}
