import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { bodyStats } from "@/db/schema";
import { numOrNull, safeDate } from "./util";

export async function logBodyStat(userId: string, input: {
  date: string;
  weight?: number | string | null;
  waist?: number | string | null;
  bodyFat?: number | string | null;
}): Promise<{ error?: string }> {  const date = safeDate(input.date);
  const bad = (v: number | null, lo: number, hi: number) => v != null && (v < lo || v > hi);
  const weight = numOrNull(input.weight);
  const waist = numOrNull(input.waist);
  const bodyFat = numOrNull(input.bodyFat);
  if (bad(weight, 20, 400)) return { error: "Weight should be between 20 and 400 kg." };
  if (bad(waist, 30, 250)) return { error: "Waist should be between 30 and 250 cm." };
  if (bad(bodyFat, 2, 75)) return { error: "Body fat should be between 2 and 75%." };
  const vals = {
    userId,
    date,
    weight,
    waist,
    bodyFat,
  };
  await db
    .insert(bodyStats)
    .values(vals)
    .onConflictDoUpdate({
      target: [bodyStats.userId, bodyStats.date],
      set: {
        weight: vals.weight,
        waist: vals.waist,
        bodyFat: vals.bodyFat,
        source: "manual", // a manual edit takes ownership from a Garmin import
      },
    });  return {};
}

export async function deleteBodyStat(userId: string, id: number): Promise<void> {  await db
    .delete(bodyStats)
    .where(and(eq(bodyStats.id, id), eq(bodyStats.userId, userId)));}
