import { userToday } from "@/lib/session";
import { PageTransition } from "@/components/PageTransition";
import { AppleHealthImport } from "@/components/apple-health/AppleHealthImport";
import { GarminActivityList } from "@/components/garmin/GarminActivityList";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { getAppleHealthStatus, getGarminActivities, getGarminStatus } from "@/lib/queries";
import { addDaysStr } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apple Health" };

export default async function AppleHealthPage() {
  const [status, garmin] = await Promise.all([getAppleHealthStatus(), getGarminStatus()]);
  const to = status?.lastDate ?? (await userToday());
  const activities = status
    ? (await getGarminActivities(addDaysStr(to, -90), addDaysStr(to, 1), { all: true })).filter((a) => a.activityId.startsWith("apple-"))
    : [];

  return (
    <PageTransition className="space-y-7">
      <PageHeader title="Apple Health" subtitle="Use your Apple Watch data: sleep, recovery and workouts" />
      <AppleHealthImport status={status} garminConnected={!!garmin} />

      <section>
        <SectionTitle>What it brings in</SectionTitle>
        <Card className="space-y-2 text-sm text-zinc-400">
          <p>
            <b className="text-zinc-200">Every day:</b> steps, active and resting calories (so Food shows eaten vs
            burned and Plan can use your real burn), exercise minutes, resting heart rate and HRV.
          </p>
          <p>
            <b className="text-zinc-200">Sleep:</b> time asleep, deep / core / REM stages, bedtime, wake-ups, and
            heart rate, breathing and blood oxygen overnight, for the morning sleep report and readiness.
          </p>
          <p>
            <b className="text-zinc-200">Workouts:</b> type, duration, calories, distance, heart rate and zones. They
            appear in History, Recaps and training load.
          </p>
          <p>
            <b className="text-zinc-200">Weigh-ins:</b> weight and body fat from the Health app or a smart scale. Anything
            you typed in Progress is never overwritten.
          </p>
          <p className="text-xs text-zinc-500">
            Apple doesn&apos;t measure Body Battery or stress, so those cards stay empty. Apple&apos;s HRV (SDNN) reads
            differently from Garmin&apos;s, so it is only compared with your own usual.
          </p>
        </Card>
      </section>

      {status && (
        <section>
          <SectionTitle>Recent Apple workouts</SectionTitle>
          <GarminActivityList activities={activities.slice(0, 15)} />
        </section>
      )}
    </PageTransition>
  );
}
