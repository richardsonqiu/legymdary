# LeGYMdary — the Legendary Gym Diary

A mobile-first, full-stack gym & fitness tracker. Log workouts, auto-detect
personal records, track body stats, and watch your progress over time — all in a
clean, monochrome interface designed for use on your phone at the gym.

## Features

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
- **History calendar** — monthly view with workout days highlighted, tap a day
  for its session, plus current & longest streak counters.
- **Dashboard** — today's date, current streak, last workout, latest body stats,
  and PRs hit this week.
- **Optional password gate** — protect your data behind a single password.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com) — dark monochrome theme
- [Drizzle ORM](https://orm.drizzle.team) on [libSQL](https://github.com/tursodatabase/libsql)
  — a local SQLite file in dev, [Turso](https://turso.tech) in production
- [Recharts](https://recharts.org) for charts
- Server Actions for all mutations

## Getting started (local)

```bash
# 1. Install dependencies
npm install

# 2. Create your env file (defaults to a local SQLite file)
cp .env.example .env

# 3. Create the database schema and seed the exercise library
npm run setup        # = db:migrate + db:seed

# 4. Run it
npm run dev          # http://localhost:3000
```

Optional: `npm run db:seed:demo` loads ~8 weeks of sample workouts and body
stats so you can explore the charts, calendar and PRs. **It replaces existing
workouts + body stats** (the exercise library is kept). When you're ready to log
for real, `npm run db:reset` clears everything except the library.

## Deploy for free (Vercel + Turso)

Both tiers used here are free.

1. **Create a Turso database** at <https://turso.tech> and grab its database URL
   (`libsql://…`) and an auth token (Turso CLI: `turso db tokens create <db>`).
2. **Push to GitHub** and import the repo into [Vercel](https://vercel.com).
3. In Vercel → Project → **Settings → Environment Variables**, add:
   - `DATABASE_URL` = your `libsql://…` URL
   - `DATABASE_AUTH_TOKEN` = your Turso token
   - `APP_PASSWORD` = a password (recommended, protects your health data)
4. **Deploy.** The `vercel-build` script runs the migrations and seeds the
   exercise library against Turso automatically, then builds the app.

> The same migrations run in dev and prod (one libSQL driver), so what you test
> locally is what ships. To migrate/seed Turso from your machine instead, put
> the Turso credentials in `.env` and run `npm run setup`.

## Scripts

| Script                 | What it does                                        |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Start the dev server                                |
| `npm run build`        | Production build                                    |
| `npm run db:generate`  | Generate SQL migrations from the Drizzle schema     |
| `npm run db:migrate`   | Apply migrations to `DATABASE_URL`                  |
| `npm run db:seed`      | Seed the exercise library (idempotent)              |
| `npm run db:seed:demo` | Load sample data (replaces workouts + body stats)   |
| `npm run db:reset`     | Clear all workouts + body stats (keeps the library) |
| `npm run setup`        | `db:migrate` + `db:seed`                            |

## Environment variables

| Variable               | Required | Description                                            |
| ---------------------- | -------- | ------------------------------------------------------ |
| `DATABASE_URL`         | yes      | `file:./local.db` locally, or a Turso `libsql://…` URL |
| `DATABASE_AUTH_TOKEN`  | prod     | Turso auth token (leave blank for a local file)        |
| `APP_PASSWORD`         | no       | Enables the login gate when set; blank = open access   |

## Project structure

```
app/            Routes: dashboard, log, history, stats, prs, exercises, login
components/     UI, bottom nav, charts, and the workout logger
db/             Drizzle schema, client, migrations + seed scripts
lib/            Queries (reads), actions (mutations), domain utils, auth
middleware.ts   Optional password gate
```

## Notes

- The estimated 1RM uses the Epley formula `weight × (1 + reps / 30)`; warmup
  sets are excluded from PRs and volume.
- Streaks count consecutive calendar days with at least one logged set (today's
  rest day won't break a streak until you actually miss a day).
- Weights are in kilograms throughout.
