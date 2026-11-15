/**
 * Fails if any structured-output schema we send to Claude exceeds the API's
 * documented complexity limits (a violation is a 400 for every request):
 *   - at most 16 parameters with union types (anyOf / type arrays, e.g. nullable)
 *   - at most 24 optional parameters (not listed in `required`)
 * Run: npm run check:ai-schemas
 */
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { bodyScanResultSchema } from "@/lib/body-scan-ai";
import { AnswerSchema, ReportSchema } from "@/lib/analysis/report";
import { MealEstimate } from "@/lib/food-ai";

const MAX_UNIONS = 16;
const MAX_OPTIONAL = 24;

type Json = Record<string, unknown>;

function count(node: unknown, acc = { unions: 0, optional: 0 }) {
  if (Array.isArray(node)) node.forEach((n) => count(n, acc));
  else if (node && typeof node === "object") {
    const o = node as Json;
    if (o.properties && typeof o.properties === "object") {
      const req = new Set((o.required as string[] | undefined) ?? []);
      for (const [k, v] of Object.entries(o.properties as Json)) {
        const p = v as Json;
        if (!req.has(k)) acc.optional++;
        if (Array.isArray(p.anyOf) || Array.isArray(p.oneOf) || Array.isArray(p.type)) acc.unions++;
      }
    }
    for (const v of Object.values(o)) count(v, acc);
  }
  return acc;
}

const schemas: Record<string, z.ZodType> = {
  body_scan: bodyScanResultSchema,
  daily_report: ReportSchema,
  report_answer: AnswerSchema,
  meal_estimate: MealEstimate,
};

let failed = false;
for (const [name, schema] of Object.entries(schemas)) {
  const fmt = betaZodOutputFormat(schema as never) as unknown as { schema: unknown };
  const { unions, optional } = count(fmt.schema);
  const ok = unions <= MAX_UNIONS && optional <= MAX_OPTIONAL;
  if (!ok) failed = true;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${unions}/${MAX_UNIONS} union params, ${optional}/${MAX_OPTIONAL} optional params`);
}
process.exit(failed ? 1 : 0);
