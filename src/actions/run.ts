import "server-only";
import { refresh } from "next/cache";
import { requireUser } from "@/server/auth";
import { isDomainError } from "@/server/errors";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Every server action goes through here: authenticate, run the service, refresh the router.
 * Domain errors become `{ ok: false }` for the UI; anything else is a real bug and throws.
 */
export async function run<T>(fn: () => Promise<T>, opts: { refresh?: boolean } = {}): Promise<ActionResult<T>> {
  await requireUser();
  try {
    const data = await fn();
    if (opts.refresh !== false) refresh();
    return { ok: true, data };
  } catch (err) {
    if (isDomainError(err)) return { ok: false, error: err.message };
    throw err;
  }
}
