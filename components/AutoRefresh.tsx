"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Refreshes the page's server data once after `delayMs` — used when a
 * background Garmin sync was just started, so new activities appear without
 * the user doing anything.
 */
export function AutoRefresh({ delayMs = 8000 }: { delayMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.refresh(), delayMs);
    return () => clearTimeout(t);
  }, [router, delayMs]);
  return null;
}
