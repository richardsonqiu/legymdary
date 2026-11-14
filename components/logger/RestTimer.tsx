"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
} from "react";
import { XIcon } from "@/components/icons";
import { Portal } from "@/components/Portal";
import { cn } from "@/lib/utils";

export type RestTimerHandle = { start: () => void };

const PRESETS = [60, 90, 120, 180];
const DURATION_KEY = "legymdary.rest.duration";
const END_KEY = "legymdary.rest.endAt";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, v: string | null) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* private mode etc. — timer still works for this page view */
  }
}

function beep() {
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* audio not available */
  }
}

const fmt = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/**
 * Floating rest timer above the bottom nav. Starts automatically when a set is
 * logged (via the `start` handle); survives refreshes via localStorage.
 */
export function RestTimer({ ref }: { ref?: Ref<RestTimerHandle> }) {
  // Client-only: the saved timer lives in localStorage, so mount after
  // hydration to avoid a server/client mismatch.
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return mounted ? (
    <Portal>
      <RestTimerInner ref={ref} />
    </Portal>
  ) : null;
}

const noop = () => () => {};

function RestTimerInner({ ref }: { ref?: Ref<RestTimerHandle> }) {
  const [duration, setDuration] = useState<number>(() => {
    const v = Number(read(DURATION_KEY));
    return v > 0 ? v : 90;
  });
  const [endAt, setEndAt] = useState<number | null>(() => {
    const v = Number(read(END_KEY));
    return v > Date.now() ? v : null;
  });
  const [now, setNow] = useState(() => Date.now());
  const [done, setDone] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const firedFor = useRef<number | null>(null);

  function startWith(sec: number) {
    const end = Date.now() + sec * 1000;
    setEndAt(end);
    setNow(Date.now());
    setDone(false);
    firedFor.current = null;
    write(END_KEY, String(end));
  }

  useImperativeHandle(ref, () => ({ start: () => startWith(duration) }), [
    duration,
  ]);

  // Tick while running; fire vibration + beep once at zero.
  useEffect(() => {
    if (endAt == null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endAt && firedFor.current !== endAt) {
        firedFor.current = endAt;
        navigator.vibrate?.([200, 100, 200]);
        beep();
        setDone(true);
        setEndAt(null);
        write(END_KEY, null);
        setTimeout(() => setDone(false), 4000);
      }
    }, 250);
    return () => clearInterval(id);
  }, [endAt]);

  function stop() {
    setEndAt(null);
    setDone(false);
    write(END_KEY, null);
  }
  function adjust(delta: number) {
    if (endAt == null) return;
    const end = Math.max(Date.now() + 1000, endAt + delta * 1000);
    setEndAt(end);
    write(END_KEY, String(end));
  }
  function pickPreset(sec: number) {
    setDuration(sec);
    write(DURATION_KEY, String(sec));
    setShowPresets(false);
    startWith(sec);
  }

  const running = endAt != null;
  const remaining = running ? Math.max(0, Math.ceil((endAt - now) / 1000)) : 0;
  const total = duration;
  const pct = running ? Math.min(1, remaining / Math.max(total, remaining)) : 0;

  if (!running && !done) {
    return (
      <div className="fixed inset-x-0 bottom-[84px] z-30 mx-auto flex max-w-2xl justify-end px-4">
        <div className="relative">
          {showPresets && (
            <div className="absolute bottom-12 right-0 flex gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 p-1.5 shadow-xl">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => pickPreset(p)}
                  className={cn(
                    "h-9 rounded-lg px-2.5 text-xs font-medium tabular-nums",
                    p === duration
                      ? "bg-zinc-100 text-zinc-950"
                      : "text-zinc-300 hover:bg-zinc-800",
                  )}
                >
                  {fmt(p)}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowPresets((s) => !s)}
            className="flex h-10 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/95 px-3.5 text-xs font-medium text-zinc-300 shadow-lg backdrop-blur"
            aria-label="Rest timer"
          >
            ⏱ Rest {fmt(duration)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-[84px] z-30 mx-auto max-w-2xl px-4">
      <div
        className={cn(
          "animate-item-in relative overflow-hidden rounded-2xl border shadow-xl backdrop-blur",
          done
            ? "border-emerald-400/50 bg-emerald-500/15"
            : "border-zinc-700 bg-zinc-900/95",
        )}
      >
        {running && (
          <div
            className="absolute inset-y-0 left-0 bg-zinc-100/10 transition-[width] duration-300"
            style={{ width: `${pct * 100}%` }}
          />
        )}
        <div className="relative flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">
              {done ? "Rest over" : "Resting"}
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {done ? "Next set 💪" : fmt(remaining)}
            </div>
          </div>
          {running && (
            <>
              <button
                onClick={() => adjust(-15)}
                className="h-9 rounded-lg px-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              >
                −15s
              </button>
              <button
                onClick={() => adjust(15)}
                className="h-9 rounded-lg px-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
              >
                +15s
              </button>
            </>
          )}
          <button
            onClick={stop}
            aria-label="Stop rest timer"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
