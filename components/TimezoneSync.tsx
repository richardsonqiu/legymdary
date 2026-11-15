"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Tells the server which time zone the user is in, so "today" means their today. */
export function TimezoneSync() {
  const router = useRouter();
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      const current = document.cookie.match(/(?:^|; )tz=([^;]*)/)?.[1];
      if (current && decodeURIComponent(current) === tz) return;
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      // First visit (or the user travelled): re-render with the right day.
      router.refresh();
    } catch {
      /* cookies blocked: the server date is used */
    }
  }, [router]);
  return null;
}
