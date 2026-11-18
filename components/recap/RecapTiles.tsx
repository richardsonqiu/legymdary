import Link from "next/link";

const TILES = [
  { p: "week", title: "Last week", sub: "Your week in review", bg: "#f2683c", fg: "#1b1410" },
  { p: "month", title: "Last month", sub: "The month in numbers", bg: "#27237a", fg: "#f1efff" },
  { p: "year", title: "This year", sub: "Your year so far", bg: "#1f3a2b", fg: "#eef5d8" },
] as const;

/** Entry tiles for the recap stories. */
export function RecapTiles() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TILES.map((t) => (
        <Link
          key={t.p}
          href={`/recap?p=${t.p}`}
          className="press relative block h-28 overflow-hidden rounded-2xl p-3"
          style={{ background: t.bg, color: t.fg }}
        >
          <span aria-hidden className="absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-20" style={{ background: t.fg }} />
          <span className="block text-[10px] font-black tracking-[0.18em]">REWIND.</span>
          <span className="recap-serif mt-3 block text-lg font-bold leading-tight">{t.title}</span>
          <span className="block text-[11px] opacity-80">{t.sub}</span>
        </Link>
      ))}
    </div>
  );
}

/** Home banner: shown early in a new week or month, when the last one's recap is fresh. */
export function RecapBanner({ today, hasWeek, hasMonth }: { today: string; hasWeek: boolean; hasMonth: boolean }) {
  const d = new Date(`${today}T12:00:00`);
  const dom = d.getDate();
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  const month = dom <= 3 && hasMonth;
  if (!month && (dow > 2 || !hasWeek)) return null;
  const label = month
    ? `Your ${new Date(d.getFullYear(), d.getMonth() - 1, 1).toLocaleDateString("en-US", { month: "long" })} recap is ready`
    : "Your week in review is ready";
  return (
    <Link
      href={`/recap?p=${month ? "month" : "week"}`}
      className="press flex items-center justify-between gap-3 overflow-hidden rounded-2xl px-4 py-3.5"
      style={{ background: month ? "#27237a" : "#f2683c", color: month ? "#f1efff" : "#1b1410" }}
    >
      <span>
        <span className="block text-[10px] font-black tracking-[0.18em]">REWIND.</span>
        <span className="recap-serif block text-xl font-bold leading-tight">{label}</span>
      </span>
      <span className="text-2xl">→</span>
    </Link>
  );
}
