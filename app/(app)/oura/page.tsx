import { PageTransition } from "@/components/PageTransition";
import { GarminActivityList } from "@/components/garmin/GarminActivityList";
import { OuraConnect } from "@/components/oura/OuraConnect";
import { OuraExtrasCard } from "@/components/oura/OuraExtrasCard";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { ouraConfigured } from "@/lib/oura/client";
import { getGarminActivities, getOuraExtras, getOuraStatus } from "@/lib/queries";
import { userToday } from "@/lib/session";
import { sourceOfKey, addDaysStr } from "@legymdary/shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Oura" };

export default async function OuraPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const flash = sp.connected === "1" ? "connected" : typeof sp.error === "string" ? sp.error.slice(0, 20) : null;
  const today = await userToday();
  const [status, extras, activities] = await Promise.all([
    getOuraStatus(),
    getOuraExtras(addDaysStr(today, -14), today),
    getGarminActivities(addDaysStr(today, -30), addDaysStr(today, 1), { all: true }),
  ]);
  const latest = [...extras].reverse().find((e) => e.readinessScore != null || e.temperatureDeviation != null) ?? null;
  const readinessVals = extras.map((e) => e.readinessScore).filter((v): v is number => v != null);
  const usual = readinessVals.length >= 4 ? Math.round(readinessVals.reduce((a, b) => a + b, 0) / readinessVals.length) : null;
  const ouraActs = activities.filter((a) => sourceOfKey(a.activityId) === "oura");

  return (
    <PageTransition className="space-y-7">
      <PageHeader title="Oura" subtitle="Sleep, readiness and recovery from your ring" />
      <OuraConnect status={status} configured={ouraConfigured()} flash={flash} />

      {status && latest && (
        <section>
          <SectionTitle>Latest from your ring</SectionTitle>
          <OuraExtrasCard day={latest} usual={{ readiness: usual }} />
        </section>
      )}

      <section>
        <SectionTitle>What it brings in</SectionTitle>
        <Card className="space-y-2 text-sm text-zinc-400">
          <p>
            <b className="text-zinc-200">Sleep:</b> time asleep, deep, REM and light sleep, bedtime, sleep score, overnight heart
            rate, HRV and breathing. Used for the morning sleep report and readiness.
          </p>
          <p>
            <b className="text-zinc-200">Recovery:</b> HRV and resting heart rate (Oura&apos;s lowest overnight heart rate).
          </p>
          <p>
            <b className="text-zinc-200">Daily activity:</b> steps and calories burned, and workouts Oura recorded or detected.
          </p>
          <p>
            <b className="text-zinc-200">Oura only:</b> readiness score, body temperature change, blood oxygen, daytime stress,
            resilience, VO2 max and cardiovascular age (when your ring and plan provide them).
          </p>
          <p className="text-xs text-zinc-500">
            Also wear a Garmin? In Connections choose which device to use for sleep, recovery, daily activity and workouts.
          </p>
        </Card>
      </section>

      {status && ouraActs.length > 0 && (
        <section>
          <SectionTitle>Recent Oura workouts</SectionTitle>
          <GarminActivityList activities={ouraActs.slice(0, 15)} />
        </section>
      )}
    </PageTransition>
  );
}
