import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * `generate` emits plain SQLite migrations (understood by both a local SQLite
 * file and Turso). They are applied with the libSQL migrator in db/migrate.ts,
 * so the same migrations run in dev and prod with one driver.
 */
export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./local.db",
  },
});
