import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * libSQL works both with a local SQLite file (dev) and a hosted Turso
 * database (prod) using the exact same driver — just swap the env vars.
 */
const url = process.env.DATABASE_URL ?? "file:./local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

const baseClient = createClient({ url, authToken });

// Local SQLite file only (dev/tests): let readers and writers overlap and wait
// briefly on locks instead of failing with SQLITE_BUSY. Turso handles this itself.
if (url.startsWith("file:")) {
  void baseClient.execute("PRAGMA journal_mode = WAL").catch(() => {});
  void baseClient.execute("PRAGMA busy_timeout = 5000").catch(() => {});
}

/**
 * DB_SIMULATE_LATENCY_MS (local testing only): delay every round trip to
 * mimic a remote database, to expose query waterfalls that a local SQLite
 * file hides.
 */
const simulated = Number(process.env.DB_SIMULATE_LATENCY_MS) || 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const client = simulated
  ? new Proxy(baseClient, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (typeof v === "function" && (prop === "execute" || prop === "batch")) {
          return async (...args: unknown[]) => {
            await sleep(simulated);
            return (v as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return typeof v === "function" ? v.bind(target) : v;
      },
    })
  : baseClient;

/** Set DB_TRACE=1 to log every query (handy for spotting slow pages / N+1s). */
const trace = process.env.DB_TRACE === "1";
let traceCount = 0;

export const db = drizzle(client, {
  schema,
  logger: trace
    ? {
        logQuery(query: string) {
          traceCount++;
          console.log(`[db#${traceCount}] ${query.slice(0, 140).replace(/\s+/g, " ")}`);
        },
      }
    : false,
});
export { schema };
