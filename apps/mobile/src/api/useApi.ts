import { ApiClientError, type ApiClient } from "@legymdary/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";

/**
 * Small keyed cache with stale-while-refresh. Cached data shows at once, then refetches
 * when the screen gains focus, on pull-to-refresh, or after `invalidate`. One request per key
 * runs at a time, and an older response never overwrites a newer one.
 * shortcut: in-memory only, no retry or cache expiry; switch to @tanstack/react-query if screens need those.
 */
const cache = new Map<string, { data: unknown; at: number }>();
const inflight = new Map<string, Promise<void>>();
/** In-flight keys invalidated mid-request: their response may predate the write, so they refetch once more. */
const dirty = new Set<string>();
const listeners = new Set<(prefix: string) => void>();
const STALE_MS = 20_000;

/** Names for `invalidate`. A query name starts with one of these, so a write refreshes every screen that reads it. */
export const KEYS = { meals: "meals", today: "today", recent: "recent", workout: "workout", exercises: "exercises", templates: "templates" } as const;

/** Keys are `${userId}:${name}`; match `prefix` against the name only (empty prefix matches all). */
const matches = (key: string, prefix: string) => key.slice(key.indexOf(":") + 1).startsWith(prefix);

/** Mark cached entries whose name starts with `prefix` stale and refetch the mounted ones. Keys are `${userId}:${name}`. */
export function invalidate(prefix = "") {
  // Mark stale instead of deleting, so screens keep showing the old data while the refetch runs.
  for (const [k, v] of cache) if (matches(k, prefix)) v.at = 0;
  for (const k of inflight.keys()) if (matches(k, prefix)) dirty.add(k);
  listeners.forEach((l) => l(prefix));
}

export const errorMessage = (e: unknown) => (e instanceof ApiClientError || e instanceof Error ? e.message : "Something went wrong.");

export type Query<T> = {
  data: T | undefined;
  /** The last failure. With `hasData` true the old data is still shown, so show a StaleBanner, not an ErrorState. */
  error: string | null;
  hasData: boolean;
  /** true only while there is nothing to show yet. */
  loading: boolean;
  /** true during a pull-to-refresh. */
  refreshing: boolean;
  refresh: () => Promise<void>;
};

/** `name` identifies the request (include its parameters). `fetcher` gets the signed-in client. */
export function useApi<T>(name: string, fetcher: (api: ApiClient) => Promise<T>): Query<T> {
  const { api, user } = useAuth();
  const key = `${user?.id ?? "anon"}:${name}`;
  const [, bump] = useState(0);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [manual, setManual] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const latest = useRef(key);
  latest.current = key;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    (force: boolean, byUser = false): Promise<void> => {
      const hit = cache.get(key);
      if (!force && hit && Date.now() - hit.at < STALE_MS) return Promise.resolve();
      const running = inflight.get(key);
      if (running) return running;
      if (byUser) setManual(true);
      const p = Promise.resolve().then(async () => {
        try {
          const data = await fetcherRef.current(api);
          cache.set(key, { data, at: Date.now() });
          if (alive.current) setErrors((e) => ({ ...e, [key]: null }));
        } catch (e) {
          if (alive.current) setErrors((x) => ({ ...x, [key]: errorMessage(e) }));
        } finally {
          inflight.delete(key);
          if (dirty.delete(key)) void load(true);
          if (alive.current) {
            setManual(false);
            bump((n) => n + 1);
          }
        }
      });
      inflight.set(key, p);
      return p;
    },
    [api, key],
  );

  // Runs on mount and whenever the key changes while focused, and again each time the screen regains focus.
  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  useEffect(() => {
    const l = (prefix: string) => {
      if (matches(key, prefix)) void load(true);
    };
    listeners.add(l);
    return () => void listeners.delete(l);
  }, [key, load]);

  const data = cache.get(key)?.data as T | undefined;
  const error = errors[key] ?? null;
  const hasData = data !== undefined;
  const busy = inflight.has(key);
  return {
    data,
    error,
    hasData,
    loading: !hasData && !error,
    refreshing: busy && manual && latest.current === key,
    refresh: () => load(true, true),
  };
}

/** Pull-to-refresh plumbing for a screen with several queries. */
export function useRefreshAll(queries: Pick<Query<unknown>, "refresh" | "refreshing">[]) {
  return {
    refreshing: queries.some((q) => q.refreshing),
    refresh: () => void Promise.all(queries.map((q) => q.refresh())),
  };
}
