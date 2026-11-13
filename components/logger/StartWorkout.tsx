"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DumbbellIcon, TrashIcon } from "@/components/icons";
import {
  Button,
  buttonClass,
  Card,
  Field,
  inputClass,
  PageHeader,
} from "@/components/ui";
import {
  createWorkout,
  deleteTemplate,
  duplicateLastWorkout,
  startWorkoutFromTemplate,
} from "@/lib/actions";
import type { TemplateSummary } from "@/lib/queries";
import { todayStr } from "@/lib/utils";

export function StartWorkout({
  canDuplicate,
  templates,
}: {
  canDuplicate: boolean;
  templates: TemplateSummary[];
}) {
  const router = useRouter();
  const [name, setName] = useState("Workout");
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState<null | "new" | "dup" | number>(null);
  const [pending, start] = useTransition();

  function startNew() {
    setBusy("new");
    start(async () => {
      await createWorkout({ name, date });
      router.refresh();
    });
  }

  function dup() {
    setBusy("dup");
    start(async () => {
      await duplicateLastWorkout();
      router.refresh();
    });
  }

  function fromTemplate(id: number) {
    setBusy(id);
    start(async () => {
      await startWorkoutFromTemplate(id, todayStr());
      router.refresh();
    });
  }

  function removeTemplate(t: TemplateSummary) {
    if (!confirm(`Delete template “${t.name}”?`)) return;
    start(async () => {
      await deleteTemplate(t.id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Log workout" subtitle="Start a new session" />

      {templates.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Your templates
          </h2>
          <ul className="space-y-2">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="truncate text-xs text-zinc-500">
                    {t.exercises
                      .map((e) => (e.targetSets ? `${e.name} ×${e.targetSets}` : e.name))
                      .join(" · ")}
                  </div>
                </div>
                <button
                  onClick={() => removeTemplate(t)}
                  disabled={pending}
                  aria-label={`Delete template ${t.name}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
                <Button size="sm" onClick={() => fromTemplate(t.id)} disabled={pending}>
                  {busy === t.id && pending ? "Starting…" : "Start"}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card className="space-y-4">
        <Field label="Workout name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Push Day"
            className={inputClass}
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Button
          size="lg"
          className="w-full"
          onClick={startNew}
          disabled={pending}
        >
          <DumbbellIcon className="h-5 w-5" />
          {busy === "new" && pending ? "Starting…" : "Start workout"}
        </Button>
      </Card>

      {canDuplicate && (
        <div className="space-y-2">
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={dup}
            disabled={pending}
          >
            {busy === "dup" && pending
              ? "Duplicating…"
              : "Duplicate last workout"}
          </Button>
          <p className="text-center text-xs text-zinc-500">
            Pre-fills the exercises from your previous session.
            {templates.length === 0 &&
              " Tip: tap “Save as template” during a workout to reuse a routine."}
          </p>
        </div>
      )}

      <Link
        href="/exercises"
        className={buttonClass("ghost", "md", "w-full")}
      >
        Browse exercise library →
      </Link>
    </div>
  );
}
