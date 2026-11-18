import { RecapStory } from "@/components/recap/RecapStory";
import { getMealNames } from "@/lib/queries";
import { buildRecap, recapRange, type RecapPeriod } from "@/lib/recap";
import { requireUserId, userToday } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recap" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const period: RecapPeriod = sp.p === "month" || sp.p === "year" ? sp.p : "week";
  const anchor = typeof sp.d === "string" && DATE_RE.test(sp.d) ? sp.d : null;
  const [userId, today] = await Promise.all([requireUserId(), userToday()]);
  const range = recapRange(period, today, anchor);
  const names = await getMealNames(range.from, range.to);
  const recap = await buildRecap(userId, range, today, names);
  const links = [
    { label: "Last week", href: "/recap?p=week", on: period === "week" && !anchor },
    { label: "Last month", href: "/recap?p=month", on: period === "month" && !anchor },
    { label: "This year", href: "/recap?p=year", on: period === "year" && !anchor },
  ];
  return <RecapStory key={`${period}-${range.from}`} recap={recap} links={links} />;
}
