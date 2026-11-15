import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <main className="flex-1 px-4 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))]">{children}</main>
      <BottomNav />
    </div>
  );
}
