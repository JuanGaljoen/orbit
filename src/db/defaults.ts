import { priorities, statuses } from "./schema";
import type { Db } from "./index";

/** The vocabularies the app cannot run without. Inserted once; user edits are never overwritten. */
export const DEFAULT_STATUSES = [
  { name: "Backlog", category: "backlog", position: 0, color: "#71717a" },
  { name: "Todo", category: "todo", position: 1, color: "#a1a1aa" },
  { name: "In Progress", category: "in_progress", position: 2, color: "#3b82f6" },
  { name: "In Review", category: "in_review", position: 3, color: "#a855f7" },
  { name: "Done", category: "done", position: 4, color: "#22c55e" },
] as const;

export const DEFAULT_PRIORITIES = [
  { name: "Urgent", rank: 0, color: "#ef4444" },
  { name: "High", rank: 1, color: "#f97316" },
  { name: "Medium", rank: 2, color: "#eab308" },
  { name: "Low", rank: 3, color: "#71717a" },
] as const;

export async function ensureDefaults(db: Db) {
  const [s] = await db.select({ id: statuses.id }).from(statuses).limit(1);
  if (!s) await db.insert(statuses).values([...DEFAULT_STATUSES]);
  const [p] = await db.select({ id: priorities.id }).from(priorities).limit(1);
  if (!p) await db.insert(priorities).values([...DEFAULT_PRIORITIES]);
}
