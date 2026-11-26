import { MUSCLE_GROUPS, type ExerciseDto } from "@legymdary/shared";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useExercises } from "../api/hooks";
import { Button, ListRow, QueryBoundary, Segmented, Sheet, Text, TextField } from "../ui";

const ALL = "All";
const SHOWN = 40;

/** Sheet that lists the exercise library; search, filter by muscle, or create a custom one. */
export function ExercisePicker({
  visible,
  onClose,
  existingIds,
  onPick,
  onCreate,
  busy,
}: {
  visible: boolean;
  onClose: () => void;
  existingIds: number[];
  onPick: (e: ExerciseDto) => void;
  /** Creates a custom exercise and adds it. */
  onCreate: (input: { name: string; muscleGroup: string; equipment: string }) => void;
  busy: boolean;
}) {
  const q = useExercises();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>(ALL);
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.exercises ?? []).filter((e) => (group === ALL || e.muscleGroup === group) && (!s || e.name.toLowerCase().includes(s)));
  }, [q.data, search, group]);
  const name = search.trim();
  const exact = list.some((e) => e.name.toLowerCase() === name.toLowerCase());

  return (
    <Sheet visible={visible} title="Add exercise" onClose={onClose}>
      <TextField label="Search" value={search} onChangeText={setSearch} placeholder="e.g. Bench press" autoCorrect={false} />
      <Segmented value={group} onChange={setGroup} options={[ALL, ...MUSCLE_GROUPS].map((g) => ({ value: g, label: g }))} />
      <QueryBoundary loading={q.loading} error={q.error} hasData={q.hasData} onRetry={() => void q.refresh()}>
        {list.slice(0, SHOWN).map((e) => (
          <ListRow
            key={e.id}
            title={e.name}
            subtitle={`${e.muscleGroup} · ${e.equipment}${existingIds.includes(e.id) ? " · already added" : ""}`}
            onPress={() => onPick(e)}
          />
        ))}
        {list.length > SHOWN ? (
          <Text variant="caption" tone="muted">
            Showing {SHOWN} of {list.length}. Search to narrow it down.
          </Text>
        ) : null}
        {list.length === 0 ? (
          <Text variant="body" tone="muted">
            No match.
          </Text>
        ) : null}
        {name && !exact ? (
          <Button
            title={`Create "${name}"`}
            variant="secondary"
            loading={busy}
            onPress={() => onCreate({ name, muscleGroup: group === ALL ? "Other" : group, equipment: "Other" })}
          />
        ) : null}
      </QueryBoundary>
    </Sheet>
  );
}
