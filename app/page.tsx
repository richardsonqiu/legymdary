import Link from "next/link";
import { LandingCta } from "@/components/LandingCta";
import {
  BarsIcon,
  CalendarIcon,
  DumbbellIcon,
  FlameIcon,
  ScaleIcon,
  SearchIcon,
  TrophyIcon,
} from "@/components/icons";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: DumbbellIcon,
    title: "Quick workout log",
    desc: "Add exercises and log sets, reps and weight in seconds.",
  },
  {
    icon: TrophyIcon,
    title: "Food by photo",
    desc: "Snap a meal and get calories, protein, carbs and fat, with the working shown.",
  },
  {
    icon: BarsIcon,
    title: "Progress charts",
    desc: "Weight, body fat, training time and personal records over time.",
  },
  {
    icon: CalendarIcon,
    title: "Calendar and streaks",
    desc: "See which days you trained and logged food, by week, month or year.",
  },
  {
    icon: ScaleIcon,
    title: "Body scans",
    desc: "Add an InBody scan from a screenshot and see muscle and fat by body part.",
  },
  {
    icon: SearchIcon,
    title: "Garmin recovery",
    desc: "Connect your watch for a daily readiness score from your sleep and heart rate.",
  },
];

export default function LandingPage() {
  const googleEnabled = !!process.env.AUTH_GOOGLE_ID;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="text-sm font-semibold uppercase tracking-[0.2em]">
          LeGYMdary
        </span>
        <Link
          href="/login"
          className="text-sm text-zinc-300 transition-colors hover:text-white"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-3xl px-5 pb-16 pt-10 text-center sm:pt-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
          The Legendary Gym Diary
        </p>
        <h1 className="mx-auto mt-4 max-w-2xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
          Track every rep.
          <br />
          Beat every record.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-400">
          Log workouts, food and recovery in one private diary built for your
          phone.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <LandingCta
            googleEnabled={googleEnabled}
            className="w-full max-w-xs"
          />
          <p className="text-xs text-zinc-500">
            Free · your data stays private to your account
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-5 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100/10 text-zinc-100">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-3 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  {f.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-3xl px-5 pb-24 text-center">
        <div className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-10">
          <FlameIcon className="mx-auto h-8 w-8 text-zinc-300" />
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            Start your gym diary today
          </h2>
          <p className="mx-auto mt-2 max-w-md text-zinc-400">
            Sign in and log your first workout in under a minute.
          </p>
          <div className="mt-6 flex justify-center">
            <LandingCta
              googleEnabled={googleEnabled}
              label="Get started"
              className="w-full max-w-xs"
            />
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-5 pb-10 text-center text-xs text-zinc-600">
        LeGYMdary · the Legendary Gym Diary
      </footer>
    </div>
  );
}
