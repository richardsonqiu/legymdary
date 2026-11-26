// Preload for scripts/api-smoke.ts: next/headers only works inside a Next request, so the
// module hook answers it from globalThis.__smokeHeaders (set by the script before each call).
import { register } from "node:module";

register("./api-smoke-hooks.mjs", import.meta.url);
