import "server-only";
import path from "node:path";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * One database handle for the whole app.
 *
 * - `DATABASE_URL=postgres://…` (Neon) → `@neondatabase/serverless` Pool. Migrations run at
 *   deploy time (`pnpm db:migrate`), never on request.
 * - unset or `pglite:<dir>` → embedded PGlite (local dev, tests). Migrations + defaults are
 *   applied on first use so `pnpm dev` works with zero setup.
 *
 * Both drivers expose the same Drizzle pg query builder; we type it as the Neon flavour.
 */
export type Db = NeonDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __orbitDb?: Promise<Db> };

export function isPglite(url = process.env.DATABASE_URL) {
  return !url || url.startsWith("pglite:");
}

export async function createDb(url = process.env.DATABASE_URL): Promise<Db> {
  if (isPglite(url)) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const dir = url?.slice("pglite:".length) || path.join(process.cwd(), ".data/pglite");
    // "pglite:memory" → in-memory (tests); otherwise a directory on disk.
    if (dir !== "memory") (await import("node:fs")).mkdirSync(dir, { recursive: true });
    const client = dir === "memory" ? new PGlite() : new PGlite(dir);
    const db = drizzle({ client, schema });
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    const { ensureDefaults } = await import("./defaults");
    await ensureDefaults(db as unknown as Db);
    return db as unknown as Db;
  }
  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  return drizzle({ client: new Pool({ connectionString: url }), schema });
}

export function getDb(): Promise<Db> {
  globalForDb.__orbitDb ??= createDb().catch((err) => {
    globalForDb.__orbitDb = undefined;
    throw err;
  });
  return globalForDb.__orbitDb;
}

/** Test hook: point the app at a specific database. */
export function setDb(db: Db) {
  globalForDb.__orbitDb = Promise.resolve(db);
}

export { schema };
