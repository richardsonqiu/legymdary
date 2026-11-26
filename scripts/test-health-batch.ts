/** Run: npx.cmd tsx scripts/test-health-batch.ts. Checks the phone-to-server health batch mapping. */
process.env.TZ = "Asia/Singapore";
import assert from "node:assert/strict";
import { buildBatchRequests, emptyRawHealth, healthBatchRequestSchema } from "../packages/shared/src/index";

const FROM = "2026-11-18";
const TO = "2026-11-21";

// 1. A night and a nap that end on the same day make ONE sleep row, and it passes the server schema.
{
  const raw = emptyRawHealth();
  raw.sleep = [
    { start: "2026-11-19T23:00:00+08:00", end: "2026-11-20T07:00:00+08:00", stage: "asleep" },
    { start: "2026-11-20T14:00:00+08:00", end: "2026-11-20T15:00:00+08:00", stage: "asleep" },
  ];
  const [req] = buildBatchRequests(raw, "apple", FROM, TO);
  assert.equal(req.sleep.length, 1);
  assert.equal(req.sleep[0].date, "2026-11-20");
  assert.equal(req.sleep[0].asleepSec, 9 * 3600);
  assert.equal(new Set(req.sleep.map((s) => s.date)).size, req.sleep.length);
  assert.ok(healthBatchRequestSchema.safeParse(req).success);
}

// 2. workoutRange only when at least one workout was read.
{
  const raw = emptyRawHealth();
  raw.steps = [{ start: "2026-11-20T00:00:00+08:00", value: 1000 }];
  assert.equal(buildBatchRequests(raw, "health_connect", FROM, TO).at(-1)!.workoutRange, undefined);
  raw.workouts = [{ id: "3d366e60-4f7c-4f72-b0ce-479ea19279b8", start: "2026-11-20T18:00:00+08:00", end: "2026-11-20T19:00:00+08:00", activity: "Running", kcal: 300, distanceM: 5000 }];
  const last = buildBatchRequests(raw, "health_connect", FROM, TO).at(-1)!;
  assert.deepEqual(last.workoutRange, { from: FROM, to: TO });
  assert.ok(last.workouts[0].id.startsWith("hc-"));
  assert.ok(healthBatchRequestSchema.safeParse(last).success);
}
console.log("health batch tests passed");
