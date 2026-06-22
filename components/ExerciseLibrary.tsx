"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { PlusIcon, SearchIcon, XIcon } from "@/components/icons";
import { Button, Card, Field, inputClass, Tag } from "@/components/ui";
import type { Exercise } from "@/db/schema";
import { createExercise } from "@/lib/actions";
import { cn, EQUIPMENT, MUSCLE_GROUPS } from "@/lib/utils";

const selectClass =
  "h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 text-base text-zinc-100 outline-none focus:border-zinc-500";

export function ExerciseLibrary({ exercises }: { exercises: Exercise[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((e) => {
      if (muscle && e.muscleGroup !== muscle) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exercises, query, muscle]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Exercise library
          </h1>
          <p className="text-sm text-zinc-400">{exercises.length} exercises</p>
        </div>
        <Button
          size="sm"
          variant={creating ? "secondary" : "primary"}
          onClick={() => setCreating((c) => !c)}
        >
          {creating ? (
            <>
              <XIcon className="h-4 w-4" /> Close
            </>
          ) : (
            <>
              <PlusIcon className="h-4 w-4" /> New
            </>
          )}
        </Button>
      </div>

      {creating && (
        <CreateForm
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className={cn(inputClass, "pl-10")}
        />
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-1">
        <Chip active={muscle === null} onClick={() => setMuscle(null)}>
          All
        </Chip>
        {MUSCLE_GROUPS.map((m) => (
          <Chip
            key={m}
            active={muscle === m}
            onClick={() => setMuscle(muscle === m ? null : m)}
          >
            {m}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
          No exercises match.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800">
          {filtered.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 bg-zinc-900/40 px-3.5 py-3"
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {e.name}
              </span>
              <div className="flex shrink-0 gap-1.5">
                <Tag>{e.muscleGroup}</Tag>
                <Tag>{e.equipment}</Tag>
                {e.isCustom && <Tag>custom</Tag>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-zinc-100 bg-zinc-100 text-zinc-950"
          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800",
      )}
    >
      {children}
    </button>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<string>(MUSCLE_GROUPS[0]);
  const [equipment, setEquipment] = useState<string>(EQUIPMENT[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Please enter a name.");
      return;
    }
    start(async () => {
      const res = await createExercise({ name, muscleGroup, equipment });
      if ("error" in res) setError(res.error);
      else onDone();
    });
  }

  return (
    <Card className="space-y-4">
      <Field label="Exercise name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cable Y-Raise"
          className={inputClass}
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Muscle group">
          <select
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value)}
            className={selectClass}
          >
            {MUSCLE_GROUPS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Equipment">
          <select
            value={equipment}
            onChange={(e) => setEquipment(e.target.value)}
            className={selectClass}
          >
            {EQUIPMENT.map((eq) => (
              <option key={eq} value={eq}>
                {eq}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && <p className="text-sm text-zinc-300">{error}</p>}
      <Button
        size="lg"
        className="w-full"
        onClick={submit}
        disabled={pending}
      >
        {pending ? "Adding…" : "Add to library"}
      </Button>
    </Card>
  );
}
