import Anthropic from "@anthropic-ai/sdk";
import { plainText } from "@/lib/utils";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { MealItem } from "@/lib/nutrition";

/**
 * Server-only: estimates the contents and nutrition of a meal photo with
 * Claude's vision. Never import this from a client component.
 *
 * Cost control:
 * - Primary model is Claude Haiku 5.5 (cheap, fast); if it refuses, returns
 *   an unusable answer, or errors, the request is retried once on the backup
 *   model (Claude Sonnet 5.5). Both are overridable via env vars.
 * - Low effort by default (less thinking = fewer billed output tokens).
 * - The client sends a ≤1024px JPEG, which keeps image input ~1,000 tokens.
 * - Every call reports its token usage + estimated cost so spend is visible.
 */

const PRIMARY_MODEL = process.env.MEAL_AI_MODEL || "claude-haiku-5-5";
const BACKUP_MODEL = process.env.MEAL_AI_BACKUP_MODEL ?? "claude-sonnet-5-5";
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORTS)[number];
const EFFORT: Effort = (EFFORTS as readonly string[]).includes(
  process.env.MEAL_AI_EFFORT ?? "",
)
  ? (process.env.MEAL_AI_EFFORT as Effort)
  : "low";

/** USD per million tokens [input, output] — used only for spend estimates. */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
};

/** Models that accept the API's server-side refusal fallback. */
const SERVER_FALLBACK_MODELS = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-2",
  "claude-fable-5-1",
]);

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const [i, o] = PRICES[model] ?? PRICES[PRIMARY_MODEL] ?? [0, 0];
  return (inputTokens * i + outputTokens * o) / 1_000_000;
}

export const MealEstimate = z.object({
  is_food: z.boolean().describe("false if the photo does not show food or drink"),
  meal_name: z
    .string()
    .describe("Short, friendly name for the meal, e.g. 'Chicken rice bowl'"),
  items: z.array(
    z.object({
      dish: z
        .string()
        .describe("The dish this component belongs to (e.g. 'Kaya toast'); same as name for simple foods"),
      name: z.string().describe("The component, e.g. 'White bread', 'Kaya', 'Butter', 'Soft-boiled egg'"),
      portion: z.string().describe("Estimated amount, e.g. '2 slices (60 g)'"),
      reference: z
        .string()
        .describe(
          "The per-unit reference value used and its source, e.g. '1 slice white bread (30 g) = 80 kcal · 3 g P · 15 g C · 1 g F (USDA)'",
        ),
      amount: z.string().describe("How the quantity was judged from the photo/description, e.g. '2 slices visible, standard thickness'"),
      calculation: z.string().describe("The arithmetic from reference to total, e.g. '2 × 80 kcal = 160 kcal'"),
      assumptions: z
        .string()
        .describe("Preparation and hidden-calorie assumptions, e.g. 'toasted, no extra spread'; empty string if none"),
      calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    }),
  ),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z
    .string()
    .describe(
      "One short sentence on assumptions (oil, sauces, portion size) or what would improve the estimate",
    ),
});

export type MealAnalysis = {
  isFood: boolean;
  name: string;
  items: MealItem[];
  confidence: "low" | "medium" | "high";
  notes: string;
};

export type AiUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type AnalyzeResult =
  | { ok: true; analysis: MealAnalysis; usage: AiUsage[] }
  | { ok: false; error: string; usage: AiUsage[] };

const SYSTEM = `You are a nutrition estimator inside a gym diary app. The user photographs what they eat; you estimate what is in the photo and its nutrition.

How to estimate:
- Identify each distinct food or drink visible. Use plate, cutlery, hands and packaging to judge portion sizes, and state the portion you assumed in grams or common units.
- Break composite dishes into their components, each as its own item with the same "dish" name. Example: kaya toast → white bread (2 slices), kaya (1 tbsp), butter (1 pat); soft-boiled eggs → eggs (2 large) as their own dish; kopi → coffee, condensed milk, sugar.
- Show your working for every item so the user can check it:
  - reference: the per-unit value you used and its source (USDA FoodData Central, Singapore HPB energy & nutrient composition, or the brand's label), e.g. "1 large egg (50 g) = 72 kcal · 6 g P · 0 g C · 5 g F (USDA)".
  - amount: how many units you see and why, e.g. "2 eggs in the saucer".
  - calculation: the arithmetic from reference to total, e.g. "2 × 72 = 144 kcal".
  - assumptions: preparation and hidden calories, e.g. "soft-boiled, no oil; dash of soy sauce ≈ 5 kcal".
- The item's calories and macros must equal the calculation's result.
- Account for hidden calories that are typical for the dish (cooking oil, butter, dressings, sauces, sugar in drinks), and mention the main assumption in notes.
- Use standard nutrition values (USDA FoodData Central; Singapore HPB for local dishes). Calories in kcal, macros in grams. Round calories to the nearest 5 and macros to the nearest gram.
- If the user adds a description, trust it over what you infer from the image (e.g. brand, portion, "only ate half").
- If the photo is a nutrition label or menu item, use the stated values.
- If the image does not show food or drink, set is_food to false and return an empty items list.
Be realistic rather than optimistic: people usually under-estimate, so do not round portions down.
Write notes and assumptions in short plain phrases. No em dashes.`;

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

type Attempt =
  | { kind: "ok"; analysis: MealAnalysis; usage: AiUsage }
  | { kind: "retry"; error: string; usage: AiUsage | null }
  | { kind: "fatal"; error: string };

async function attempt(
  c: Anthropic,
  model: string,
  input: { base64: string; mediaType: ImageMediaType; hint?: string | null },
): Promise<Attempt> {
  const hint = input.hint?.trim();
  const serverFallback = SERVER_FALLBACK_MODELS.has(model);
  try {
    const response = await c.beta.messages.parse({
      model,
      max_tokens: 16000,
      ...(serverFallback
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      output_config: { effort: EFFORT, format: betaZodOutputFormat(MealEstimate) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: input.mediaType, data: input.base64 },
            },
            {
              type: "text",
              text: hint
                ? `Estimate the nutrition of this meal. My description: ${hint}`
                : "Estimate the nutrition of this meal.",
            },
          ],
        },
      ],
    });

    const servedBy = response.model || model;
    const inTok =
      response.usage.input_tokens +
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0);
    const outTok = response.usage.output_tokens;
    const usage: AiUsage = {
      model: servedBy,
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: estimateCostUsd(servedBy, inTok, outTok),
    };
    console.info(
      `[meal-ai] model=${servedBy} in=${inTok} out=${outTok} cost=$${usage.costUsd.toFixed(5)} stop=${response.stop_reason}`,
    );

    if (response.stop_reason === "refusal") {
      return { kind: "retry", error: "The AI couldn't analyse this photo.", usage };
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return { kind: "retry", error: "The AI response was incomplete.", usage };
    }

    const out = plainText(response.parsed_output);
    return {
      kind: "ok",
      usage,
      analysis: {
        isFood: out.is_food,
        name: out.meal_name,
        confidence: out.confidence,
        notes: out.notes,
        items: out.items.map((it) => ({
          name: it.name,
          portion: it.portion,
          dish: it.dish || null,
          reference: it.reference || null,
          amount: it.amount || null,
          calculation: it.calculation || null,
          assumptions: it.assumptions || null,
          calories: Math.max(0, Math.round(it.calories)),
          protein: Math.max(0, Math.round(it.protein_g)),
          carbs: Math.max(0, Math.round(it.carbs_g)),
          fat: Math.max(0, Math.round(it.fat_g)),
        })),
      },
    };
  } catch (err) {
    // A bad key is the same for every model — don't bother retrying.
    if (err instanceof Anthropic.AuthenticationError) {
      return { kind: "fatal", error: "The server's Anthropic API key was rejected." };
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return { kind: "fatal", error: "This API key can't use the AI model." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { kind: "retry", error: "The AI is busy. Try again in a minute.", usage: null };
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error(`[meal-ai] ${model} bad request:`, err.message);
      return { kind: "retry", error: "That image couldn't be processed. Try a different photo.", usage: null };
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`[meal-ai] ${model} API error ${err.status}:`, err.message);
      return { kind: "retry", error: "The AI had a problem. Please try again.", usage: null };
    }
    console.error(`[meal-ai] ${model} failed:`, err);
    return {
      kind: "retry",
      error: "Couldn't reach the AI service. Check your connection and try again.",
      usage: null,
    };
  }
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function analyzeMealImage(input: {
  base64: string;
  mediaType: ImageMediaType;
  hint?: string | null;
}): Promise<AnalyzeResult> {
  const c = getClient();
  if (!c) {
    return {
      ok: false,
      usage: [],
      error:
        "AI analysis isn't configured. Set ANTHROPIC_API_KEY on the server, or enter the meal manually.",
    };
  }

  const usage: AiUsage[] = [];
  const models = [PRIMARY_MODEL, BACKUP_MODEL].filter(
    (m, i, arr) => m && arr.indexOf(m) === i,
  );
  let lastError = "The AI couldn't analyse this photo. Try another one or enter it manually.";
  for (const model of models) {
    const res = await attempt(c, model, input);
    if (res.kind === "ok") {
      usage.push(res.usage);
      return { ok: true, analysis: res.analysis, usage };
    }
    if (res.kind === "fatal") return { ok: false, error: res.error, usage };
    if (res.usage) usage.push(res.usage);
    lastError = res.error;
    if (model !== models[models.length - 1]) {
      console.warn(`[meal-ai] ${model} failed (${res.error}); retrying on backup model`);
    }
  }
  return { ok: false, error: lastError, usage };
}
