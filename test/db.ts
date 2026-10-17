import { beforeEach } from "vitest";
import { createDb, setDb, type Db } from "@/db";

/** Fresh in-memory Postgres (PGlite) per test, migrated and seeded with default vocabularies. */
export function useTestDb() {
  const ref = {} as { db: Db };
  beforeEach(async () => {
    ref.db = await createDb("pglite:memory");
    setDb(ref.db);
  });
  return ref;
}
