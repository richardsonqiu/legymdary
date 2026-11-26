// Module hook for scripts/api-smoke.ts: answers `import("next/headers")` with a stub.
const stub = new URL("./api-smoke-stub.cjs", import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === "next/headers" || specifier === "next/cache") {
    return { url: `${stub}?${specifier.split("/")[1]}`, shortCircuit: true, format: "module" };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith(stub)) {
    const which = url.split("?")[1];
    const src =
      which === "headers"
        ? `export const headers = async () => new Headers(globalThis.__smokeHeaders ?? {}); export const cookies = async () => ({ get: () => undefined });`
        : `export const revalidatePath = () => {}; export const revalidateTag = () => {};`;
    return { format: "module", source: src, shortCircuit: true };
  }
  return next(url, context);
}
