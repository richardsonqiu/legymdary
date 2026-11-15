"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Renders floating UI (sheets, toasts, timers) directly into <body>, so page
 * animations/transforms on ancestors can never shift position:fixed layers.
 */
export function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}
