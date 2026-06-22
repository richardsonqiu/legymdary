"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DumbbellIcon } from "@/components/icons";
import {
  Button,
  buttonClass,
  Card,
  Field,
  inputClass,
  PageHeader,
} from "@/components/ui";
import { createWorkout, duplicateLastWorkout } from "@/lib/actions";
import { todayStr } from "@/lib/utils";

export function StartWorkout({ canDuplicate }: { canDuplicate: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("Workout");
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState<null | "new" | "dup">(null);
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

  return (
    <div className="space-y-5">
      <PageHeader title="Log workout" subtitle="Start a new session" />

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
