/**
 * Calls the /api/v1 route handlers directly (no dev server) against a THROWAWAY local SQLite
 * file, with and without a bearer token. Never point DATABASE_URL at a remote database.
 *
 *   npx.cmd tsx --import ./scripts/api-smoke-preload.mjs scripts/api-smoke.ts
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "legymdary-smoke-"));
process.env.DATABASE_URL = `file:${join(dir, "smoke.db").replace(/\\/g, "/")}`;
process.env.DATABASE_AUTH_TOKEN = "";
process.env.AUTH_SECRET ||= "smoke-test-secret";

type Handler = (req: Request, ctx: never) => Promise<Response>;
let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (!cond) failures++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : ` ${JSON.stringify(extra)}`}`);
}

async function main() {
  if (!process.env.DATABASE_URL?.startsWith("file:")) throw new Error("refusing: not a local file DB");
  const { db } = await import("@/db");
  const schema = await import("@/db/schema");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  await migrate(db, { migrationsFolder: "./drizzle" });

  const userId = "smoke-user";
  await db.insert(schema.users).values({ id: userId, email: "smoke@example.com", name: "Smoke" });
  const [ex] = await db.insert(schema.exercises).values({ name: "Bench Press", muscleGroup: "Chest", equipment: "Barbell" }).returning();
  const [tpl] = await db.insert(schema.templates).values({ userId, name: "Push" }).returning();
  await db.insert(schema.templateExercises).values({ templateId: tpl.id, exerciseId: ex.id, position: 0, targetSets: 3 });
  const { createApiToken } = await import("@/lib/api-token");
  const { token } = await createApiToken(userId, "smoke");

  async function call(
    mod: string,
    method: string,
    opts: { body?: unknown; id?: number; query?: string; token?: string | null } = {},
  ) {
    const h: Record<string, string> = { "x-timezone": "Asia/Singapore" };
    const t = opts.token === undefined ? token : opts.token;
    if (t) h.authorization = `Bearer ${t}`;
    if (opts.body !== undefined) h["content-type"] = "application/json";
    (globalThis as { __smokeHeaders?: unknown }).__smokeHeaders = h;
    const handlers = (await import(`@/app/api/v1/${mod}/route`)) as Record<string, Handler>;
    const req = new Request(`http://localhost/api/v1/${mod}${opts.query ?? ""}`, {
      method,
      headers: h,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const res = await handlers[method](req, { params: Promise.resolve({ id: String(opts.id ?? 0) }) } as never);
    const ct = res.headers.get("content-type") ?? "";
    return { status: res.status, json: ct.includes("json") ? await res.json() : null, res };
  }

  // Every route: 401 with no token and with a bad token.
  const routes: [string, string][] = [
    ["today", "GET"], ["meals", "GET"], ["meals", "POST"], ["meals/recent", "GET"], ["meals/analyze", "POST"],
    ["meals/skip", "POST"], ["meals/skip", "DELETE"], ["meals/[id]", "GET"], ["meals/[id]", "PATCH"], ["meals/[id]", "DELETE"],
    ["meals/[id]/photo", "GET"], ["meals/[id]/relog", "POST"], ["workouts", "GET"], ["workouts", "POST"],
    ["workouts/active", "GET"], ["workouts/from-template", "POST"], ["workouts/recommended", "POST"],
    ["workouts/[id]", "GET"], ["workouts/[id]", "PATCH"], ["workouts/[id]", "DELETE"], ["workouts/[id]/finish", "POST"],
    ["workouts/[id]/exercises", "POST"], ["workout-exercises/[id]", "DELETE"], ["workout-exercises/[id]/sets", "POST"],
    ["sets/[id]", "DELETE"], ["exercises", "GET"], ["exercises", "POST"], ["templates", "GET"],
    ["body-stats", "GET"], ["body-stats", "POST"], ["body-stats/[id]", "DELETE"], ["plan", "GET"], ["plan/goals", "PUT"],
    ["plan/pace", "PUT"], ["plan/mode", "PUT"], ["stats/consistency", "GET"], ["health/batch", "POST"], ["health/data", "DELETE"],
  ];
  for (const [mod, method] of routes) {
    for (const t of [null, "not-a-real-token"]) {
      const r = await call(mod, method, { id: 1, token: t, body: method === "GET" ? undefined : {} });
      check(`401 ${method} ${mod} (${t ? "bad" : "no"} token)`, r.status === 401 && r.res.headers.get("cache-control") === "no-store", r.status);
    }
  }

  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHnOcQAAAAABJRU5ErkJggg==";
  const day = "2026-11-25";

  // Food
  let r = await call("meals", "POST", { body: { date: day, mealType: "lunch", name: "Rice", items: [{ name: "Rice", portion: "1 bowl", calories: 300, protein: 6, carbs: 60, fat: 1 }], photo: png } });
  check("POST meals 201", r.status === 201 && typeof r.json.id === "number", r);
  const mealId = r.json.id as number;
  r = await call("meals", "POST", { body: { date: "nope" } });
  check("POST meals bad body 400", r.status === 400, r);
  r = await call("meals", "GET", { query: `?date=${day}` });
  check("GET meals", r.status === 200 && r.json.meals.length === 1 && r.json.meals[0].hasPhoto === true && r.json.meals[0].calories === 300 && typeof r.json.meals[0].createdAt === "string", r);
  r = await call("meals/[id]", "GET", { id: mealId });
  check("GET meal", r.status === 200 && r.json.meal.items[0].name === "Rice", r);
  r = await call("meals/[id]", "PATCH", { id: mealId, body: { date: day, mealType: "lunch", name: "Rice and egg", items: [{ name: "Rice", portion: "1", calories: 300, protein: 6, carbs: 60, fat: 1 }, { name: "Egg", portion: "1", calories: 70, protein: 6, carbs: 0, fat: 5 }] } });
  check("PATCH meal", r.status === 200 && r.json.meal.calories === 370, r);
  r = await call("meals/[id]/photo", "GET", { id: mealId });
  check("GET photo", r.status === 200 && r.res.headers.get("content-type") === "image/png", r.status);
  r = await call("meals/[id]/relog", "POST", { id: mealId, body: { date: "2026-11-26", mealType: "dinner" } });
  check("POST relog", r.status === 201, r);
  r = await call("meals/recent", "GET");
  check("GET recent", r.status === 200 && r.json.meals.length === 1, r);
  r = await call("meals/skip", "POST", { body: { date: day, mealType: "breakfast" } });
  check("POST skip", r.status === 200 && r.json.ok === true, r);
  r = await call("meals/skip", "DELETE", { body: { date: day, mealType: "breakfast" } });
  check("DELETE skip", r.status === 200, r);
  r = await call("meals/analyze", "POST", { body: { hint: "" } });
  check("POST analyze with nothing to analyse is 400 (no AI call)", r.status === 400, r);
  r = await call("meals/[id]", "DELETE", { id: mealId });
  check("DELETE meal", r.status === 200, r);
  r = await call("meals/[id]", "GET", { id: mealId });
  check("GET deleted meal 404", r.status === 404, r);

  // Workouts
  r = await call("exercises", "POST", { body: { name: "Cable Fly", muscleGroup: "Chest", equipment: "Cable" } });
  check("POST exercise", r.status === 201 && typeof r.json.id === "number", r);
  r = await call("exercises", "GET");
  check("GET exercises", r.status === 200 && r.json.exercises.length === 2, r);
  r = await call("templates", "GET");
  check("GET templates", r.status === 200 && r.json.templates[0].exercises[0].name === "Bench Press", r);
  r = await call("workouts", "POST", { body: { name: "Push", date: day } });
  check("POST workout", r.status === 201, r);
  const wid = r.json.id as number;
  r = await call("workouts/active", "GET");
  check("GET active", r.status === 200 && r.json.workout?.id === wid, r);
  r = await call("workouts/[id]/exercises", "POST", { id: wid, body: { exerciseId: ex.id } });
  check("POST workout exercise", r.status === 201, r);
  const weid = r.json.workoutExerciseId as number;
  r = await call("workout-exercises/[id]/sets", "POST", { id: weid, body: { reps: 5, weight: 60 } });
  check("POST set is a PR", r.status === 201 && r.json.isPR === true, r);
  const setRow = (await db.select().from(schema.sets))[0];
  r = await call("workout-exercises/[id]/sets", "POST", { id: weid, body: { reps: 0, weight: 60 } });
  check("POST set bad reps 400", r.status === 400, r);
  r = await call("workouts/[id]", "PATCH", { id: wid, body: { notes: "good" } });
  check("PATCH workout", r.status === 200 && r.json.workout.notes === "good" && r.json.workout.totalSets === 1, r);
  r = await call("workouts/[id]/finish", "POST", { id: wid });
  check("finish workout", r.status === 200 && r.json.workout.finished === true, r);
  r = await call("workouts", "GET", { query: "?limit=5" });
  check("GET workouts", r.status === 200 && r.json.workouts.length === 1, r);
  r = await call("workouts/from-template", "POST", { body: { templateId: tpl.id, date: day } });
  check("POST from-template", r.status === 201 && typeof r.json.id === "number", r);
  r = await call("workouts/recommended", "POST");
  check("POST recommended answers 201 or a 400 message", r.status === 201 || (r.status === 400 && typeof r.json.error === "string"), r);
  r = await call("sets/[id]", "DELETE", { id: setRow.id });
  check("DELETE set", r.status === 200, r);
  r = await call("workout-exercises/[id]", "DELETE", { id: weid });
  check("DELETE workout exercise", r.status === 200, r);
  r = await call("workouts/[id]", "DELETE", { id: wid });
  check("DELETE workout", r.status === 200, r);
  r = await call("workouts/[id]", "GET", { id: wid });
  check("GET deleted workout 404", r.status === 404, r);

  // Body, plan, stats
  r = await call("body-stats", "POST", { body: { date: day, weight: 80, bodyFat: 20 } });
  check("POST body-stats", r.status === 201, r);
  r = await call("body-stats", "POST", { body: { date: day, weight: 5 } });
  check("POST body-stats out of range 400", r.status === 400, r);
  r = await call("body-stats", "GET");
  check("GET body-stats", r.status === 200 && r.json.bodyStats[0].weight === 80, r);
  r = await call("body-stats/[id]", "DELETE", { id: r.json.bodyStats[0].id });
  check("DELETE body-stat", r.status === 200, r);
  r = await call("plan/goals", "PUT", { body: { sex: "male", birthYear: 1995, heightCm: 180, activityLevel: "moderate", targetWeight: 75 } });
  check("PUT goals", r.status === 200 && r.json.ok === true, r);
  r = await call("plan/pace", "PUT", { body: { weeklyRate: 0.5 } });
  check("PUT pace", r.status === 200, r);
  r = await call("plan/mode", "PUT", { body: { mode: "adaptive" } });
  check("PUT mode", r.status === 200, r);
  r = await call("plan", "GET");
  check("GET plan", r.status === 200 && r.json.goals?.targetWeight === 75 && r.json.targetMode === "adaptive" && "plan" in r.json, r);
  r = await call("today", "GET");
  check("GET today", r.status === 200 && typeof r.json.eaten.calories === "number" && Array.isArray(r.json.logged), r);
  r = await call("stats/consistency", "GET");
  check("GET consistency", r.status === 200 && Array.isArray(r.json.days) && "current" in r.json.foodStreak, r);

  // Health
  const wk = (id: string) => ({ id, date: day, startLocal: `${day} 07:00:00`, type: "running", name: "Run", durationSec: 1800, kcal: 300, distanceM: 5000, avgHr: 150, maxHr: 170, minHr: 100, zonesSec: null });
  const batch = (source: string, id: string, extra: object = {}) => ({
    source, days: [{ date: day, steps: 9000, activeKcal: 400, basalKcal: 1700, exerciseMin: 30, restingHr: 55, hrv: 60, hrvWeekly: 58 }],
    sleep: [], workouts: [wk(id)], body: [{ date: day, weight: 79.5, bodyFat: null }], ...extra,
  });
  r = await call("health/batch", "POST", { body: batch("apple", "apple-AAA") });
  check("POST health apple", r.status === 200, r);
  r = await call("health/batch", "POST", { body: batch("health_connect", "hc-BBB") });
  check("POST health health_connect", r.status === 200, r);
  r = await call("health/batch", "POST", { body: batch("health_connect", "apple-BBB") });
  check("POST health hc with apple- id 400", r.status === 400, r);
  r = await call("health/batch", "POST", { body: batch("apple", "apple-CCC", { workoutRange: { from: day, to: day } }) });
  check("POST health apple replacing workouts in range", r.status === 200, r);
  const acts = (await db.select({ id: schema.garminActivities.activityId }).from(schema.garminActivities)).map((a) => a.id).sort();
  check("same workout re-read under a new id does not double (apple-AAA replaced, hc-BBB kept)", acts.join() === "apple-CCC,hc-BBB", acts);
  const daysBySource = (await db.select({ s: schema.sourceDaily.source }).from(schema.sourceDaily)).map((d) => d.s).sort();
  check("source_daily has both sources", daysBySource.join() === "apple,health_connect", daysBySource);
  r = await call("today", "GET", { query: `?date=${day}` });
  check("today sees wearable data", r.json.wearable === true && r.json.steps === 9000, r.json);
  r = await call("health/data", "DELETE", { body: { source: "health_connect" } });
  check("DELETE health_connect data", r.status === 200, r);
  const left = (await db.select({ id: schema.garminActivities.activityId }).from(schema.garminActivities)).map((a) => a.id);
  const leftDays = (await db.select({ s: schema.sourceDaily.source }).from(schema.sourceDaily)).map((d) => d.s);
  const leftBody = (await db.select({ s: schema.bodyStats.source }).from(schema.bodyStats)).map((d) => d.s);
  check("disconnect removed only health_connect", left.join() === "apple-CCC" && leftDays.join() === "apple" && leftBody.join() === "apple", { left, leftDays, leftBody });

  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
