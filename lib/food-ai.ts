import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { MealItem } from "@/lib/nutrition";

/**
 * Server-only: estimates the contents and nutrition of a meal photo with
 * Claude's vision. Never import this from a client component.
 */

const MealEstimate = z.object({
  is_food: z
    .boolean()
    .describe("false if the photo does not show food or drink"),
  meal_name: z.string().describe("Short, friendly name for the meal, e.g. 'Chicken rice bowl'"),
  items: z.array(
    z.object({
      name: z.string(),
      portion: z.string().describe("Estimated amount, e.g. '1 cup (180 g)'"),
      calories: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    }),
  ),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z
    .string()
    .describe("One short sentence on assumptions (oil, sauces, portion size) or what would improve the estimate"),
});

export type MealAnalysis = {
  isFood: boolean;
  name: string;
  items: MealItem[];
  confidence: "low" | "medium" | "high";
  notes: string;
};

const SYSTEM = `You are a nutrition estimator inside a gym diary app. The user photographs what they eat; you estimate what is in the photo and its nutrition.

How to estimate:
- Identify each distinct food or drink visible. Use plate, cutlery, hands and packaging to judge portion sizes, and state the portion you assumed in grams or common units.
- Account for hidden calories that are typical for the dish (cooking oil, butter, dressings, sauces, sugar in drinks), and mention the main assumption in notes.
- Use standard nutrition values (USDA-style). Calories in kcal, macros in grams. Round calories to the nearest 5 and macros to the nearest gram.
- If the user adds a description, trust it over what you infer from the image (e.g. brand, portion, "only ate half").
- If the photo is a nutrition label or menu item, use the stated values.
- If the image does not show food or drink, set is_food to false and return an empty items list.
Be realistic rather than optimistic: people usually under-estimate, so do not round portions down.`;

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

export async function analyzeMealImage(input: {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  hint?: string | null;
}): Promise<MealAnalysis | { error: string }> {
  const c = getClient();
  if (!c) {
    return {
      error:
        "AI analysis isn't configured. Set ANTHROPIC_API_KEY on the server, or enter the meal manually.",
    };
  }

  const hint = input.hint?.trim();
  try {
    const response = await c.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(MealEstimate),
      },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: input.mediaType,
                data: input.base64,
              },
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

    if (response.stop_reason === "refusal") {
      return { error: "The AI couldn't analyse this photo. Try another one or enter it manually." };
    }
    if (response.stop_reason === "max_tokens" || !response.parsed_output) {
      return { error: "The AI response was incomplete. Please try again." };
    }

    const out = response.parsed_output;
    return {
      isFood: out.is_food,
      name: out.meal_name,
      confidence: out.confidence,
      notes: out.notes,
      items: out.items.map((it) => ({
        name: it.name,
        portion: it.portion,
        calories: Math.max(0, Math.round(it.calories)),
        protein: Math.max(0, Math.round(it.protein_g)),
        carbs: Math.max(0, Math.round(it.carbs_g)),
        fat: Math.max(0, Math.round(it.fat_g)),
      })),
    };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { error: "The server's Anthropic API key was rejected." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { error: "The AI is busy right now — try again in a minute." };
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error("Meal analysis bad request:", err.message);
      return { error: "That image couldn't be processed. Try a different photo." };
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Meal analysis API error ${err.status}:`, err.message);
      return { error: "The AI service had a problem. Please try again." };
    }
    console.error("Meal analysis failed:", err);
    return { error: "Couldn't reach the AI service. Check your connection and try again." };
  }
}
