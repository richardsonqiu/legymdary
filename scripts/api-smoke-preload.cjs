// Preload for scripts/api-smoke.ts: next/headers only works inside a Next request, so
// answer it from globalThis.__smokeHeaders (set by the script before each handler call).
// Covers require() (Module._load) and import() (module hooks).
const Module = require("node:module");
const { pathToFileURL } = require("node:url");

const stubs = {
  "next/headers": {
    headers: async () => new Headers(globalThis.__smokeHeaders ?? {}),
    cookies: async () => ({ get: () => undefined }),
  },
  "next/cache": { revalidatePath() {}, revalidateTag() {} },
};

const load = Module._load;
Module._load = function (request, ...rest) {
  return stubs[request] ?? load.call(this, request, ...rest);
};

Module.register(pathToFileURL(require("node:path").join(__dirname, "api-smoke-hooks.mjs")).href);
