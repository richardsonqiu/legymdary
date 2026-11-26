"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { setSourcePrefs } from "@/lib/actions";
import { CATEGORIES, CATEGORY_INFO, DEVICE_LABEL, orderFor, type Category, type Device, type Prefs } from "@/lib/sources-shared";
import { cn } from "@/lib/utils";

/**
 * "Which device for what": for sleep, recovery, daily activity and workouts,
 * pick a device (or Auto). Days the chosen device has nothing for fall back
 * to the next connected device.
 */
export function SourcePrefsCard({ prefs, devices }: { prefs: Prefs; devices: Device[] }) {
  const router = useRouter();
  const [value, setValue] = useState<Prefs>(prefs);
  const [saving, start] = useTransition();
  const [saved, setSaved] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(cat: Category, v: Device | "auto") {
    const next = { ...value, [cat]: v };
    setValue(next);
    setError(null);
    start(async () => {
      const res = await setSourcePrefs(next);
      if ("error" in res) {
        setError(res.error);
        setValue(value);
        return;
      }
      setSaved(cat);
      router.refresh();
    });
  }

  const used = (cat: Category) => orderFor(value, cat).find((d) => devices.includes(d));

  return (
    <Card className="space-y-4">
      <p className="text-sm text-zinc-400">
        Pick a device for each kind of data. If it has nothing for a day (you didn&apos;t wear it), the next device fills in.
      </p>
      {CATEGORIES.map((cat) => {
        const options: (Device | "auto")[] = ["auto", ...devices];
        const current = devices.includes(value[cat] as Device) || value[cat] === "auto" ? value[cat] : "auto";
        return (
          <div key={cat} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{CATEGORY_INFO[cat].label}</span>
              <span className="text-[11px] text-zinc-500">
                {saving && saved === cat ? "Saving…" : current === "auto" && used(cat) ? `Using ${DEVICE_LABEL[used(cat)!]}` : ""}
              </span>
            </div>
            <div role="radiogroup" aria-label={CATEGORY_INFO[cat].label} className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
              {options.map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={current === o}
                  disabled={saving}
                  onClick={() => current !== o && pick(cat, o)}
                  className={cn(
                    "press min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-xs font-medium transition-colors",
                    current === o ? "bg-citron text-carbon" : "text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {o === "auto" ? "Auto" : DEVICE_LABEL[o]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500">{CATEGORY_INFO[cat].covers}</p>
          </div>
        );
      })}
      <p className="text-[11px] text-zinc-500">
        Auto uses Garmin first, then Oura, then Apple Health. Stress and Body Battery always come from Garmin; temperature,
        SpO2 and Oura&apos;s readiness always come from Oura.
      </p>
      {error && <p className="text-sm text-amber-300">{error}</p>}
    </Card>
  );
}
