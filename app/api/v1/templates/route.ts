import type { TemplatesResponse } from "@legymdary/shared";
import { getTemplates } from "@/lib/queries";
import { ok, route } from "@/lib/services/http";

export const GET = route(async () => {
  const res: TemplatesResponse = {
    templates: (await getTemplates()).map((t) => ({ ...t, lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null })),
  };
  return ok(res);
});
