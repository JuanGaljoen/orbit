/**
 * Applies Drizzle migrations + default vocabularies to DATABASE_URL.
 * Run on deploy (Vercel build command) and whenever the schema changes.
 */
import "dotenv/config";
import { config } from "dotenv";
import path from "node:path";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  const { ensureDefaults } = await import("../src/db/defaults");
  if (!url || url.startsWith("pglite:")) {
    console.log("DATABASE_URL not set to Postgres — PGlite migrates itself on first use. Nothing to do.");
    return;
  }
  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool });
  await migrate(db, { migrationsFolder });
  await ensureDefaults(db as never);
  await pool.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
