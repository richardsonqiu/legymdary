/**
 * Minimal client for Garmin Connect's Personal API (read-only).
 * Spec: https://developer.garmin.com/gc-developer-program/personal/
 *
 * Auth: POST the user's personal API key to the token endpoint with
 * `Authorization: ApiKey <key>`; the body is a JWT bearer token valid for 24h
 * (no refresh tokens — just exchange the key again).
 */

const BASE = process.env.GARMIN_API_BASE || "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";

export class GarminError extends Error {
  constructor(
    message: string,
    public status: number,
    public path: string,
  ) {
    super(message);
  }
  /** The key/token was rejected — the user needs to create a new key. */
  get isAuth() {
    return this.status === 401 || this.status === 403;
  }
}

function jwtExpiry(token: string): Date {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    if (typeof payload.exp === "number") return new Date(payload.exp * 1000);
  } catch {
    /* not a JWT we can read */
  }
  return new Date(Date.now() + 23 * 3600 * 1000); // documented 24h lifetime
}

export async function exchangeKey(apiKey: string): Promise<{ token: string; expiresAt: Date }> {
  const res = await fetch(BASE + TOKEN_PATH, {
    method: "POST",
    headers: { Accept: "*/*", Authorization: `ApiKey ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new GarminError(
      res.status === 401 || res.status === 403
        ? "Garmin rejected this API key. It may be expired, deleted or mistyped."
        : `Garmin token request failed (${res.status}).`,
      res.status,
      TOKEN_PATH,
    );
  }
  const token = (await res.text()).trim();
  if (!token) throw new GarminError("Garmin returned an empty token.", 502, TOKEN_PATH);
  return { token, expiresAt: jwtExpiry(token) };
}

async function get<T>(token: string, path: string, query?: Record<string, string | number>): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new GarminError(`Garmin ${path} failed (${res.status}).`, res.status, path);
  if (res.status === 204) return null as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ---- Response shapes (only the fields we use; all optional by design) ---- */

export type DailySummaryV2 = {
  calendarDate?: string;
  movement?: { steps?: { value?: number | null } | null } | null;
  calories?: {
    burnedResting?: number | null;
    burnedActive?: number | null;
    burnedTotal?: number | null;
    consumedValue?: number | null;
  } | null;
  heartRate?: { restingValue?: number | null } | null;
  intensityMinutes?: { moderate?: number | null; vigorous?: number | null } | null;
  stress?: { avgLevel?: number | null } | null;
  bodyBattery?: {
    minValue?: number | null;
    maxValue?: number | null;
    chargedValue?: number | null;
    drainedValue?: number | null;
  } | null;
};

export type SleepSummary = {
  calendarDate?: string;
  sleepTimeSeconds?: number | null;
  sleepScores?: Record<string, { value?: number | null } | null> | null;
};

export type HrvSummary = {
  calendarDate?: string;
  lastNightAvg?: number | null;
  weeklyAvg?: number | null;
  status?: string | null;
};

export type ActivitySummary = {
  activityId?: number | string;
  activityName?: string | null;
  startTimeLocal?: string | null;
  activityType?: { typeKey?: string | null } | null;
  duration?: number | null;
  calories?: number | null;
  averageHR?: number | null;
  distance?: number | null;
  activityTrainingLoad?: number | null;
};

export type WeightSummary = {
  summaryDate?: string;
  latestWeight?: { weight?: number | null; bodyFat?: number | null } | null;
};

/* ---- Endpoints ---- */

/** Up to 1 year per request. */
export async function dailySummaries(token: string, start: string, end: string) {
  const r = await get<{ data?: DailySummaryV2[] } | DailySummaryV2[]>(
    token,
    "/usersummary-service/v2/dailysummaries",
    { startDate: start, endDate: end },
  );
  return Array.isArray(r) ? r : (r?.data ?? []);
}

/** Up to 31 days per request. */
export async function sleepSummaries(token: string, start: string, end: string) {
  return (await get<SleepSummary[]>(token, "/sleep-service/sleep/dailySleepSummariesByDate", {
    startDate: start,
    endDate: end,
  })) ?? [];
}

export async function hrvDaily(token: string, start: string, end: string) {
  const r = await get<{ hrvSummaries?: HrvSummary[] }>(token, `/hrv-service/hrv/daily/${start}/${end}`);
  return r?.hrvSummaries ?? [];
}

export async function activities(token: string, start: string, end: string) {
  const out: ActivitySummary[] = [];
  for (let offset = 0; offset < 1000; offset += 99) {
    const page =
      (await get<ActivitySummary[]>(token, "/activitylist-service/activities/search/activities", {
        start: offset,
        limit: 99,
        startDate: start,
        endDate: end,
      })) ?? [];
    out.push(...page);
    if (page.length < 99) break;
  }
  return out;
}

export async function weights(token: string, start: string, end: string) {
  const r = await get<{ dailyWeightSummaries?: WeightSummary[] }>(
    token,
    `/weight-service/weight/range/${start}/${end}`,
  );
  return r?.dailyWeightSummaries ?? [];
}
