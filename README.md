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
- **History calendar + consistency heatmap** — a month view with workout days
  highlighted, a GitHub-style year heatmap, and current & longest streaks.
- **Dashboard** — today's date, current streak, last workout, latest body stats,
  and PRs hit this week.

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

- **Food tab** — tap *Snap a meal* to take a photo (or pick one / enter it
  manually). The photo is downscaled in the browser (≤1024px) and sent to
  Claude Haiku 5.5, which returns the items it sees with estimated portions,
  calories and macros. If Haiku refuses or fails, the request is retried once
  on Claude Sonnet 5.5. You can edit every item before saving. A small
  thumbnail is stored with the meal. **Eat again** re-logs a recent meal in
  one tap with no AI call.
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

## Training extras

- **Rest timer** — starts automatically when you log a set; pick 1:00–3:00,
  ±15s, vibrates and beeps when done, survives a page refresh.
- **Templates** — "Save as template" during a workout stores its exercises and
  working-set counts; start a new session from a template on the Log tab.
- **Weekly check-in** (dashboard) — workouts, sets and volume vs last week,
  average calories/protein and days on target, and 7-day weight change.
- **CSV export** — account menu → export workouts, food log or body stats.

## Notes

- The estimated 1RM uses the Epley formula `weight × (1 + reps / 30)`; warmup
  sets are excluded from PRs and volume.
- Streaks count consecutive calendar days with at least one logged set (today's
  rest day won't break a streak until you actually miss a day).
- Weights are in kilograms throughout.
