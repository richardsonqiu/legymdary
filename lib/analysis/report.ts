import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dailyReports } from "@/db/schema";
import { structuredCall } from "@/lib/ai/structured";
import { buildAnalysis, type DayCard } from "@/lib/analysis/service";

/**
 * Server-only. Turns a computed day card into a short coaching report.
 * The model never does arithmetic — every number comes from the card.
 */

const MODELS = [
  process.env.INSIGHTS_AI_MODEL || "claude-haiku-5-5",
  process.env.INSIGHTS_AI_BACKUP_MODEL ?? "claude-sonnet-5-5",
];

export const ReportSchema = z.object({
  headline: z.string().describe("One sentence summing up today, mentioning the readiness band if available."),
  standouts: z
    .array(z.string())
    .describe("2-4 short bullets on what stood out, each citing numbers vs the user's usual from the card."),
  training: z.string().describe("Today's training guidance (intensity + suggested session type), 1-2 sentences."),
  nutrition: z.string().describe("Today's nutrition guidance using the plan targets, 1-2 sentences."),
  recovery: z.string().describe("Sleep/recovery guidance for tonight, 1-2 sentences."),
  watchouts: z.array(z.string()).describe("0-3 items, only from the card's flags or clear red signals; empty if none."),
  pattern: z.string().nullable().describe("The most useful personal pattern from the card, phrased as an association, or null."),
});
export type Report = z.infer<typeof ReportSchema>;

const SYSTEM = `You are the coach inside LeGYMdary, a personal gym and nutrition diary. Each morning you receive a "day card": numbers already computed from the user's Garmin watch (sleep, HRV, resting HR, Body Battery, activities), their food log, strength workouts and their goal plan. Write today's brief.

How to write:
- Use ONLY numbers and facts present in the card. Never compute, estimate or invent values. If something is null or missing, don't mention it.
- Compare to the user's own usual values (the card gives "usual" / baselines) rather than population norms.
- Be specific and practical, friendly and concise. Plain language, no jargon without a short explanation. Total under ~180 words.
- Readiness bands: "push" → a hard session or PR attempt is reasonable; "normal" → train as planned; "easy" → keep intensity moderate, technique/mobility, prioritise sleep and food.
- If load.ratio > 1.5, advise a lighter day regardless of readiness; if < 0.8 for a while, note training could ramp up gradually.
- Nutrition: anchor to plan targets (calories, protein). If yesterday wasn't fully logged, say insights are limited rather than judging intake.
- Recovery: if sleepDebtHours ≥ 2, suggest an earlier bedtime; mention bedtime consistency if sleepConsistency.bedSd > 60.
- bodyComposition is the latest InBody-style scan (daysAgo tells how fresh). Use it to steer advice: if sincePrevious shows muscle loss with fat gain, prioritise protein and progressive strength training over extra cardio; if segmental.advice mentions legs, suggest lower-body emphasis; never restate scan numbers as if measured today.
- Patterns are correlations from the user's own history: say "is associated with", never claim causation.
- Health: no diagnoses. Only for repeated low SpO2 or a strong illness signal in flags, suggest considering a doctor.`;

export async function getStoredReport(userId: string, date: string) {
  const [row] = await db
    .select()
    .from(dailyReports)
    .where(and(eq(dailyReports.userId, userId), eq(dailyReports.date, date)))
    .limit(1);
  if (!row) return null;
  return { report: JSON.parse(row.report) as Report, model: row.model, createdAt: row.createdAt };
}

/** Generates (or regenerates) and stores the report for a day. */
export async function generateDailyReport(
  userId: string,
  date: string,
): Promise<{ ok: true; report: Report; model: string } | { ok: false; error: string }> {
  const { card } = await buildAnalysis(userId, date);
  if (!card.readiness && card.lastNight.sleepHours == null && card.yesterday.meals === 0 && card.yesterday.load === 0) {
    return { ok: false, error: "Not enough data for this day yet — sync Garmin or log a meal first." };
  }
  const res = await structuredCall({
    userId,
    feature: "daily_report",
    schema: ReportSchema,
    system: SYSTEM,
    user: `Today's day card (JSON):\n${JSON.stringify(card)}`,
    models: MODELS,
    effort: "low",
  });
  if (!res.ok) return res;
  const vals = { card: JSON.stringify(card), report: JSON.stringify(res.data), model: res.model, createdAt: new Date() };
  await db
    .insert(dailyReports)
    .values({ userId, date, ...vals })
    .onConflictDoUpdate({ target: [dailyReports.userId, dailyReports.date], set: vals });
  return { ok: true, report: res.data, model: res.model };
}

export const AnswerSchema = z.object({
  answer: z.string().describe("A direct, concise answer (under ~150 words) grounded in the card."),
});

const QA_SYSTEM = `${SYSTEM}

Now answer the user's question about this day using only the card. If the card doesn't contain what's needed, say what data is missing and how to get it (e.g. sync Garmin, log meals).`;

export async function askAboutDay(
  userId: string,
  date: string,
  question: string,
  card?: DayCard,
): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  const c = card ?? (await buildAnalysis(userId, date)).card;
  const res = await structuredCall({
    userId,
    feature: "daily_qa",
    schema: AnswerSchema,
    system: QA_SYSTEM,
    user: `Day card (JSON):\n${JSON.stringify(c)}\n\nQuestion: ${question}`,
    models: MODELS,
    effort: "low",
  });
  return res.ok ? { ok: true, answer: res.data.answer } : res;
}
