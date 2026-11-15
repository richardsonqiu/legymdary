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

/*
 * Structured outputs allow at most 16 union-typed (nullable) parameters per
 * request, so this schema has none: readings are a list of {metric, value}
 * pairs (only metrics actually shown are listed), segments are a list, and
 * missing text is "". `toScan` converts back to the nullable shape the app uses.
 */
const METRICS = {
  score: "InBody Score (points)",
  weight: "Weight, kg",
  skeletalMuscle: "Skeletal Muscle Mass, kg",
  fatMass: "Body Fat Mass, kg",
  bodyFatPct: "Percent Body Fat, %",
  bmi: "BMI",
  visceralFat: "Visceral Fat Level",
  waistHip: "Waist-Hip Ratio",
  totalBodyWater: "Total Body Water, L",
  protein: "Protein, kg",
  mineral: "Mineral, kg",
  bmr: "Basal Metabolic Rate, kcal",
  smi: "SMI, kg/m²",
} as const;
type MetricKey = keyof typeof METRICS;
const METRIC_KEYS = Object.keys(METRICS) as [MetricKey, ...MetricKey[]];
const SEGMENTS = ["leftArm", "rightArm", "trunk", "leftLeg", "rightLeg"] as const;

const RawScanSchema = z.object({
  date: z.string().describe("Scan date as YYYY-MM-DD"),
  time: z.string().describe('Scan time HH:MM if shown, else ""'),
  readings: z
    .array(
      z.object({
        metric: z.enum(METRIC_KEYS).describe(
          "Which reading: " + Object.entries(METRICS).map(([k, v]) => `${k} = ${v}`).join("; "),
        ),
        value: z.number(),
      }),
    )
    .describe("Only the readings actually shown for this date"),
  segments: z
    .array(
      z.object({
        analysis: z.enum(["lean", "fat"]).describe("Segmental lean or segmental fat analysis"),
        segment: z.enum(SEGMENTS),
        kg: z.number(),
        pctOfIdeal: z.number().describe("Percent of ideal shown next to the segment (e.g. 111.4), or 0 if not shown"),
      }),
    )
    .describe("Segmental analysis rows, if shown for this date; empty otherwise"),
  bodyType: z.string().describe('e.g. "Above Average Obese C-Type", or ""'),
  balanceUpper: z.string().describe('Body Balance Evaluation, upper body (e.g. "Balanced"), or ""'),
  balanceLower: z.string().describe('Body Balance Evaluation, lower body, or ""'),
  balanceUpperLower: z.string().describe('Body Balance Evaluation, upper-lower, or ""'),
});
type RawScan = z.infer<typeof RawScanSchema>;

type Seg = { kg: number | null; pct: number | null } | null;
type Segs = Record<(typeof SEGMENTS)[number], Seg>;
export type ExtractedScan = {
  date: string;
  time: string | null;
  bodyType: string | null;
  segmentalLean: Segs | null;
  segmentalFat: Segs | null;
  balance: { upper: string | null; lower: string | null; upperLower: string | null } | null;
} & Record<MetricKey, number | null>;

const ResultSchema = z.object({
  isBodyScan: z.boolean().describe("false if the images aren't a body-composition result"),
  scans: z.array(RawScanSchema),
  notes: z.string().describe("Anything unclear or unreadable, in one sentence; empty if none"),
});

const text = (s: string) => (s.trim() ? s.trim() : null);

function toScan(r: RawScan): ExtractedScan {
  const values = Object.fromEntries(METRIC_KEYS.map((k) => [k, null])) as Record<MetricKey, number | null>;
  for (const { metric, value } of r.readings) if (Number.isFinite(value)) values[metric] = value;
  const segs = (kind: "lean" | "fat"): Segs | null => {
    const rows = r.segments.filter((s) => s.analysis === kind);
    if (!rows.length) return null;
    const out = Object.fromEntries(SEGMENTS.map((k) => [k, null])) as Segs;
    for (const s of rows) out[s.segment] = { kg: s.kg, pct: s.pctOfIdeal > 0 ? s.pctOfIdeal : null };
    return out;
  };
  const balance = { upper: text(r.balanceUpper), lower: text(r.balanceLower), upperLower: text(r.balanceUpperLower) };
  return {
    date: r.date,
    time: text(r.time),
    bodyType: text(r.bodyType),
    ...values,
    segmentalLean: segs("lean"),
    segmentalFat: segs("fat"),
    balance: balance.upper || balance.lower || balance.upperLower ? balance : null,
  };
}

/** JSON schema sent to the API — exported so a check can verify it stays under the structured-output limits. */
export const bodyScanResultSchema = ResultSchema;

const SYSTEM = `You extract numbers from body-composition scan results (InBody result sheets, the InBody app's Detail/History screens, or similar BIA devices). Images may be consecutive tiles of one long screenshot that overlap slightly. Treat them as one document.

Rules:
- Return one entry per scan date. List only readings that are visible for that date (no guesses, no placeholders). A Detail screen is one scan with full data (incl. segmental lean/fat and balance). A History screen shows several dates per metric chart: return every date with the values shown for it, and null for anything not shown.
- InBody app dates are written YY.MM.DD (e.g. "26.11.12" = 2026-11-12, "25.05.20" = 2025-05-20). Output YYYY-MM-DD.
- Copy numbers exactly as displayed. Never estimate, convert or infer a value that isn't visible; use null instead. Ignore the small change values (e.g. "+2.7", "-0.08"). They are differences, not readings.
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
  const valid = res.data.scans.filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date)).map(toScan);
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
