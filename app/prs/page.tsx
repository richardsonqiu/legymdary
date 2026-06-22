import { TrophyIcon } from "@/components/icons";
import { EmptyState, PageHeader, Tag } from "@/components/ui";
import { getAllPRs } from "@/lib/queries";
import { formatMedium, kg } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PRsPage() {
  const prs = await getAllPRs();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Personal records"
        subtitle={
          prs.length
            ? `${prs.length} exercise${prs.length === 1 ? "" : "s"} · estimated 1RM`
            : "Your all-time bests"
        }
      />

      {prs.length === 0 ? (
        <EmptyState
          icon={<TrophyIcon className="h-6 w-6" />}
          title="No records yet"
          description="Log working sets and your best estimated 1RM per exercise shows up here."
        />
      ) : (
        <ul className="space-y-2.5">
          {prs.map((p, i) => (
            <li
              key={p.exerciseId}
              className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3.5"
            >
              <div
                className={
                  i === 0
                    ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-950"
                    : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400"
                }
              >
                {i === 0 ? (
                  <TrophyIcon className="h-5 w-5" />
                ) : (
                  <span className="text-sm font-semibold tabular-nums">
                    {i + 1}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{p.exerciseName}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <Tag>{p.muscleGroup}</Tag>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {kg(p.weight)}kg × {p.reps} · {formatMedium(p.date)}
                  </span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-lg font-semibold tabular-nums">
                  {kg(p.e1rm)}
                  <span className="text-xs font-normal text-zinc-500">kg</span>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                  est 1RM
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
