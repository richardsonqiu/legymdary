import { ApiClientError, type ApiClient } from "@legymdary/shared";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";

/**
 * Small keyed cache with stale-while-refresh. Cached data shows at once, then refetches
 * when the screen gains focus, on pull-to-refresh, or after `invalidate`.
 * shortcut: in-memory only, no request de-duplication; switch to @tanstack/react-query if screens start sharing many queries.
 */
const cache = new Map<string, { data: unknown; at: number }>();
const listeners = new Set<(prefix: string) => void>();
const STALE_MS = 20_000;

/** Mark cached entries whose name starts with `prefix` stale and refetch the mounted ones. Keys are `${userId}:${name}`. */
export function invalidate(prefix = "") {
  // Mark stale instead of deleting, so screens keep showing the old data while the refetch runs.
  for (const [k, v] of cache) if (k.includes(`:${prefix}`)) v.at = 0;
  listeners.forEach((l) => l(prefix));
}

export const errorMessage = (e: unknown) => (e instanceof ApiClientError || e instanceof Error ? e.message : "Something went wrong.");

export type Query<T> = {
  data: T | undefined;
  error: string | null;
  /** true only while there is nothing to show yet. */
  loading: boolean;
  /** true during a pull-to-refresh. */
  refreshing: boolean;
  refresh: () => void;
};

/** `name` identifies the request (include its parameters). `fetcher` gets the signed-in client. */
export function useApi<T>(name: string, fetcher: (api: ApiClient) => Promise<T>): Query<T> {
  const { api, user } = useAuth();
  const key = `${user?.id ?? "anon"}:${name}`;
  const [, bump] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [manual, setManual] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const latest = useRef(key);
  latest.current = key;

  const load = useCallback(
    async (force: boolean, byUser = false) => {
      const hit = cache.get(key);
      if (!force && hit && Date.now() - hit.at < STALE_MS) return;
      setFetching(true);
      setManual(byUser);
      if (!hit) setError(null);
      try {
        const data = await fetcherRef.current(api);
        cache.set(key, { data, at: Date.now() });
        if (latest.current === key) setError(null);
      } catch (e) {
        if (latest.current === key) setError(errorMessage(e));
      } finally {
        if (latest.current === key) {
          setFetching(false);
          setManual(false);
          bump((n) => n + 1);
        }
      }
    },
    [api, key],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const l = (prefix: string) => {
      if (key.includes(`:${prefix}`)) void load(true);
    };
    listeners.add(l);
    return () => void listeners.delete(l);
  }, [key, load]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const data = cache.get(key)?.data as T | undefined;
  return { data, error: data === undefined ? error : null, loading: data === undefined && !error, refreshing: fetching && manual, refresh: () => void load(true, true) };
}
