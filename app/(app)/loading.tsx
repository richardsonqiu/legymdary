export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="space-y-2">
        <div className="h-7 w-44 rounded-lg bg-zinc-900" />
        <div className="h-4 w-28 rounded bg-zinc-900/70" />
      </div>
      <div className="h-32 rounded-2xl border border-zinc-800 bg-zinc-900/50" />
      <div className="h-24 rounded-2xl border border-zinc-800 bg-zinc-900/50" />
      <div className="h-44 rounded-2xl border border-zinc-800 bg-zinc-900/50" />
    </div>
  );
}
