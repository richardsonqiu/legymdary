import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bodyStats } from "@/db/schema";
import { addDaysStr } from "@/lib/utils";

/**
 * Latest weight and body fat for a user as of `asOf` (session-free).
 *
 * Weight: the newest reading from any source.
 * Body fat: a manual entry or InBody/BIA scan from the last 60 days is
 * preferred over smart-scale estimates (e.g. Garmin Index), which are far less
 * accurate; otherwise the newest value from any source.
 */
export async function latestBodyValues(userId: string, asOf: string) {
  const preferredSince = addDaysStr(asOf, -60);
  const [[w], [bf]] = await Promise.all([
    db
      .select({ v: bodyStats.weight, date: bodyStats.date })
      .from(bodyStats)
      .where(and(eq(bodyStats.userId, userId), isNotNull(bodyStats.weight), lte(bodyStats.date, asOf)))
      .orderBy(desc(bodyStats.date))
      .limit(1),
    db
      .select({ v: bodyStats.bodyFat, date: bodyStats.date, source: bodyStats.source })
      .from(bodyStats)
      .where(and(eq(bodyStats.userId, userId), isNotNull(bodyStats.bodyFat), lte(bodyStats.date, asOf)))
      .orderBy(
        desc(sql`(${bodyStats.source} in ('manual', 'inbody') and ${bodyStats.date} >= ${preferredSince})`),
        desc(bodyStats.date),
      )
      .limit(1),
  ]);
  return {
    weight: w?.v ?? null,
    weightDate: w?.date ?? null,
    bodyFat: bf?.v ?? null,
    bodyFatDate: bf?.date ?? null,
    bodyFatSource: bf?.source ?? null,
  };
}

/**
 * Same rules as latestBodyValues, in memory, for many dates at once (rows
 * sorted by date ascending). Used to rebuild past daily targets.
 */
export function bodyValuesAsOf(
  rows: { date: string; weight: number | null; bodyFat: number | null; source: string | null }[],
  asOf: string,
) {
  const preferredSince = addDaysStr(asOf, -60);
  let weight: number | null = null;
  let bodyFat: number | null = null;
  let preferred: number | null = null;
  for (const r of rows) {
    if (r.date > asOf) break;
    if (r.weight != null) weight = r.weight;
    if (r.bodyFat != null) {
      bodyFat = r.bodyFat;
      if ((r.source === "manual" || r.source === "inbody") && r.date >= preferredSince) preferred = r.bodyFat;
    }
  }
  return { weight, bodyFat: preferred ?? bodyFat };
}
