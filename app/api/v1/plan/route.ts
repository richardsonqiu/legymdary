import type { PlanResponse } from "@legymdary/shared";
import { getEnergyContext } from "@/lib/energy-data";
import { goalsDto, planDto } from "@/lib/services/dto";
import { ok, route } from "@/lib/services/http";

/** Goals, the calculated plan and today's locked target. */
export const GET = route(async () => {
  const e = await getEnergyContext();
  const res: PlanResponse = {
    goals: e.goals ? goalsDto(e.goals) : null,
    plan: planDto(e.plan),
    targets: e.targets,
    targetMode: e.targetMode,
    weight: e.body.weight,
    bodyFat: e.body.bodyFat,
  };
  return ok(res);
});
