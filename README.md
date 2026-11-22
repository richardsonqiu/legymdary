# LeGYMdary — the Legendary Gym Diary

A mobile-first, full-stack gym & fitness tracker. Sign in with Google, log
workouts, auto-detect personal records, track body stats, and watch your
progress over time — all in a clean, monochrome interface designed for use on
your phone at the gym. Every account gets its own private diary.

## Features

- **Google sign-in, multi-user** — each account has its own private workouts,
  stats and PRs.
- **Workout logger** — start a session, search & add exercises, log sets
  (reps, weight in kg, notes, warmup flag), duplicate your last workout, finish.
- **Exercise library** — 50+ exercises pre-loaded and tagged by muscle group &
  equipment (barbell, dumbbell, machine, bodyweight, cable). Add custom ones.
- **Body stats** — log weight (kg), waist (cm) and body fat (%); latest shown on
  the dashboard.
- **Personal records** — auto-detected per exercise via estimated 1RM
  `weight × (1 + reps / 30)`, with a live PR badge while logging.
- **Progress charts** — per-exercise weight/volume/1RM over 30 / 90 days / all
  time, body-stat line charts with a range selector, and weekly volume.
- **Look** — night-blue theme with soft gradient "sky" backgrounds, translucent
  cards, a row of score rings on Home (Readiness, Sleep, Food, Steps, Week) and a
  large readiness gauge with a plain-language verdict.
- **Navigation**: 5 tabs. **Home** · **Train** (Workout, History, Exercises) ·
  **Food** · **Progress** (Body, Goal, PRs) · **Insights**. Data sources live
  in one place, **Connections** (`/connect`: All, Garmin, Apple, File), reached
  from Home's account menu, the Sources button on Insights, History and the
  Today guide. It also holds InBody, spreadsheet import and CSV export.
- **Spreadsheet import** (Connections → File, `/connect/import`): download an
  Excel template (Workouts sheet: one row per set; Cardio sheet: one row per
  activity; dropdowns for exercises, muscle groups and activity types; an
  Example and a How to fill sheet), fill it in Excel, Google Sheets or Numbers,
  and upload the .xlsx (or CSV). A preview lists workouts, new exercises and
  every skipped row with its reason before anything is saved. Same-date,
  same-name workouts and identical cardio rows are skipped, so re-imports are
  safe, and each import can be undone.
- **Goal and pace**: set a target weight or body fat, then pick Relaxed,
  Balanced or Aggressive (each shows daily calories and the arrival date) or a
  date of your own. Arrival dates count from today using the pace your calories
  really give; a stale weigh-in is flagged.
- **My menu**: tap Add to pick from meals you have eaten before (or create a new one). Tapping a menu item or an Eat again meal asks to confirm and lets you choose the meal slot.
- **Recaps**: week, month and year stories (Progress → Recaps, or the Home banner
  early in a week or month): time moving, your top activity, longest session,
  records, rhythm, food logging, go-to meal, sleep, steps and weight, with share.
- **Consistency calendar** (Train → History) — Week, Month or GitHub-style Year
  grid. Each day is split: top half = exercise (green), bottom half = food
  logged (blue); filter Both / Exercise / Food.
- **Weekly training** (Progress) — gym sessions logged here plus Garmin
  activities, in minutes or sessions per week, and a 90-day breakdown by
  activity type.
- **Streaks & celebrations** — a weekly training streak (3+ active days a week)
  and a daily food-logging streak, with confetti at milestones.
- **Dashboard "Today" guide** — written for beginners: *where you are now* →
  *your target* → *do this today* (auto-ticking action items), plus a
  getting-started checklist and "?" explanations next to jargon.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Auth.js v5](https://authjs.dev) (NextAuth) with the Google provider
- [Tailwind CSS v4](https://tailwindcss.com) — dark monochrome theme
- [Drizzle ORM](https://orm.drizzle.team) on [libSQL](https://github.com/tursodatabase/libsql)
  — a local SQLite file in dev, [Turso](https://turso.tech) in production
- [Recharts](https://recharts.org) for charts
- Server Actions for all mutations (every read & write is scoped to the user)

## Getting started (local)

```bash
# 1. Install dependencies
npm install

# 2. Create your env file
cp .env.example .env

# 3. Set an auth secret (writes AUTH_SECRET into .env)
npx auth secret

# 4. Create the database schema and seed the exercise library
npm run setup        # = db:migrate + db:seed

# 5. Run it
npm run dev          # http://localhost:3000
```

You can sign in two ways:

- **Email & password** — create an account with just an email and password.
  Works everywhere, no Google setup required.
- **Google** — set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (see deploy steps),
  adding `http://localhost:3000/api/auth/callback/google` as a redirect URI.

Optional: after signing in once, `npm run db:seed:demo` fills *your* account
with ~8 weeks of sample workouts and body stats. `npm run db:reset` clears all
logged data (keeps the exercise library).

## Deploy for free (Vercel + Turso + Google OAuth)

1. **Turso database (free):** create one at <https://turso.tech>; grab its
   `libsql://…` URL and an auth token.
2. **Google OAuth:** in the [Google Cloud Console](https://console.cloud.google.com)
   → APIs & Services → Credentials → **Create OAuth client ID** →
   **Web application**. Add the authorized redirect URI
   `https://<your-vercel-domain>/api/auth/callback/google`. Copy the client ID
   and secret.
3. **Deploy:** push to GitHub and import the repo into
   [Vercel](https://vercel.com). Add these **Environment Variables**:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | your Turso `libsql://…` URL |
   | `DATABASE_AUTH_TOKEN` | your Turso token |
   | `AUTH_SECRET` | output of `npx auth secret` |
   | `AUTH_GOOGLE_ID` | Google OAuth client ID |
   | `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
   | `ANTHROPIC_API_KEY` | Anthropic API key (for meal-photo analysis) |

   Deploy. The `vercel-build` script runs the migrations and seeds the exercise
   library into Turso automatically.

> Tip: you won't know the Vercel domain until the first deploy. Deploy once,
> then add `https://<that-domain>/api/auth/callback/google` to the Google OAuth
> client's redirect URIs (and to "Authorized JavaScript origins").

## Scripts

| Script                 | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Start the dev server                                |
| `npm run build`        | Production build                                    |
| `npm run db:generate`  | Generate SQL migrations from the Drizzle schema     |
| `npm run db:migrate`   | Apply migrations to `DATABASE_URL`                  |
| `npm run db:seed`      | Seed the exercise library (idempotent)              |
| `npm run db:seed:demo` | Fill the signed-in account with sample data         |
| `npm run db:reset`     | Clear all workouts + body stats (keeps the library) |
| `npm run setup`        | `db:migrate` + `db:seed`                            |

## Environment variables

| Variable               | Required | Description                                            |
| ---------------------- | -------- | ------------------------------------------------------ |
| `DATABASE_URL`         | yes      | `file:./local.db` locally, or a Turso `libsql://…` URL |
| `DATABASE_AUTH_TOKEN`  | prod     | Turso auth token (leave blank for a local file)        |
| `AUTH_SECRET`          | yes      | Auth.js signing secret (`npx auth secret`)             |
| `AUTH_GOOGLE_ID`       | prod     | Google OAuth client ID                                 |
| `AUTH_GOOGLE_SECRET`   | prod     | Google OAuth client secret                             |
| `ANTHROPIC_API_KEY`    | optional | Enables AI calorie estimates from meal photos          |
| `MEAL_AI_MODEL`        | optional | Primary photo model (default `claude-haiku-5-5`)       |
| `MEAL_AI_BACKUP_MODEL` | optional | Retry model (default `claude-sonnet-5-5`; `""` = off)  |
| `MEAL_AI_EFFORT`       | optional | `low` (default), `medium` or `high`                    |
| `MEAL_AI_DAILY_LIMIT`  | optional | AI photo analyses per user per day (default 60)        |
| `INSIGHTS_AI_MODEL`    | optional | Daily brief model (default `claude-haiku-5-5`)         |
| `INSIGHTS_AI_BACKUP_MODEL` | optional | Brief fallback (default `claude-sonnet-5-5`)       |
| `CRON_SECRET`          | for Garmin | Auth for the daily Garmin sync cron                  |
| `GARMIN_ENCRYPTION_KEY`| optional | Encrypts stored Garmin keys (default: `AUTH_SECRET`)   |

## Project structure

```
app/            Routes: dashboard, log, food, plan, history, stats, prs,
                exercises, login + api/auth (Auth.js), api/export (CSV)
auth.ts         Auth.js instance (Drizzle adapter, Google + dev provider)
auth.config.ts  Edge-safe auth config (used by the proxy gate)
proxy.ts        Route gate — redirects signed-out users to /login
components/     UI, bottom nav, charts, the workout logger, account menu
db/             Drizzle schema, client, migrations + seed scripts
lib/            Queries (reads), actions (mutations), session helper, utils
```

## Food log & goal plan

- **Skip a meal**: tap *Skip breakfast* (or lunch, dinner) when you are not eating it. Its share of the day's
  calories (25 / 35 / 30 / 10 % for breakfast, lunch, dinner, snack) moves to your other meals, so the Food page
  shows a new budget for each remaining meal. A skipped meal counts as logged for streaks and for energy
  analysis (it is a decision, not a gap), and logging food in that slot cancels the skip.
- **Photo plus context**: after you take a photo, add a few words ("kopi kosong, shared the toast")
  before the estimate runs. Nothing is sent to the AI until you tap *Estimate calories*.
- **How much did you eat (or drink)?** A plate that fills as you slide (a glass for drinks, which the
  AI flags per item and typed items are guessed from their name), with words and calories beside it:
  "Half the plate · 273 of 545 kcal", "2½ glasses · 263 kcal (105 per portion)". Slide from 0 to 3× in
  quarter steps, or tap − / + (up to 10×). Works for the whole meal or one item (one cookie in the
  photo but you ate two = 2× on that item), and can be changed after the meal. The full-portion
  numbers are kept, so you can switch from ½× to 2× without losing the original estimate.

- **Food tab** — tap *Snap a meal* to take a photo (or pick one / enter it
  manually). The photo is downscaled in the browser (≤1024px) and sent to
  Claude Haiku 5.5, which returns the items it sees with estimated portions,
  calories and macros. If Haiku refuses or fails, the request is retried once
  on Claude Sonnet 5.5. You can edit every item before saving. A small
  thumbnail is stored with the meal. **Eat again** re-logs a recent meal after a
  quick confirmation, with no AI call.
- **Describe it (no photo)** — the Food tab's *Describe it* button opens the
  same sheet with a "Describe what you ate" box: type what and how much (e.g.
  "1 plate chicken rice, iced milo") and tap *Estimate with AI*. The same model
  fills in the items with its working, assuming a typical serving where you give
  no amount, and you check them before saving. You can still type everything
  yourself. Text estimates share the photo daily limit and are recorded as
  `meal_text` in `ai_usage`.
- **AI cost** — every call's tokens and estimated cost are stored (`ai_usage`)
  and logged as `[meal-ai] model=… in=… out=… cost=$…`; the Food tab shows
  this month's total. Rough cost: ~$0.0005 per photo on Haiku 5.5, ~$0.01 on
  Sonnet 5.5.
- **Plan** — enter sex, birth year, height, activity level and a target weight
  and/or target body-fat %. Current weight and body fat come from your latest
  Stats entries. The plan computes BMR (Katch-McArdle when body fat is known,
  otherwise Mifflin-St Jeor), maintenance calories, a daily calorie target at a
  sustainable pace (default 0.5% of body weight/week to lose, 0.25% to gain;
  capped, with a safe calorie floor), macro targets and an ETA. A body-fat goal
  is turned into a target weight assuming you keep your lean mass. It also
  compares your average intake and 4-week weight trend against the plan.

## Garmin integration

Uses Garmin's free **Connect Personal API** (read-only). Each user creates a
key at Garmin Connect → Settings → Personal API Key and pastes it on the
**Garmin** page (account menu or dashboard). The key is verified, stored
encrypted (AES-256-GCM), exchanged for a 24-hour bearer token as needed, and
never written back to Garmin.

- **Sync** — 30 days on connect; afterwards a background sync after page loads
  when the last sync is over 15 min old (the page then refreshes itself
  a few seconds later with the new data), a daily Vercel Cron (`/api/cron/garmin`, needs
  `CRON_SECRET`), and a "Sync now" button. Pulls daily summaries (calories
  burned, steps, resting HR, stress, Body Battery), sleep, HRV, activities and
  scale weigh-ins.
- **Energy balance** — calories eaten vs Garmin's burn, today and last 7 days.
- **Measured maintenance** — once you have ≥10 fully-logged days and ≥4
  weigh-ins over ≥14 days, maintenance = avg intake − weight trend × 7,700
  kcal/kg; otherwise Garmin's average daily burn (≥5 days); otherwise the
  formula. The Plan's calorie target uses the best available.
- **Eat back extra activity** (opt-in) — adds half of the day's above-average
  active burn to that day's target (max +600).
- **Readiness** — sleep score, HRV status, Body Battery and resting HR vs
  your 7-day baseline → "Ready to push / Train as planned / Take it easy".
- **Weigh-ins** from a Garmin scale fill Stats (source `garmin`); anything you
  type yourself is never overwritten.
- Garmin activities show on History and the Garmin page; CSV export includes
  Garmin daily data. Disconnecting can also delete all imported data.

### All Garmin data (`/garmin/data`)

**Import everything** pulls every Personal API dataset (all 26 endpoints) into
a lossless raw store (`garmin_raw`, one JSON payload per dataset per day /
activity / snapshot):

- **Summaries, 1 year:** daily summaries, sleep, HRV, Body Battery, steps,
  stress, hydration, weigh-ins, activities and wellness sessions.
- **Per-day detail, 30 days–2 years (default 90):** full daily summary,
  detailed sleep, every HRV reading, all-day heart rate, SpO2, the Garmin food
  log and cycle data.
- **Per activity:** full details and structured workout steps (e.g. strength sets).
- **Snapshots:** profile settings, HR zones, fitness age and weight goals.

The import runs in ~40-second resumable steps, skips data an account doesn't
have, and is kept current by the daily cron. The same page offers:

- a raw viewer;
- a **data inventory** (every field's coverage and ranges, identifiers
  redacted);
- a full NDJSON export;
- on-demand `.FIT` downloads at `/api/garmin/fit/<activityId>`.

The analysis design built on top of this lives in
[`docs/analysis-plan.md`](docs/analysis-plan.md).

The Personal API is intended for personal use, not commercial apps serving
many users — see Garmin's FAQ before opening this app to the public.

## Spreadsheet import: how it stays safe

- The file is read in the browser: .xlsx is unzipped with a 40 MB cap per part
  (zip bombs stop early) and its XML is read with small regular expressions, so
  DTDs and entities are refused rather than expanded. Formulas are never run;
  only the saved value is used. Files over 5 MB are refused.
- Every text value is cleaned (control, zero-width and bidi characters removed,
  length capped) and every number range-checked, in the browser and again on
  the server with a strict zod schema (unknown keys, wrong types, impossible
  dates and oversized batches are rejected).
- All writes use Drizzle's parameterised queries; nothing from the file is ever
  joined into SQL. React escapes names on screen, and CSV export neutralises
  cells starting with `=`, `+`, `-` or `@`.
- Imports are rate limited (20 an hour), expire after an hour, and may add at
  most 100 new exercises. Cardio rows get ids `sheet-<hash>` in the watch
  activity tables; disconnecting Garmin or removing Apple data leaves them.

## Apple Health (Apple Watch, no Garmin)

People with an Apple Watch upload their Health export instead of connecting
Garmin: **Connections → Apple** (`/apple-health`).

- **Getting the file.** iPhone Health app → profile picture → *Export All Health
  Data* → save `export.zip` → pick it on the page (the zip or an unzipped
  `export.xml` both work).
- **Parsed in the browser.** Exports are often 1 GB+, far over Vercel's request
  limit, so `lib/apple-health/read-file.ts` streams `export.xml` straight out of
  the zip (central directory + `DecompressionStream`) and
  `lib/apple-health/parse.ts` reduces it to daily rows, nights, workouts and
  weigh-ins (about 1 s per 200 MB). Only that summary is uploaded, in batches
  of 300, through server actions. Raw samples, routes and clinical records
  never leave the device.
- **Where it goes.** The same tables Garmin fills, so Home, Insights, Food,
  Plan, History and Recaps work unchanged: `garmin_daily` (source `apple`),
  `garmin_raw` sleep summaries and activities in Garmin's field names (keys
  `apple-…`), `garmin_activities` (ids `apple-YYYYMMDD-HHMMSS`) and
  `body_stats` (source `apple`). `apple_health_imports` records the last upload.
- **Merging.** Per day the largest single-source total is used (iPhone and
  Watch both count steps), and Apple's Activity rings win for active calories
  and exercise minutes. Nights are dated by the morning you wake; Core/Deep/REM
  map to light/deep/REM.
- **Precedence.** Garmin data, manual weigh-ins and InBody scans always win;
  re-uploading is idempotent. *Remove Apple Health data* deletes only what an
  upload added, and disconnecting Garmin no longer deletes Apple data.
- **Not available from Apple:** Body Battery, stress and a sleep score. HRV is
  SDNN, so it is compared only with your own baseline.

## Body composition (InBody)

Stats → **Body composition** stores InBody (or similar BIA) scans:

- **Adding scans.** Upload screenshots of the InBody app's Detail and/or
  History screens (a History screen yields every past date). Very tall
  screenshots are cut into readable tiles, Claude Haiku 5.5 (Sonnet 5.5 backup)
  reads the numbers, and you review/edit before saving. Manual entry works too.
- **What's stored.** Weight, skeletal muscle, fat mass, body fat %, BMI,
  visceral fat, waist-hip ratio, water, protein, mineral, BMR, SMI, score,
  segmental lean/fat (kg and % of ideal), body type and balance.
- **What you see.** Change vs the previous scan with a verdict (e.g. "lost
  muscle and gained fat"), segmental balance advice (e.g. legs behind arms),
  trends, and the weight at your target body fat if you keep your lean mass.
- **Effect on the plan.** Each scan's weight and body fat feed body stats.
  For body fat, the plan prefers a manual entry or a scan from the last 60
  days over smart-scale estimates. The plan shows InBody's measured BMR, and
  Insights/the daily brief use the latest scan.

## Insights (daily analysis)

**Morning sleep summary**: as soon as your watch syncs, Home shows last night (time asleep, % of your need,
score, stage bar) and Insights has the full report: stages against typical ranges (deep 13 to 23 %, REM 20 to 25 %),
efficiency, time awake, bedtime vs your usual, overnight HRV and heart rate, Garmin's own ratings of each part of
the score, what helped and what hurt, one next step, and the last 7 nights. It is rule based, so it costs nothing.

**Body Battery** (Garmin's 0 to 100 energy meter) is part of the analysis: the level at wake is a readiness
signal (weighted with HRV, resting heart rate and sleep, compared with your own usual), the Insights page has a
Body Battery card (wake level, charged overnight, drained yesterday, last 7 mornings) and a trend line, the home
screen has a Battery ring, the daily brief gets it, and it appears in warnings (low wake level, poor recharge
after a long sleep, fully drained yesterday) and in your personal patterns (stress, training and alcohol vs the
next morning's level).

The **Insights** tab analyses each day against your own baseline (method:
[`docs/analysis-plan.md`](docs/analysis-plan.md); code: `lib/analysis/`).

- **Readiness 0–100** — HRV, resting HR, sleep, sleep balance, load balance
  and breathing/SpO2, each scored vs your 28-day baseline, with weights shown.
- **Sleep** — performance vs Garmin's sleep need, 7-day sleep debt, bedtime
  consistency, stages.
- **Training** — strain (0–21) and acute:chronic load ratio, from Garmin
  activity load and your logged strength volume.
- **Fuel** — eaten vs burned and protein vs target.
- **Patterns** — personal associations (late meals → sleep, alcohol → HRV…)
  once there's enough history.
- **Coach's brief + questions** — numbers are computed in code; Claude Haiku
  5.5 (Sonnet 5.5 backup) writes the narrative from a compact day card,
  about $0.0005 per report. A brief is written automatically each morning by
  the cron once the night has synced.

Garmin's rate limits pause the full import (honouring `Retry-After`); it then
resumes automatically in the background and via the daily cron.

## Training extras

- **Rest timer** — starts automatically when you log a set; pick 1:00–3:00,
  ±15s, vibrates and beeps when done, survives a page refresh.
- **Templates** — "Save as template" during a workout stores its exercises and
  working-set counts; start a new session from a template on the Log tab.
- **Weekly check-in** (dashboard) — workouts, sets and volume vs last week,
  average calories/protein and days on target, and 7-day weight change.
- **CSV export** — account menu → export workouts, food log or body stats.

## Activity details

Tap any Garmin activity (History, Insights) to open `/activities/[id]`, built
from data already imported: time, distance, pace/speed, heart rate and zones,
training effect in plain words, training load, Body Battery impact, intensity
minutes, splits, cadence/power/running dynamics, strength sets and a .FIT
download.

## Security

- **Dependencies** — Next.js 16.4.6, next-auth 5.0.0-beta.32 and
  @auth/drizzle-adapter 1.11.3 patch the critical/high advisories (proxy
  bypass, Server Actions DoS, Auth.js fail-open). `npm audit --omit=dev` is
  clean; remaining moderate findings are in dev-only tooling (ESLint,
  drizzle-kit).
- **Auth** — every server action and query re-checks the session (the proxy is
  only a first gate); all data is scoped to the signed-in user. Passwords use
  scrypt with constant-time comparison; email/password length is capped.
- **Rate limits** (database-backed, so they hold on serverless) — sign-in: 10
  per account and 30 per IP per 15 min; sign-up: 5 per IP per hour; AI photo
  analysis: 8/min and `MEAL_AI_DAILY_LIMIT` (default 60)/day per user; Garmin
  connect 10/hour, sync 20/hour.
- **Headers** — CSP (no third-party scripts, no framing, no plugins),
  `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, restrictive
  Permissions-Policy, COOP, and HSTS on Vercel. `X-Powered-By` removed.
- **Secrets** — Garmin keys/tokens AES-256-GCM encrypted at rest; the cron
  endpoint compares `CRON_SECRET` in constant time; API responses are
  `no-store`; CSV exports are guarded against formula injection.
- **Input validation** — dates, numeric ranges, text lengths and image data
  URLs are validated server-side on every write.

## Install as an app

Open the site on your phone → Share → **Add to Home Screen** (iOS) or the
install prompt (Android). It launches full-screen with shortcuts for "Snap a
meal" and "Log workout".

## Performance

- **Tabs feel instant.** The bottom nav prefetches each tab with its data, and
  just-visited tabs are reused for 30 s (`experimental.staleTimes`). Any save
  through a server action invalidates this cache.
- **Few round trips.** Pages start all their independent queries at once, and
  shared lookups are cached per request. Background Garmin work runs after
  the response (`after()`).
- **Small payloads.** Insights pulls only the ~40 Garmin fields it needs via
  SQLite `json_extract`. Meal photos are served from `/api/meal-photo/<id>`
  (private, immutable cache) instead of being embedded in pages.
- **Co-locate the database.** Every query is a network round trip to Turso, so
  keep the Turso database in, or next to, the Vercel function region
  (`vercel.json` → `regions`).
- **Diagnose locally.** `DB_TRACE=1` logs every query, and
  `DB_SIMULATE_LATENCY_MS=60` adds a delay per round trip to mimic a remote
  database and expose waterfalls.

## Notes

- The estimated 1RM uses the Epley formula `weight × (1 + reps / 30)`; warmup
  sets are excluded from PRs and volume.
- Streaks count consecutive calendar days with at least one logged set (today's
  rest day won't break a streak until you actually miss a day).
- Weights are in kilograms throughout.
