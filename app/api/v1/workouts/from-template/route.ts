import { fromTemplateRequestSchema } from "@legymdary/shared";
import { userToday } from "@/lib/session";
import { body, ok, route } from "@/lib/services/http";
import { startWorkoutFromTemplate } from "@/lib/services/workouts";

export const POST = route(async (request, { userId }) => {
  const input = await body(request, fromTemplateRequestSchema);
  const id = await startWorkoutFromTemplate(userId, input.templateId, input.date ?? (await userToday()));
  return ok({ id }, 201);
});
