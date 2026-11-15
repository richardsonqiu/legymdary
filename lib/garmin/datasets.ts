import { getJson } from "@/lib/garmin/client";

/**
 * Catalogue of every Garmin Personal API dataset we import (all 26 endpoints
 * except the binary .FIT download, which is streamed on demand instead).
 *
 * kinds:
 * - "range":    one call covers many days (chunked to Garmin's max range)
 * - "daily":    one call per calendar day (intraday detail)
 * - "activity": one call per activity id (found via the "activities" dataset)
 * - "snapshot": current settings/profile, refreshed periodically
 */

export type RawItem = { key: string; date: string | null; payload: unknown };

type Base = { id: string; label: string; group: string; description: string };
export type RangeDataset = Base & {
  kind: "range";
  chunkDays: number;
  /** "summary" datasets back-fill a full year; others follow the detail depth. */
  depth: "summary" | "detail";
  fetch: (token: string, start: string, end: string) => Promise<RawItem[]>;
};
export type DailyDataset = Base & {
  kind: "daily";
  fetch: (token: string, date: string) => Promise<RawItem[]>;
};
export type ActivityDataset = Base & {
  kind: "activity";
  fetch: (token: string, activityId: string, date: string | null) => Promise<RawItem[]>;
};
export type SnapshotDataset = Base & {
  kind: "snapshot";
  fetch: (token: string, today: string) => Promise<RawItem[]>;
};
export type Dataset = RangeDataset | DailyDataset | ActivityDataset | SnapshotDataset;

const asArray = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
const day = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
/** True when a payload carries no information (null, {}, [] or all-null). */
export function isEmptyPayload(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v as object).every((x) => isEmptyPayload(x));
  return false;
}
/** Range items keyed by their calendar date. */
const byDate = (items: Record<string, unknown>[], field: string): RawItem[] =>
  items.flatMap((it) => {
    const d = day(it[field]);
    return d ? [{ key: d, date: d, payload: it }] : [];
  });
/** Range items grouped per date (several entries per day, e.g. weigh-ins). */
const groupedByDate = (items: Record<string, unknown>[], field: string): RawItem[] => {
  const m = new Map<string, unknown[]>();
  for (const it of items) {
    const d = day(it[field]);
    if (d) m.set(d, [...(m.get(d) ?? []), it]);
  }
  return [...m].map(([d, list]) => ({ key: d, date: d, payload: list }));
};
const single = (date: string, payload: unknown): RawItem[] =>
  isEmptyPayload(payload) ? [] : [{ key: date, date, payload }];

export const DATASETS: Dataset[] = [
  /* ---------------- Daily summaries (range, full year) ---------------- */
  {
    id: "daily_summary",
    label: "Daily summary",
    group: "Daily",
    description: "Calories (total/active/BMR/consumed), steps, floors, HR, intensity minutes, stress, Body Battery, hydration, respiration, SpO2.",
    kind: "range",
    chunkDays: 365,
    depth: "summary",
    fetch: async (t, s, e) => {
      const r = (await getJson(t, "/usersummary-service/v2/dailysummaries", { startDate: s, endDate: e })) as
        | { data?: unknown }
        | unknown[];
      return byDate(asArray(Array.isArray(r) ? r : r?.data), "calendarDate");
    },
  },
  {
    id: "sleep_summary",
    label: "Sleep summary",
    group: "Sleep",
    description: "Sleep duration and stages, sleep scores, SpO2/respiration during sleep, sleep stress, sleep need, naps.",
    kind: "range",
    chunkDays: 31,
    depth: "summary",
    fetch: async (t, s, e) =>
      byDate(asArray(await getJson(t, "/sleep-service/sleep/dailySleepSummariesByDate", { startDate: s, endDate: e })), "calendarDate"),
  },
  {
    id: "hrv_daily",
    label: "HRV daily",
    group: "Recovery",
    description: "Overnight HRV average, 5-min high, 7-day average, personal baseline range and status.",
    kind: "range",
    chunkDays: 31,
    depth: "summary",
    fetch: async (t, s, e) => {
      const r = (await getJson(t, `/hrv-service/hrv/daily/${s}/${e}`)) as { hrvSummaries?: unknown } | null;
      return byDate(asArray(r?.hrvSummaries), "calendarDate");
    },
  },
  {
    id: "body_battery_daily",
    label: "Body Battery",
    group: "Recovery",
    description: "Daily charged/drained, intraday Body Battery values and activity impact events.",
    kind: "range",
    chunkDays: 31,
    depth: "summary",
    fetch: async (t, s, e) =>
      byDate(asArray(await getJson(t, "/wellness-service/wellness/bodyBattery/reports/daily", { startDate: s, endDate: e })), "date"),
  },
  {
    id: "steps_daily",
    label: "Steps",
    group: "Daily",
    description: "Daily total steps, distance and step goal.",
    kind: "range",
    chunkDays: 28,
    depth: "summary",
    fetch: async (t, s, e) =>
      byDate(asArray(await getJson(t, `/usersummary-service/stats/steps/daily/${s}/${e}`)), "calendarDate"),
  },
  {
    id: "stress_daily",
    label: "Stress",
    group: "Recovery",
    description: "Daily stress values.",
    kind: "range",
    chunkDays: 28,
    depth: "summary",
    fetch: async (t, s, e) =>
      byDate(asArray(await getJson(t, `/usersummary-service/stats/stress/daily/${s}/${e}`)), "calendarDate"),
  },
  {
    id: "hydration_daily",
    label: "Hydration",
    group: "Daily",
    description: "Water intake, goal, sweat loss and activity intake.",
    kind: "range",
    chunkDays: 31,
    depth: "summary",
    fetch: async (t, s, e) =>
      byDate(asArray(await getJson(t, `/usersummary-service/stats/hydration/daily/${s}/${e}`)), "calendarDate"),
  },
  {
    id: "weight_entries",
    label: "Weigh-ins",
    group: "Body",
    description: "Every weigh-in: weight, BMI, body fat, body water, bone and muscle mass, visceral fat, metabolic age.",
    kind: "range",
    chunkDays: 90,
    depth: "summary",
    fetch: async (t, s, e) =>
      groupedByDate(asArray(await getJson(t, `/weight-service/weight/all/${s}/${e}`)), "calendarDate"),
  },
  {
    id: "wellness_activities",
    label: "Wellness activities",
    group: "Activity",
    description: "Breathwork, meditation and other wellness sessions.",
    kind: "range",
    chunkDays: 31,
    depth: "summary",
    fetch: async (t, s, e) =>
      asArray(await getJson(t, `/wellnessactivity-service/activity/summary/range/${s}/${e}`)).flatMap((it) => {
        const id = String(it.activityUuid ?? it.startTimestampGMT ?? "");
        const d = day(it.calendarDate);
        return id ? [{ key: id, date: d, payload: it }] : [];
      }),
  },
  {
    id: "activities",
    label: "Activities",
    group: "Activity",
    description: "Every activity summary: type, duration, distance, calories, HR, training effect/load, power, cadence, sets…",
    kind: "range",
    chunkDays: 365,
    depth: "summary",
    fetch: async (t, s, e) => {
      const out: RawItem[] = [];
      for (let offset = 0; offset < 5000; offset += 99) {
        const page = asArray(
          await getJson(t, "/activitylist-service/activities/search/activities", {
            start: offset,
            limit: 99,
            startDate: s,
            endDate: e,
          }),
        );
        for (const a of page) {
          if (a.activityId == null) continue;
          out.push({ key: String(a.activityId), date: day(a.startTimeLocal), payload: a });
        }
        if (page.length < 99) break;
      }
      return out;
    },
  },

  /* ---------------- Per-day detail (intraday) ---------------- */
  {
    id: "user_summary",
    label: "Daily summary (detailed)",
    group: "Daily",
    description: "The full ~100-field daily summary incl. stress/Body Battery breakdowns and activity events.",
    kind: "daily",
    fetch: async (t, d) => single(d, await getJson(t, "/usersummary-service/usersummary/daily", { calendarDate: d })),
  },
  {
    id: "sleep_detail",
    label: "Sleep (detailed)",
    group: "Sleep",
    description: "Full night: sleep levels timeline, movement, HR/SpO2/respiration/stress during sleep, sleep score components.",
    kind: "daily",
    fetch: async (t, d) => single(d, await getJson(t, "/sleep-service/sleep/dailySleep", { date: d })),
  },
  {
    id: "hrv_detail",
    label: "HRV readings",
    group: "Recovery",
    description: "Every overnight HRV reading (5-minute values) plus the night's summary.",
    kind: "daily",
    fetch: async (t, d) => single(d, await getJson(t, `/hrv-service/hrv/${d}`)),
  },
  {
    id: "heart_rate_detail",
    label: "Heart rate (all day)",
    group: "Recovery",
    description: "Intraday heart rate time series, min/max/resting.",
    kind: "daily",
    fetch: async (t, d) => single(d, await getJson(t, "/wellness-service/wellness/dailyHeartRate", { date: d })),
  },
  {
    id: "spo2_detail",
    label: "SpO2 & acclimation",
    group: "Recovery",
    description: "Pulse-ox readings (sleep/all-day) and altitude acclimation.",
    kind: "daily",
    fetch: async (t, d) => single(d, await getJson(t, `/wellness-service/wellness/daily/spo2acclimation/${d}`)),
  },
  {
    id: "nutrition_logs",
    label: "Garmin food log",
    group: "Nutrition",
    description: "Foods and meals logged inside Garmin Connect, with nutrients and goals.",
    kind: "daily",
    fetch: async (t, d) =>
      single(
        d,
        await getJson(t, `/nutrition-service/food/logs/${d}`, {
          includeGoals: true,
          includeNutrition: true,
          includeMedia: false,
        }),
      ),
  },
  {
    id: "menstrual_dayview",
    label: "Women's health (day)",
    group: "Women's health",
    description: "Cycle day logs and summary (only for accounts that track a cycle).",
    kind: "daily",
    fetch: async (t, d) =>
      single(d, await getJson(t, `/periodichealth-service/menstrualcycle/dayview/${d}`, { reducedResponse: false })),
  },

  /* ---------------- Per-activity detail ---------------- */
  {
    id: "activity_detail",
    label: "Activity detail",
    group: "Activity",
    description: "Full activity: metadata, measurements and split summaries.",
    kind: "activity",
    fetch: async (t, id, d) => {
      const r = await getJson(t, `/activity-service/activity/${id}`);
      return isEmptyPayload(r) ? [] : [{ key: id, date: d, payload: r }];
    },
  },
  {
    id: "activity_workouts",
    label: "Activity workouts / sets",
    group: "Activity",
    description: "Structured workout steps performed in an activity (e.g. strength sets).",
    kind: "activity",
    fetch: async (t, id, d) => {
      const r = await getJson(t, `/activity-service/activity/${id}/workouts`);
      return isEmptyPayload(r) ? [] : [{ key: id, date: d, payload: r }];
    },
  },

  /* ---------------- Snapshots ---------------- */
  {
    id: "profile_settings",
    label: "Profile settings",
    group: "Profile",
    description: "Units, locale, height/weight settings, sleep window, etc.",
    kind: "snapshot",
    fetch: async (t) => single("latest", await getJson(t, "/userprofile-service/userprofile/settings")).map((i) => ({ ...i, date: null })),
  },
  {
    id: "hr_zones",
    label: "Heart-rate zones",
    group: "Profile",
    description: "Zone floors, max/resting/lactate-threshold HR used per sport.",
    kind: "snapshot",
    fetch: async (t) => single("latest", await getJson(t, "/biometric-service/heartRateZones/v2")).map((i) => ({ ...i, date: null })),
  },
  {
    id: "fitness_age",
    label: "Fitness age",
    group: "Profile",
    description: "Fitness age vs chronological age and its components.",
    kind: "snapshot",
    fetch: async (t, today) => single(today, await getJson(t, `/fitnessage-service/fitnessage/v2/${today}`)),
  },
  {
    id: "weight_goals",
    label: "Weight goals",
    group: "Profile",
    description: "Weight goal set in Garmin Connect and its ranges.",
    kind: "snapshot",
    fetch: async (t, today) => {
      const start = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
      return single("latest", await getJson(t, `/goal-service/goal/user/effective/weightgoal/${start}/${today}`)).map((i) => ({ ...i, date: null }));
    },
  },
  {
    id: "menstrual_summary",
    label: "Women's health (summary)",
    group: "Women's health",
    description: "Current cycle phase and summary (only for accounts that track a cycle).",
    kind: "snapshot",
    fetch: async (t, today) => single(today, await getJson(t, `/periodichealth-service/menstrualcycle/summary/${today}`)),
  },
];

export const DATASET_BY_ID = new Map(DATASETS.map((d) => [d.id, d]));
