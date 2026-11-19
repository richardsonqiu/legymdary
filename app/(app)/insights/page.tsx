import Link from "next/link";
import { PageTransition } from "@/components/PageTransition";
import { GarminAttribution } from "@/components/garmin/GarminAttribution";
import { AiBrief } from "@/components/insights/AiBrief";
import { SleepSummaryCard } from "@/components/insights/SleepSummaryCard";
import {
  BodyBatteryCard,
  BodyCompositionCard,
  PatternsAndFlags,
  ReadinessHero,
  SleepRecoveryCard,
  YesterdayCard,
} from "@/components/insights/InsightsCards";
import { TrendChart } from "@/components/insights/TrendChart";
import { ChevronLeftIcon, ChevronRightIcon, WatchIcon } from "@/components/icons";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { getStoredReport } from "@/lib/analysis/report";
import { buildAnalysis, latestDataDate } from "@/lib/analysis/service";
import { AutoRefresh } from "@/components/AutoRefresh";
import { scheduleGarminSync } from "@/lib/garmin/background";
import { getAppleHealthStatus, getGarminStatus } from "@/lib/queries";
import { requireUserId, userToday } from "@/lib/session";
import { addDaysStr, formatPretty } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const userId = await requireUserId();
  const sp = await searchParams;
  const [garmin, apple, latest] = await Promise.all([
    getGarminStatus(),
    getAppleHealthStatus(),
    latestDataDate(userId),
  ]);
  const date = typeof sp.date === "string" && DATE_RE.test(sp.date) ? sp.date : latest;

  const [{ card, series }, stored] = await Promise.all([
    buildAnalysis(userId, date),
    getStoredReport(userId, date),
  ]);
  const isLatest = date >= latest;
  const garminSyncing = scheduleGarminSync(userId, garmin);

  return (
    <PageTransition className="space-y-6">
      {garminSyncing && <AutoRefresh />}
      <PageHeader title="Insights" subtitle="Recovery, sleep and training, compared with your usual" />

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/insights?date=${addDaysStr(date, -1)}`}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-800"
          aria-label="Previous day"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <div className="text-center">
          <div className="text-sm font-medium">{formatPretty(date)}</div>
          {!isLatest && (
            <Link href="/insights" className="text-xs text-zinc-500">
              Back to latest
            </Link>
          )}
        </div>
        {isLatest ? (
          <span className="h-10 w-10" />
        ) : (
          <Link
            href={`/insights?date=${addDaysStr(date, 1)}`}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 hover:bg-zinc-800"
            aria-label="Next day"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </Link>
        )}
      </div>

      {!garmin && !apple && (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-zinc-700 px-4 py-3 text-sm text-zinc-300">
          <WatchIcon className="h-5 w-5 shrink-0 text-zinc-500" />
          <span>
            <Link href="/garmin" className="underline">Connect Garmin</Link> or{" "}
            <Link href="/apple-health" className="underline">import Apple Health</Link> to unlock readiness, sleep
            and recovery insights.
          </span>
        </div>
      )}
      {!garmin && apple && isLatest && apple.lastDate && apple.lastDate < addDaysStr(await userToday(), -1) && (
        <Link
          href="/apple-health"
          className="flex items-center gap-3 rounded-2xl border border-dashed border-zinc-700 px-4 py-3 text-sm text-zinc-300"
        >
          <WatchIcon className="h-5 w-5 shrink-0 text-zinc-500" />
          <span>
            Apple Health data runs to {formatPretty(apple.lastDate)}. Upload a new export to bring it up to date.
          </span>
        </Link>
      )}

      <section>
        <SectionTitle help="readiness">Readiness</SectionTitle>
        <ReadinessHero r={card.readiness} />
      </section>

      <section>
        <SectionTitle>Coach&apos;s brief</SectionTitle>
        <AiBrief
          key={date}
          date={date}
          aiReady={!!process.env.ANTHROPIC_API_KEY}
          initial={stored ? { ...stored, createdAt: stored.createdAt.toISOString() } : null}
        />
      </section>

      <section>
        <SectionTitle help="sleep">Last night</SectionTitle>
        {card.sleep ? <SleepSummaryCard s={card.sleep} /> : <SleepRecoveryCard card={card} />}
      </section>

      {card.bodyBattery && (
        <section>
          <SectionTitle help="bodyBattery">Body Battery</SectionTitle>
          <BodyBatteryCard card={card} />
        </section>
      )}

      <section>
        <SectionTitle help="strain">Yesterday</SectionTitle>
        <YesterdayCard card={card} />
      </section>

      {card.bodyComposition && (
        <section>
          <SectionTitle help="bodyComp"
            action={
              <Link href="/stats" className="text-xs text-zinc-400">
                Scans →
              </Link>
            }
          >Body composition
          </SectionTitle>
          <BodyCompositionCard card={card} />
        </section>
      )}

      <PatternsAndFlags card={card} />

      <section>
        <SectionTitle help="hrv">30-day trends</SectionTitle>
        <Card>
          <TrendChart series={series} />
        </Card>
      </section>

      <p className="text-center text-[11px] text-zinc-600">
        Based on {card.coverage.sleepDays} nights of sleep, {card.coverage.hrvDays} of HRV and{" "}
        {card.coverage.loggedDays} fully-logged food days in the last 4 months.{" "}
        <Link href={garmin ? "/garmin/data" : "/apple-health"} className="underline">
          Data coverage
        </Link>
      </p>
      {garmin && <GarminAttribution className="text-center" />}
    </PageTransition>
  );
}
