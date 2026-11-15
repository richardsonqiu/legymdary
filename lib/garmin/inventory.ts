import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { garminRaw } from "@/db/schema";
import { DATASETS } from "@/lib/garmin/datasets";

/**
 * Field-level profile of everything imported from Garmin: for each dataset,
 * every JSON path with how often it's present, its type and a value summary.
 * Identifying fields (names, ids, locations) are redacted so the inventory
 * can be shared for analysis design without exposing personal details.
 */

const REDACT = /(display_?name|full_?name|user_?name|email|userProfile|profile_?pk|owner|author|uuid|^id$|deviceId|serial|latitude|longitude|location|address|phone|comment|description|notes?$|activityName|workoutName|name$)/i;

type FieldStats = {
  path: string;
  count: number;
  types: Set<string>;
  min?: number;
  max?: number;
  sum: number;
  nums: number;
  samples: Set<string>;
  arrayLen?: { min: number; max: number };
};

export type InventoryField = {
  path: string;
  presentPct: number;
  type: string;
  summary: string;
};
export type InventoryDataset = {
  id: string;
  label: string;
  rows: number;
  from: string | null;
  to: string | null;
  sampledRows: number;
  fields: InventoryField[];
};

function walk(v: unknown, path: string, seen: Set<string>, stats: Map<string, FieldStats>, depth = 0) {
  if (depth > 7) return;
  const key = path || "(root)";
  const leaf = (type: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const s = stats.get(key) ?? { path: key, count: 0, types: new Set(), sum: 0, nums: 0, samples: new Set() };
    s.count++;
    s.types.add(type);
    if (typeof v === "number" && Number.isFinite(v)) {
      s.min = s.min == null ? v : Math.min(s.min, v);
      s.max = s.max == null ? v : Math.max(s.max, v);
      s.sum += v;
      s.nums++;
    } else if (typeof v === "string" || typeof v === "boolean") {
      const leafName = key.split(".").pop() ?? "";
      const val = REDACT.test(leafName) ? "‹redacted›" : String(v).slice(0, 40);
      if (s.samples.size < 4) s.samples.add(val);
    }
    if (Array.isArray(v)) {
      s.arrayLen = {
        min: Math.min(s.arrayLen?.min ?? v.length, v.length),
        max: Math.max(s.arrayLen?.max ?? v.length, v.length),
      };
    }
    stats.set(key, s);
  };
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) {
    leaf("array");
    // Profile up to 50 elements; tuples of numbers (time series) are summarised as one.
    for (const el of v.slice(0, 50)) walk(el, `${path}[]`, seen, stats, depth + 1);
    return;
  }
  if (typeof v === "object") {
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      walk(child, path ? `${path}.${k}` : k, seen, stats, depth + 1);
    }
    return;
  }
  leaf(typeof v);
}

const fmt = (n: number) =>
  Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("en-US") : String(Math.round(n * 100) / 100);

export async function buildInventory(userId: string, maxRowsPerDataset = 120): Promise<InventoryDataset[]> {
  const out: InventoryDataset[] = [];
  for (const ds of DATASETS) {
    const rows = await db
      .select({ date: garminRaw.date, payload: garminRaw.payload })
      .from(garminRaw)
      .where(and(eq(garminRaw.userId, userId), eq(garminRaw.dataset, ds.id)))
      .orderBy(asc(garminRaw.date));
    const dates = rows.map((r) => r.date).filter((d): d is string => !!d);
    // Sample evenly across the whole history.
    const step = Math.max(1, Math.floor(rows.length / maxRowsPerDataset));
    const sample = rows.filter((_, i) => i % step === 0).slice(0, maxRowsPerDataset);
    const stats = new Map<string, FieldStats>();
    let sampled = 0;
    for (const r of sample) {
      let payload: unknown;
      try {
        payload = JSON.parse(r.payload);
      } catch {
        continue;
      }
      if (payload == null) continue;
      sampled++;
      walk(payload, "", new Set(), stats);
    }
    const fields = [...stats.values()]
      .filter((s) => s.path !== "(root)")
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((s) => {
        const type = [...s.types].join("|");
        let summary = "";
        if (s.nums) summary = `min ${fmt(s.min!)} · avg ${fmt(s.sum / s.nums)} · max ${fmt(s.max!)}`;
        else if (s.arrayLen) summary = `length ${s.arrayLen.min}–${s.arrayLen.max}`;
        else if (s.samples.size) summary = `e.g. ${[...s.samples].join(", ")}`;
        return {
          path: s.path,
          presentPct: sampled ? Math.round((s.count / sampled) * 100) : 0,
          type,
          summary,
        };
      });
    out.push({
      id: ds.id,
      label: ds.label,
      rows: rows.length,
      from: dates[0] ?? null,
      to: dates[dates.length - 1] ?? null,
      sampledRows: sampled,
      fields,
    });
  }
  return out;
}

export function inventoryToMarkdown(inv: InventoryDataset[], meta: { generatedAt: string; historyDays: number }): string {
  const lines: string[] = [
    "# Garmin data inventory",
    "",
    `Generated ${meta.generatedAt} · detail history ${meta.historyDays} days · identifying values redacted.`,
    "",
    "| Dataset | Rows | From | To | Fields |",
    "|---|---:|---|---|---:|",
    ...inv.map((d) => `| ${d.label} (\`${d.id}\`) | ${d.rows} | ${d.from ?? "-"} | ${d.to ?? "-"} | ${d.fields.length} |`),
    "",
  ];
  for (const d of inv) {
    lines.push(`## ${d.label} (\`${d.id}\`)`, "");
    if (!d.rows) {
      lines.push("_No data on this account._", "");
      continue;
    }
    lines.push(`${d.rows} rows (${d.from ?? "?"} → ${d.to ?? "?"}), profiled from ${d.sampledRows} sampled rows.`, "");
    lines.push("| Field | Present | Type | Values |", "|---|---:|---|---|");
    for (const f of d.fields) {
      lines.push(`| \`${f.path}\` | ${f.presentPct}% | ${f.type} | ${f.summary.replace(/\|/g, "/")} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
