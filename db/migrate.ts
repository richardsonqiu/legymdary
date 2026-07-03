import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

/**
 * Applies the generated SQLite migrations in ./drizzle to whatever DATABASE_URL
 * points at — a local file in dev, a Turso database in prod.
 */
async function main() {
  const url = process.env.DATABASE_URL ?? "file:./local.db";
  const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

  const client = createClient({ url, authToken });
  const db = drizzle(client);

  console.log(`Running migrations against ${url} ...`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");

  client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
