import { cn } from "@/lib/utils";

/** Garmin brand guidelines ask for attribution wherever Garmin data appears. */
export function GarminAttribution({ className }: { className?: string }) {
  return (
    <p className={cn("text-[10px] uppercase tracking-wide text-zinc-600", className)}>
      Data from Garmin Connect
    </p>
  );
}
