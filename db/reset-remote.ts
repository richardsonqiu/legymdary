import "dotenv/config";
import { createClient } from "@libsql/client";

/**
 * Drops every table on the target database so a fresh migration can run.
 * For fixing a Turso database that was created with an older schema.
 *
 * Usage (paste your Turso creds inline so it can't touch your local file):
 *   DATABASE_URL="libsql://…turso.io" DATABASE_AUTH_TOKEN="…" npm run db:reset-remote
 *
 * Then redeploy — the build recreates the tables and seeds the library.
 */
const TABLES = [
  "body_stats",
  "sets",
  "workout_exercises",
  "workouts",
  "exercises",
  "account",
  "session",
  "verificationToken",
  "user",
  "__drizzle_migrations",
];

async function main() {
  const url = process.env.DATABASE_URL;
  const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

  if (!url || url.startsWith("file:")) {
    console.error(
      "Refusing to run: set DATABASE_URL to your remote Turso libsql:// URL " +
        "(and DATABASE_AUTH_TOKEN) inline. This is a destructive reset.",
    );
    process.exit(1);
  }

  const client = createClient({ url, authToken });
  console.log(`Dropping all tables on ${url} …`);
  await client.execute("PRAGMA foreign_keys=OFF;");
  for (const t of TABLES) {
    await client.execute(`DROP TABLE IF EXISTS "${t}";`);
    console.log(`  dropped ${t}`);
  }
  client.close();
  console.log(
    "Done. The database is now empty — redeploy (or run `npm run setup` with " +
      "these same creds) to recreate the schema and seed the library.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Remote reset failed:", err);
  process.exit(1);
});
