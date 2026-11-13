"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import type { Goals } from "@/db/schema";
import { saveGoals } from "@/lib/actions";
import { ACTIVITY_LEVELS, type ActivityLevel } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

const str = (v: number | null | undefined) => (v != null ? String(v) : "");

export function GoalsForm({
  goals,
  currentWeight,
}: {
  goals: Goals | null;
  currentWeight: number | null;
}) {
  const router = useRouter();
  const [sex, setSex] = useState(goals?.sex ?? "");
  const [birthYear, setBirthYear] = useState(str(goals?.birthYear));
  const [heightCm, setHeightCm] = useState(str(goals?.heightCm));
  const [activity, setActivity] = useState<string>(goals?.activityLevel ?? "");
  const [targetWeight, setTargetWeight] = useState(str(goals?.targetWeight));
  const [targetBodyFat, setTargetBodyFat] = useState(str(goals?.targetBodyFat));
  const [weeklyRate, setWeeklyRate] = useState(str(goals?.weeklyRate));
  const [calorieOverride, setCalorieOverride] = useState(str(goals?.calorieOverride));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setMsg(null);
    start(async () => {
      const res = await saveGoals({
        sex: sex || null,
        birthYear: birthYear || null,
        heightCm: heightCm || null,
        activityLevel: activity || null,
        targetWeight: targetWeight || null,
        targetBodyFat: targetBodyFat || null,
        weeklyRate: weeklyRate || null,
        calorieOverride: calorieOverride || null,
      });
      if ("error" in res) setMsg({ ok: false, text: res.error });
      else {
        setMsg({ ok: true, text: "Plan updated ✓" });
        router.refresh();
      }
    });
  }

  return (
    <Card className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">About you</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Sex">
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value)}
              className={cn(inputClass, "px-2.5")}
            >
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Born">
            <input
              value={birthYear}
              inputMode="numeric"
              placeholder="1995"
              onChange={(e) => setBirthYear(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Height cm">
            <input
              value={heightCm}
              inputMode="decimal"
              placeholder="175"
              onChange={(e) => setHeightCm(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Activity level
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          {(Object.keys(ACTIVITY_LEVELS) as ActivityLevel[]).map((k) => (
            <button
              key={k}
              onClick={() => setActivity(k)}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                activity === k
                  ? "border-zinc-300 bg-zinc-100/10"
                  : "border-zinc-800 bg-zinc-950/40 text-zinc-300",
              )}
            >
              <span className="font-medium">{ACTIVITY_LEVELS[k].label}</span>
              <span className="text-xs text-zinc-500">{ACTIVITY_LEVELS[k].hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Goals</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target weight kg">
            <input
              value={targetWeight}
              inputMode="decimal"
              placeholder={currentWeight != null ? String(currentWeight) : "70"}
              onChange={(e) => setTargetWeight(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Target body fat %">
            <input
              value={targetBodyFat}
              inputMode="decimal"
              placeholder="15"
              onChange={(e) => setTargetBodyFat(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Pace kg / week" hint="Blank = recommended">
            <input
              value={weeklyRate}
              inputMode="decimal"
              placeholder="auto"
              onChange={(e) => setWeeklyRate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Custom kcal / day" hint="Overrides the calculation">
            <input
              value={calorieOverride}
              inputMode="numeric"
              placeholder="auto"
              onChange={(e) => setCalorieOverride(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <Button size="lg" className="w-full" onClick={submit} disabled={pending}>
        {pending ? "Saving…" : "Save plan"}
      </Button>
      {msg && (
        <p className={cn("text-center text-sm", msg.ok ? "text-emerald-300" : "text-amber-300")}>
          {msg.text}
        </p>
      )}
    </Card>
  );
}
