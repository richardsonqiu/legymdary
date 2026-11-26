import Link from "next/link";
import { LandingCta } from "@/components/LandingCta";
import { BarsIcon, DumbbellIcon, ForkIcon, MoonIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

const features = [
  { icon: DumbbellIcon, title: "Train", desc: "Today's session, sets and weights, with progress built in.", image: "barbell" },
  { icon: ForkIcon, title: "Eat", desc: "Snap a meal or describe it. Calories and macros, worked out.", image: "salmon" },
  { icon: MoonIcon, title: "Recover", desc: "Sleep and readiness from your Garmin or Oura.", image: "sleep" },
  { icon: BarsIcon, title: "Progress", desc: "Weight, body fat, records and weekly recaps.", image: "runner" },
] as const;

export default function LandingPage() {
  const googleEnabled = !!process.env.AUTH_GOOGLE_ID;

  return (
    <div className="mx-auto min-h-dvh max-w-5xl">
      <header className="flex items-center justify-between px-5 py-5">
        <span className="wordmark text-xl">one up</span>
        <Link href="/login" className="text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-50">
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="px-4">
        <div
          className="banner-photo editorial-photo relative flex min-h-[62dvh] flex-col justify-end overflow-hidden rounded-[32px] px-6 pb-7 pt-24 sm:min-h-[520px]"
          style={{ ["--banner" as string]: 'url("/editorial/breathing.webp")', ["--banner-pos" as string]: "center 30%" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-paper/75">1% better every day</p>
          <h1 className="mt-3 max-w-md text-[40px] font-semibold leading-[1.04] tracking-tight text-paper sm:text-6xl">
            One more rep.
            <br />
            One better than yesterday.
          </h1>
          <p className="mt-4 max-w-sm text-base text-paper/80">
            Your training, food and recovery in one calm daily view.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <LandingCta googleEnabled={googleEnabled} label={googleEnabled ? "Get started with Google" : "Get started"} className="w-full sm:w-auto" />
            <span className="text-xs text-paper/70">Free · your data stays private</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-3 px-4 py-8 sm:grid-cols-2">
        {features.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="flex items-stretch gap-4 overflow-hidden rounded-3xl border border-zinc-800/70 bg-zinc-900 p-3">
              <div
                className="editorial-photo h-24 w-24 shrink-0 rounded-2xl bg-center"
                style={{ backgroundImage: `url("/editorial/${f.image}.webp")` }}
                aria-hidden
              />
              <div className="min-w-0 py-1">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-teal-300" />
                  <h3 className="font-semibold">{f.title}</h3>
                </div>
                <p className="mt-1 text-sm leading-snug text-zinc-400">{f.desc}</p>
              </div>
            </div>
          );
        })}
      </section>

      <footer className="px-5 pb-10 text-center text-xs text-zinc-500">
        <span className="wordmark text-zinc-300">one up</span>
        <p className="mt-1">One more rep, one better than yesterday.</p>
      </footer>
    </div>
  );
}
