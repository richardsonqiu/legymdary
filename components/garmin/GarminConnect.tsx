"use client";

import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GarminAttribution } from "@/components/garmin/GarminAttribution";
import { RefreshIcon, WatchIcon } from "@/components/icons";
import { Button, Card, Field, inputClass } from "@/components/ui";
import {
  connectGarmin,
  disconnectGarmin,
  setGarminActivityAdjust,
  syncGarminNow,
} from "@/lib/actions";
import type { GarminStatus } from "@/lib/queries";
import { cn } from "@/lib/utils";

const KEY_PAGE = "https://connect.garmin.com/app/settings/personalApiToken";

export function GarminConnect({ status }: { status: GarminStatus | null }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [replacing, setReplacing] = useState(false);

  function connect() {
    setMsg(null);
    start(async () => {
      const res = await connectGarmin(key);
      if ("error" in res) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setKey("");
      setReplacing(false);
      const s = res.sync;
      setMsg({
        ok: s.ok,
        text: s.ok
          ? `Connected ✓ Imported ${s.days} days, ${s.activities} activities${s.weighIns ? `, ${s.weighIns} weigh-ins` : ""}.`
          : `Key saved, but the first sync failed: ${s.error}`,
      });
      router.refresh();
    });
  }

  function sync() {
    setMsg(null);
    start(async () => {
      const s = await syncGarminNow();
      setMsg({
        ok: s.ok,
        text: s.ok
          ? `Synced ✓ ${s.days} days, ${s.activities} activities${s.weighIns ? `, ${s.weighIns} weigh-ins` : ""}.`
          : (s.error ?? "Sync failed."),
      });
      router.refresh();
    });
  }

  function toggleAdjust(on: boolean) {
    start(async () => {
      await setGarminActivityAdjust(on);
      router.refresh();
    });
  }

  function disconnect() {
    if (!confirm("Disconnect Garmin? Your stored key will be deleted.")) return;
    const wipe = confirm(
      "Also delete the Garmin data already imported (daily stats, activities, scale weigh-ins)?",
    );
    start(async () => {
      await disconnectGarmin(wipe);
      setMsg({ ok: true, text: "Disconnected." });
      router.refresh();
    });
  }

  const showForm = !status || replacing;

  return (
    <div className="space-y-5">
      {status && (
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full",
                status.status === "ok" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300",
              )}
            >
              <WatchIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {status.status === "ok" ? "Garmin connected" : "Garmin needs attention"}
              </div>
              <div className="text-xs text-zinc-500">
                Key ••••{status.keyHint} ·{" "}
                {status.lastSyncAt
                  ? `synced ${formatDistanceToNow(status.lastSyncAt, { addSuffix: true })}`
                  : "not synced yet"}
              </div>
            </div>
          </div>
          {status.lastError && (
            <p
              className={cn(
                "rounded-xl border px-3 py-2 text-sm",
                status.status === "ok"
                  ? "border-zinc-800 bg-zinc-900/60 text-zinc-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-200",
              )}
            >
              {status.status === "ok" ? `Partial sync: ${status.lastError}` : status.lastError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={sync} disabled={pending || status.status !== "ok"}>
              <RefreshIcon className={cn("h-4 w-4", pending && "animate-spin")} /> Sync now
            </Button>
            <Button variant="secondary" onClick={() => setReplacing((r) => !r)} disabled={pending}>
              {replacing ? "Cancel" : "Replace key"}
            </Button>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
            <input
              type="checkbox"
              checked={status.adjustForActivity}
              onChange={(e) => toggleAdjust(e.target.checked)}
              disabled={pending}
              className="mt-0.5 h-5 w-5 accent-emerald-400"
            />
            <span className="text-sm">
              <span className="font-medium">Eat back extra activity</span>
              <span className="block text-xs text-zinc-500">
                On days you burn more than usual, add half of the extra to that day&apos;s
                calorie target (max +600 kcal).
              </span>
            </span>
          </label>

          <button
            onClick={disconnect}
            disabled={pending}
            className="w-full text-center text-xs text-zinc-500 underline-offset-2 hover:underline"
          >
            Disconnect Garmin
          </button>
        </Card>
      )}

      {showForm && (
        <Card className="space-y-4">
          <div>
            <h2 className="font-semibold">{status ? "Replace your API key" : "Connect your Garmin"}</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Garmin&apos;s free Personal API lets this app read your own data — calories
              burned, activities, sleep, HRV, Body Battery and scale weigh-ins.
            </p>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-300">
            <li>
              Open{" "}
              <a href={KEY_PAGE} target="_blank" rel="noreferrer" className="text-zinc-100 underline">
                Garmin Connect → Personal API Key
              </a>{" "}
              (sign in on the web).
            </li>
            <li>Select <b>Create Key</b>, accept the terms and pick an expiry (1 year is easiest).</li>
            <li>Copy the key — Garmin shows it only once — and paste it below.</li>
          </ol>
          <Field label="Personal API key">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste your key"
              autoComplete="off"
              spellCheck={false}
              className={inputClass}
            />
          </Field>
          <Button size="lg" className="w-full" onClick={connect} disabled={pending || !key.trim()}>
            {pending ? "Connecting… (importing 30 days)" : "Connect Garmin"}
          </Button>
          <p className="text-xs text-zinc-500">
            Your key is checked with Garmin, then stored encrypted. It&apos;s only used to read
            your data — nothing is written to Garmin. Garmin emails you before it expires.
          </p>
        </Card>
      )}

      {msg && (
        <p className={cn("text-center text-sm", msg.ok ? "text-emerald-300" : "text-amber-300")}>
          {msg.text}
        </p>
      )}
      <GarminAttribution className="text-center" />
    </div>
  );
}
