"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CheckIcon, PlusIcon, SearchIcon, XIcon } from "@/components/icons";
import { Button, Field, inputClass, Tag } from "@/components/ui";
import type { Exercise } from "@/db/schema";
import { cn, EQUIPMENT, MUSCLE_GROUPS } from "@/lib/utils";

const selectClass =
  "h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950/60 px-3 text-base text-zinc-100 outline-none focus:border-zinc-500";

export function ExercisePicker({
  exercises,
  existingIds,
  onAdd,
  onCreateExercise,
  onClose,
}: {
  exercises: Exercise[];
  existingIds: number[];
  onAdd: (id: number) => void;
  onCreateExercise: (input: {
    name: string;
    muscleGroup: string;
    equipment: string;
  }) => Promise<{ error?: string }>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const added = useMemo(() => new Set(existingIds), [existingIds]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter((e) => {
      if (muscle && e.muscleGroup !== muscle) return false;
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exercises, query, muscle]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-3xl border-t border-zinc-800 bg-zinc-900 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
          <h2 className="text-base font-semibold">
            {creating ? "New exercise" : "Add exercise"}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {creating ? (
          <CreateExerciseForm
            onCancel={() => setCreating(false)}
            onCreateExercise={onCreateExercise}
          />
        ) : (
          <>
            {/* Search + filters */}
            <div className="space-y-3 border-b border-zinc-800 px-4 py-3">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search exercises…"
                  className={cn(inputClass, "pl-10")}
                  autoFocus
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
            </div>

            {/* List */}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {filtered.length === 0 ? (
                <p className="px-2 py-8 text-center text-sm text-zinc-500">
                  No exercises match.
                </p>
              ) : (
                <ul>
                  {filtered.map((e) => {
                    const isAdded = added.has(e.id);
                    return (
                      <li key={e.id}>
                        <button
                          onClick={() => onAdd(e.id)}
                          className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2.5 text-left hover:bg-zinc-800/60 active:bg-zinc-800"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {e.name}
                            </div>
                            <div className="mt-1 flex gap-1.5">
                              <Tag>{e.muscleGroup}</Tag>
                              <Tag>{e.equipment}</Tag>
                              {e.isCustom && <Tag>custom</Tag>}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                              isAdded
                                ? "bg-zinc-100 text-zinc-950"
                                : "border border-zinc-700 text-zinc-300",
                            )}
                          >
                            {isAdded ? (
                              <CheckIcon className="h-4 w-4" />
                            ) : (
                              <PlusIcon className="h-4 w-4" />
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 border-t border-zinc-800 px-4 py-3 pb-safe">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => setCreating(true)}
              >
                <PlusIcon className="h-5 w-5" /> New exercise
              </Button>
              <Button size="lg" className="flex-1" onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        )}
      </div>
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

function CreateExerciseForm({
  onCancel,
  onCreateExercise,
}: {
  onCancel: () => void;
  onCreateExercise: (input: {
    name: string;
    muscleGroup: string;
    equipment: string;
  }) => Promise<{ error?: string }>;
}) {
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
      const res = await onCreateExercise({ name, muscleGroup, equipment });
      if (res.error) setError(res.error);
      else onCancel();
    });
  }

  return (
    <div className="space-y-4 px-4 py-4 pb-safe">
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
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
          onClick={onCancel}
        >
          Back
        </Button>
        <Button
          size="lg"
          className="flex-1"
          onClick={submit}
          disabled={pending}
        >
          {pending ? "Adding…" : "Create & add"}
        </Button>
      </div>
    </div>
  );
}
