import { asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { exercises } from "@/db/schema";
import { buildTemplate, csvTemplate } from "@/lib/sheet-import/template";
import { getSessionUser, userToday } from "@/lib/session";

/**
 * The import template: ?format=xlsx (default) or ?format=csv&sheet=workouts|cardio.
 * The .xlsx lists the signed-in user's exercises for the Exercise dropdown.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.id) return new Response("Not signed in", { status: 401 });
  const url = new URL(request.url);
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

  if (url.searchParams.get("format") === "csv") {
    const kind = url.searchParams.get("sheet") === "cardio" ? "cardio" : "workouts";
    return new Response(csvTemplate(kind), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="legymdary-${kind}-template.csv"`,
      },
    });
  }

  const lib = await db
    .select({ name: exercises.name, muscleGroup: exercises.muscleGroup })
    .from(exercises)
    .where(or(isNull(exercises.userId), eq(exercises.userId, user.id)))
    .orderBy(asc(exercises.muscleGroup), asc(exercises.name));
  const file = buildTemplate(lib, await userToday());
  return new Response(new Uint8Array(file), {
    headers: {
      ...headers,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="legymdary-import-template.xlsx"`,
    },
  });
}
