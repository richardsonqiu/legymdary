import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { db } from "@/db";
import { aiUsage } from "@/db/schema";
import { estimateCostUsd } from "@/lib/food-ai";

/**
 * Server-only. One structured Claude call with a primary → backup model
 * chain (default Haiku 5.5 → Sonnet 5.5), usage/cost logging into ai_usage,
 * and typed parsing via structured outputs.
 */

const SERVER_FALLBACK_MODELS = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-2",
]);

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

export type StructuredResult<T> =
  | { ok: true; data: T; model: string }
  | { ok: false; error: string };

export async function structuredCall<S extends z.ZodType>(opts: {
  userId: string;
  feature: string;
  schema: S;
  system: string;
  user: string;
  models: string[];
  effort?: "low" | "medium" | "high";
}): Promise<StructuredResult<z.infer<S>>> {
  const c = getClient();
  if (!c) return { ok: false, error: "AI isn't configured (ANTHROPIC_API_KEY is not set)." };
  const effort = opts.effort ?? "low";
  const models = opts.models.filter((m, i, a) => m && a.indexOf(m) === i);
  let lastError = "The AI couldn't produce a result. Please try again.";

  for (const model of models) {
    const fallback = SERVER_FALLBACK_MODELS.has(model);
    try {
      const res = await c.beta.messages.parse({
        model,
        max_tokens: 16000,
        ...(fallback
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
        output_config: { effort, format: betaZodOutputFormat(opts.schema) },
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      });
      const served = res.model || model;
      const inTok =
        res.usage.input_tokens +
        (res.usage.cache_creation_input_tokens ?? 0) +
        (res.usage.cache_read_input_tokens ?? 0);
      const outTok = res.usage.output_tokens;
      const cost = estimateCostUsd(served, inTok, outTok);
      console.info(
        `[ai:${opts.feature}] model=${served} in=${inTok} out=${outTok} cost=$${cost.toFixed(5)} stop=${res.stop_reason}`,
      );
      await db
        .insert(aiUsage)
        .values({
          userId: opts.userId,
          feature: opts.feature,
          model: served,
          inputTokens: inTok,
          outputTokens: outTok,
          costUsd: cost,
        })
        .catch((e) => console.error("ai_usage insert failed", e));
      if (res.stop_reason === "refusal") {
        lastError = "The AI declined this request.";
        continue;
      }
      if (res.stop_reason === "max_tokens" || !res.parsed_output) {
        lastError = "The AI response was incomplete.";
        continue;
      }
      return { ok: true, data: res.parsed_output as z.infer<S>, model: served };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        return { ok: false, error: "The server's Anthropic API key was rejected." };
      }
      if (err instanceof Anthropic.PermissionDeniedError) {
        return { ok: false, error: "This API key can't use the AI model." };
      }
      if (err instanceof Anthropic.RateLimitError) {
        lastError = "The AI is busy right now — try again in a minute.";
      } else if (err instanceof Anthropic.APIError) {
        console.error(`[ai:${opts.feature}] ${model} API error ${err.status}:`, err.message);
        lastError = "The AI service had a problem. Please try again.";
      } else {
        console.error(`[ai:${opts.feature}] ${model} failed:`, err);
        lastError = "Couldn't reach the AI service.";
      }
    }
  }
  return { ok: false, error: lastError };
}
