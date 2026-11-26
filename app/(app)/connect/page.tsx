import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { PageTransition } from "@/components/PageTransition";
import { SourcePrefsCard } from "@/components/connect/SourcePrefsCard";
import type { Device } from "@/lib/sources-shared";
import { AppleIcon, ChevronRightIcon, DownloadIcon, ScaleIcon, SheetIcon, WatchIcon, RingIcon } from "@/components/icons";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { getAppleHealthStatus, getGarminStatus, getSheetImports, getOuraStatus, getSourcePrefs } from "@/lib/queries";
import { cn, formatPretty } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connections" };

function Row({
  href,
  icon,
  title,
  status,
  on,
  note,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  status: string;
  on?: boolean;
  note?: string;
}) {
  return (
    <Link
      href={href}
      transitionTypes={["nav-forward"]}
      className="press flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 hover:bg-white/[0.06]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800/80 text-zinc-200">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
          {on !== undefined && <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", on ? "bg-emerald-400" : "bg-zinc-600")} />}
          <span className="truncate">{status}</span>
        </span>
        {note && <span className="mt-0.5 block text-xs text-zinc-500">{note}</span>}
      </span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-zinc-600" />
    </Link>
  );
}

const EXPORTS = [
  ["workouts", "Workouts and sets"],
  ["meals", "Food log"],
  ["body", "Body stats"],
  ["garmin", "Watch daily data"],
] as const;

export default async function ConnectPage() {
  const [garmin, apple, oura, imports, prefs] = await Promise.all([
    getGarminStatus(),
    getAppleHealthStatus(),
    getOuraStatus(),
    getSheetImports(),
    getSourcePrefs(),
  ]);
  const devices: Device[] = [garmin ? "garmin" : null, oura ? "oura" : null, apple ? "apple" : null].filter((d): d is Device => !!d);
  const garminOn = !!garmin && garmin.status !== "error";
  const lastImport = imports[0];

  return (
    <PageTransition className="space-y-7">
      <PageHeader image="wall" title="Connections" subtitle="Bring in data from your watch, ring, scale or a spreadsheet" />

      <section>
        <SectionTitle>Watch and ring</SectionTitle>
        <div className="space-y-2">
          <Row
            href="/garmin"
            icon={<WatchIcon className="h-5 w-5" />}
            title="Garmin"
            on={garminOn}
            status={
              garmin
                ? garmin.lastError
                  ? "Connected, last sync had a problem"
                  : garmin.lastSyncAt
                    ? `Connected · synced ${formatDistanceToNow(garmin.lastSyncAt, { addSuffix: true })}`
                    : "Connected"
                : "Not connected"
            }
            note={garmin ? undefined : "Syncs calories burned, sleep, recovery and activities on its own"}
          />
          <Row
            href="/oura"
            icon={<RingIcon className="h-5 w-5" />}
            title="Oura Ring"
            on={!!oura && oura.status !== "error"}
            status={
              oura
                ? oura.status === "error"
                  ? "Needs attention: connect again"
                  : oura.lastSyncAt
                    ? `Connected · synced ${formatDistanceToNow(oura.lastSyncAt, { addSuffix: true })}`
                    : "Connected · first sync running"
                : "Not connected"
            }
            note={oura ? undefined : "Sleep, readiness, temperature and SpO2 from your ring"}
          />
          <Row
            href="/apple-health"
            icon={<AppleIcon className="h-5 w-5" />}
            title="Apple Health"
            on={!!apple}
            status={
              apple
                ? `Uploaded ${formatDistanceToNow(apple.importedAt, { addSuffix: true })}${apple.lastDate ? ` · data to ${formatPretty(apple.lastDate)}` : ""}`
                : "Not set up"
            }
            note={apple ? undefined : "For Apple Watch: upload the Health app's export now and then"}
          />
        </div>
        {devices.length < 2 && (
          <p className="mt-2 text-xs text-zinc-500">
            Wear more than one? Connect both and choose which device to use for sleep, recovery, daily activity and workouts.
          </p>
        )}
      </section>

      {devices.length >= 2 && (
        <section>
          <SectionTitle>Which device for what</SectionTitle>
          <SourcePrefsCard prefs={prefs} devices={devices} />
        </section>
      )}

      <section>
        <SectionTitle>Body scans</SectionTitle>
        <Row
          href="/stats#inbody"
          icon={<ScaleIcon className="h-5 w-5" />}
          title="InBody"
          status="Add a scan from a screenshot in Progress, Body"
        />
      </section>

      <section>
        <SectionTitle>Files</SectionTitle>
        <div className="space-y-2">
          <Row
            href="/connect/import"
            icon={<SheetIcon className="h-5 w-5" />}
            title="Import workouts from a spreadsheet"
            on={imports.length > 0 ? true : undefined}
            status={
              lastImport
                ? `Last import ${formatDistanceToNow(lastImport.createdAt, { addSuffix: true })} · ${lastImport.fileName}`
                : "Excel or CSV, using our template"
            }
          />
          <Card id="export" className="scroll-mt-6 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <DownloadIcon className="h-4 w-4 text-zinc-400" /> Export your data (CSV)
            </div>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {EXPORTS.map(([type, label]) => (
                <a
                  key={type}
                  href={`/api/export?type=${type}`}
                  download
                  className="press rounded-lg bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  {label}
                </a>
              ))}
            </div>
          </Card>
        </div>
      </section>
    </PageTransition>
  );
}
