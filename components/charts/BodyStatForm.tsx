"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import type { BodyStat } from "@/db/schema";
import { logBodyStat } from "@/lib/actions";
import { kg, todayStr } from "@/lib/utils";

export function BodyStatForm({ latest }: { latest: BodyStat | null }) {
  const router = useRouter();
  const [date, setDate] = useState(todayStr());
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    if (!weight && !waist && !bodyFat) return;
    start(async () => {
      await logBodyStat({
        date,
        weight: weight || null,
        waist: waist || null,
        bodyFat: bodyFat || null,
      });
      setWeight("");
      setWaist("");
      setBodyFat("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      router.refresh();
    });
  }

  const ph = (v: number | null | undefined) => (v != null ? kg(v) : "—");

  return (
    <Card className="space-y-4">
      <Field label="Date">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Weight kg">
          <input
            value={weight}
            inputMode="decimal"
            onChange={(e) => setWeight(e.target.value)}
            placeholder={ph(latest?.weight)}
            className={inputClass}
          />
        </Field>
        <Field label="Waist cm">
          <input
            value={waist}
            inputMode="decimal"
            onChange={(e) => setWaist(e.target.value)}
            placeholder={ph(latest?.waist)}
            className={inputClass}
          />
        </Field>
        <Field label="Body fat %">
          <input
            value={bodyFat}
            inputMode="decimal"
            onChange={(e) => setBodyFat(e.target.value)}
            placeholder={ph(latest?.bodyFat)}
            className={inputClass}
          />
        </Field>
      </div>
      <Button
        size="lg"
        className="w-full"
        onClick={submit}
        disabled={pending || (!weight && !waist && !bodyFat)}
      >
        {saved ? "Saved ✓" : pending ? "Saving…" : "Save entry"}
      </Button>
      <p className="text-center text-xs text-zinc-600">
        Leave a field blank to skip it. One entry per day.
      </p>
    </Card>
  );
}
