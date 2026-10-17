/**
 * Import a project's tickets from a JSON file (see src/server/services/import.ts for the format).
 *   pnpm import:tickets path/to/export.json
 * Uses DATABASE_URL (or local PGlite). Stop `pnpm dev` first when using PGlite — it's single-process.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });
config();

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: pnpm import:tickets <file.json>");
  const { importProject } = await import("../src/server/services/import");
  const result = await importProject(JSON.parse(readFileSync(file, "utf8")));
  console.log(`Imported ${result.imported} tickets into ${result.projectKey}; next new ticket is ${result.projectKey}-${result.nextNumber}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
