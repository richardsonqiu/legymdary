import { z } from "zod";
import { structuredCall } from "@/lib/ai/structured";

/**
 * Server-only. Reads body-composition scans (InBody result sheets or app
 * screenshots, incl. History charts with several dates) from images.
 * The user always reviews the extracted numbers before saving.
 */

const MODELS = [
  process.env.MEAL_AI_MODEL || "claude-haiku-5-5",
  process.env.MEAL_AI_BACKUP_MODEL ?? "claude-sonnet-5-5",
];

const Seg = z
  .object({
    kg: z.number().nullable(),
    pct: z.number().nullable().describe("Percent of ideal shown next to the segment (e.g. 111.4), or null"),
  })
  .nullable();

const ScanSchema = z.object({
  date: z.string().describe("Scan date as YYYY-MM-DD"),
  time: z.string().nullable().describe("Scan time HH:MM if shown"),
  score: z.number().nullable().describe("InBody Score (points)"),
  weight: z.number().nullable().describe("kg"),
  skeletalMuscle: z.number().nullable().describe("Skeletal Muscle Mass, kg"),
  fatMass: z.number().nullable().describe("Body Fat Mass, kg"),
  bodyFatPct: z.number().nullable().describe("Percent Body Fat, %"),
  bmi: z.number().nullable(),
  visceralFat: z.number().nullable().describe("Visceral Fat Level"),
  waistHip: z.number().nullable().describe("Waist-Hip Ratio"),
  totalBodyWater: z.number().nullable().describe("L"),
  protein: z.number().nullable().describe("kg"),
  mineral: z.number().nullable().describe("kg"),
  bmr: z.number().nullable().describe("Basal Metabolic Rate, kcal"),
  smi: z.number().nullable().describe("SMI kg/m²"),
  segmentalLean: z
    .object({ leftArm: Seg, rightArm: Seg, trunk: Seg, leftLeg: Seg, rightLeg: Seg })
    .nullable()
    .describe("Segmental lean analysis, if shown for this date"),
  segmentalFat: z
    .object({ leftArm: Seg, rightArm: Seg, trunk: Seg, leftLeg: Seg, rightLeg: Seg })
    .nullable()
    .describe("Segmental fat analysis, if shown"),
  bodyType: z.string().nullable().describe("e.g. 'Above Average Obese C-Type'"),
  balance: z
    .object({ upper: z.string().nullable(), lower: z.string().nullable(), upperLower: z.string().nullable() })
    .nullable()
    .describe("Body Balance Evaluation labels, e.g. 'Balanced', 'Slightly Unbalanced'"),
});
export type ExtractedScan = z.infer<typeof ScanSchema>;

const ResultSchema = z.object({
  isBodyScan: z.boolean().describe("false if the images aren't a body-composition result"),
  scans: z.array(ScanSchema),
  notes: z.string().describe("Anything unclear or unreadable, in one sentence; empty if none"),
});

const SYSTEM = `You extract numbers from body-composition scan results (InBody result sheets, the InBody app's Detail/History screens, or similar BIA devices). Images may be consecutive tiles of one long screenshot that overlap slightly — treat them as one document.

Rules:
- Return one entry per scan date. A Detail screen is one scan with full data (incl. segmental lean/fat and balance). A History screen shows several dates per metric chart: return every date with the values shown for it, and null for anything not shown.
- InBody app dates are written YY.MM.DD (e.g. "26.11.12" = 2026-11-12, "25.05.20" = 2025-05-20). Output YYYY-MM-DD.
- Copy numbers exactly as displayed. Never estimate, convert or infer a value that isn't visible; use null instead. Ignore the small change values (e.g. "+2.7", "-0.08") — they are differences, not readings.
- Segmental lean: the kg value per segment and, if shown, the % of ideal (e.g. Left Arm 111.4%).
- If the same date appears in several images, merge into one entry.`;

export async function extractBodyScans(
  userId: string,
  images: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string }[],
): Promise<{ ok: true; scans: ExtractedScan[]; notes: string } | { ok: false; error: string }> {
  const res = await structuredCall({
    userId,
    feature: "body_scan",
    schema: ResultSchema,
    system: SYSTEM,
    user: [
      ...images.map((im) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: im.mediaType, data: im.base64 },
      })),
      { type: "text" as const, text: "Extract every body-composition scan shown in these images." },
    ],
    models: MODELS,
    effort: "low",
  });
  if (!res.ok) return res;
  if (!res.data.isBodyScan) return { ok: false, error: "These images don't look like a body-composition result." };
  const valid = res.data.scans.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date));
  if (!valid.length) return { ok: false, error: "Couldn't read any scan dates. Try a clearer screenshot." };
  // Merge duplicate dates (e.g. Detail + History both include the latest scan).
  const byDate = new Map<string, ExtractedScan>();
  for (const s of valid) {
    const prev = byDate.get(s.date);
    if (!prev) byDate.set(s.date, s);
    else {
      const merged = { ...prev } as Record<string, unknown>;
      for (const [k, v] of Object.entries(s)) if (merged[k] == null && v != null) merged[k] = v;
      byDate.set(s.date, merged as ExtractedScan);
    }
  }
  return { ok: true, scans: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), notes: res.data.notes };
}
