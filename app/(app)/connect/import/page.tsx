import { PageTransition } from "@/components/PageTransition";
import { SheetImport } from "@/components/import/SheetImport";
import { PageHeader } from "@/components/ui";
import { getExerciseNames, getSheetImports } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import from a spreadsheet" };

export default async function ImportPage() {
  const [library, past] = await Promise.all([getExerciseNames(), getSheetImports()]);
  return (
    <PageTransition>
      <PageHeader title="Import a spreadsheet" subtitle="Bring in workouts and cardio you logged elsewhere" />
      <SheetImport
        library={library}
        past={past.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() }))}
      />
    </PageTransition>
  );
}
