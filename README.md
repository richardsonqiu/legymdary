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

You can sign in two ways locally:

- **Google** — set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (see deploy steps),
  adding `http://localhost:3000/api/auth/callback/google` as a redirect URI.
- **Dev email login** — available automatically in development (no Google
  needed). Enter any email to create/sign in to a test account. Disabled in
  production.

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

## Project structure

```
app/            Routes: dashboard, log, history, stats, prs, exercises, login
                + api/auth (Auth.js)
auth.ts         Auth.js instance (Drizzle adapter, Google + dev provider)
auth.config.ts  Edge-safe auth config (used by the proxy gate)
proxy.ts        Route gate — redirects signed-out users to /login
components/     UI, bottom nav, charts, the workout logger, account menu
db/             Drizzle schema, client, migrations + seed scripts
lib/            Queries (reads), actions (mutations), session helper, utils
```

## Notes

- The estimated 1RM uses the Epley formula `weight × (1 + reps / 30)`; warmup
  sets are excluded from PRs and volume.
- Streaks count consecutive calendar days with at least one logged set (today's
  rest day won't break a streak until you actually miss a day).
- Weights are in kilograms throughout.
