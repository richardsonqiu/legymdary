"use client";

import { formatPretty } from "@legymdary/shared";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshIcon, RingIcon } from "@/components/icons";
import { Button, Card } from "@/components/ui";
import { disconnectOura, syncOuraNow } from "@/lib/actions";
import type { OuraStatus } from "@/lib/queries";
import { cn } from "@/lib/utils";

const FLASH: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Oura connected. Importing the last 90 days now; this takes a minute." },
  state: { ok: false, text: "That sign-in link expired or didn't match. Try Connect Oura again." },
  denied: { ok: false, text: "Oura access wasn't granted. Try again and tap Accept on Oura's page." },
  exchange: { ok: false, text: "Oura didn't confirm the sign-in. Try again in a minute." },
  too_many: { ok: false, text: "Too many attempts. Wait a while and try again." },
  not_configured: { ok: false, text: "Oura isn't set up on this server yet (see below)." },
};

export function OuraConnect({
  status,
  configured,
  flash,
}: {
  status: OuraStatus | null;
  configured: boolean;
  /** From the callback redirect: "connected" or an error code. */
  flash: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(flash ? (FLASH[flash] ?? null) : null);
  const [confirming, setConfirming] = useState(false);
  const [deleteData, setDeleteData] = useState(false);

  function sync() {
    setMsg(null);
    start(async () => {
      const r = await syncOuraNow();
      setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: `Synced: ${r.days} days, ${r.nights} nights, ${r.workouts} workouts.` });
      router.refresh();
    });
  }
  function disconnect() {
    start(async () => {
      await disconnectOura(deleteData);
      setConfirming(false);
      setMsg({ ok: true, text: deleteData ? "Disconnected and Oura data removed." : "Disconnected. Imported data was kept." });
      router.refresh();
    });
  }

  const banner = msg && (
    <p
      role="status"
      className={cn(
        "rounded-xl border px-3 py-2.5 text-sm",
        msg.ok ? "border-teal-300/30 bg-teal-300/10 text-teal-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100",
      )}
    >
      {msg.text}
    </p>
  );

  if (!status) {
    return (
      <div className="space-y-3">
        {banner}
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800/80">
              <RingIcon className="h-5 w-5" />
            </span>
            <div>
              <div className="font-medium">Connect your Oura Ring</div>
              <div className="text-xs text-zinc-400">You sign in on Oura&apos;s site and choose what to share. Your password never reaches this app.</div>
            </div>
          </div>
          {configured ? (
            <a
              href="/api/oura/connect"
              className="press flex h-12 w-full items-center justify-center rounded-xl bg-citron text-sm font-semibold text-carbon hover:bg-citron-deep"
            >
              Connect Oura
            </a>
          ) : (
            <p className="rounded-xl border border-zinc-700 px-3 py-2.5 text-sm text-zinc-300">
              Oura isn&apos;t set up on this server yet. The app owner registers an Oura app at cloud.ouraring.com/oauth/applications
              with the redirect address <code className="text-xs">/api/oura/callback</code> and sets OURA_CLIENT_ID and
              OURA_CLIENT_SECRET.
            </p>
          )}
          <p className="text-xs text-zinc-400">
            Gen3 and newer rings need an active Oura Membership for apps to read data. The first sync brings in the last 90 days.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {banner}
      <Card className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800/80">
            <RingIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-medium">
              <span className={cn("h-2 w-2 rounded-full", status.status === "ok" ? "bg-emerald-400" : "bg-amber-400")} />
              {status.status === "ok" ? "Connected" : "Needs attention"}
            </div>
            <div className="text-xs text-zinc-400">
              {status.lastSyncAt ? `Synced ${formatDistanceToNow(status.lastSyncAt, { addSuffix: true })}` : "First sync in progress"}
              {status.backfilledFrom ? ` · data from ${formatPretty(status.backfilledFrom)}` : ""}
            </div>
          </div>
        </div>
        {status.lastError && (
          <p className={cn("rounded-xl border px-3 py-2 text-xs", status.status === "ok" ? "border-zinc-700 text-zinc-400" : "border-amber-400/30 bg-amber-400/10 text-amber-100")}>
            {status.status === "ok" ? `Some data wasn't available: ${status.lastError}` : status.lastError}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {status.status === "ok" ? (
            <Button variant="secondary" onClick={sync} disabled={pending}>
              <RefreshIcon className={cn("h-4 w-4", pending && "animate-spin")} /> {pending ? "Syncing…" : "Sync now"}
            </Button>
          ) : (
            <a href="/api/oura/connect" className="press flex h-11 items-center justify-center rounded-xl bg-citron text-sm font-semibold text-carbon">
              Connect again
            </a>
          )}
          <Button variant="secondary" onClick={() => setConfirming((v) => !v)} disabled={pending}>
            Disconnect
          </Button>
        </div>
        {confirming && (
          <div className="space-y-2 rounded-xl border border-zinc-700 p-3 text-sm">
            <label className="flex items-start gap-2 text-zinc-300">
              <input type="checkbox" checked={deleteData} onChange={(e) => setDeleteData(e.target.checked)} className="mt-1" />
              Also remove the Oura data already imported (sleep, readiness, workouts)
            </label>
            <Button className="w-full" onClick={disconnect} disabled={pending}>
              {deleteData ? "Disconnect and remove data" : "Disconnect, keep data"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
