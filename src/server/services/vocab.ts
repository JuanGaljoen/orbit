import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { labels, priorities, STATUS_CATEGORIES, statuses, tickets } from "@/db/schema";
import { ConflictError, NotFoundError } from "../errors";
import { color, parse } from "../validation";

export type Status = typeof statuses.$inferSelect;
export type Priority = typeof priorities.$inferSelect;
export type Label = typeof labels.$inferSelect;

export async function listStatuses(): Promise<Status[]> {
  const db = await getDb();
  return db.select().from(statuses).orderBy(asc(statuses.position));
}

export async function listPriorities(): Promise<Priority[]> {
  const db = await getDb();
  return db.select().from(priorities).orderBy(asc(priorities.rank));
}

export async function listLabels(): Promise<Label[]> {
  const db = await getDb();
  return db.select().from(labels).orderBy(asc(labels.name));
}

/** First status of a category (by position) — how the app resolves "move to In Review" etc. */
export async function statusForCategory(category: Status["category"]): Promise<Status> {
  const all = await listStatuses();
  const s = all.find((x) => x.category === category);
  if (!s) throw new NotFoundError(`No status configured for category "${category}"`);
  return s;
}

export async function defaultPriority(): Promise<Priority> {
  const all = await listPriorities();
  // Prefer the middle-ish "Medium"; otherwise the least urgent.
  return all.find((p) => p.name.toLowerCase() === "medium") ?? all[all.length - 1];
}

const statusInput = z.object({
  name: z.string().trim().min(1).max(40),
  category: z.enum(STATUS_CATEGORIES),
  color: color.optional(),
});

export async function createStatus(input: z.input<typeof statusInput>) {
  const data = parse(statusInput, input);
  const db = await getDb();
  const all = await listStatuses();
  const [row] = await db
    .insert(statuses)
    .values({ ...data, position: (all.at(-1)?.position ?? -1) + 1 })
    .returning();
  return row;
}

export async function updateStatus(id: string, input: Partial<z.input<typeof statusInput>>) {
  const data = parse(statusInput.partial(), input);
  const db = await getDb();
  const [row] = await db.update(statuses).set(data).where(eq(statuses.id, id)).returning();
  if (!row) throw new NotFoundError("Status not found");
  return row;
}

export async function reorderStatuses(orderedIds: string[]) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const [position, id] of orderedIds.entries()) {
      await tx.update(statuses).set({ position }).where(eq(statuses.id, id));
    }
  });
}

export async function deleteStatus(id: string) {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(tickets).where(eq(tickets.statusId, id));
  if (n > 0) throw new ConflictError(`Status is used by ${n} ticket(s); move them first`);
  const all = await listStatuses();
  const target = all.find((s) => s.id === id);
  if (!target) throw new NotFoundError("Status not found");
  if (all.filter((s) => s.category === target.category).length === 1)
    throw new ConflictError(`Cannot delete the only "${target.category}" status`);
  await db.delete(statuses).where(eq(statuses.id, id));
}

const priorityInput = z.object({
  name: z.string().trim().min(1).max(40),
  rank: z.number().int().min(0).max(100),
  color: color.optional(),
});

export async function createPriority(input: z.input<typeof priorityInput>) {
  const data = parse(priorityInput, input);
  const db = await getDb();
  const [row] = await db.insert(priorities).values(data).returning();
  return row;
}

export async function updatePriority(id: string, input: Partial<z.input<typeof priorityInput>>) {
  const data = parse(priorityInput.partial(), input);
  const db = await getDb();
  const [row] = await db.update(priorities).set(data).where(eq(priorities.id, id)).returning();
  if (!row) throw new NotFoundError("Priority not found");
  return row;
}

export async function deletePriority(id: string) {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(tickets).where(eq(tickets.priorityId, id));
  if (n > 0) throw new ConflictError(`Priority is used by ${n} ticket(s); change them first`);
  await db.delete(priorities).where(eq(priorities.id, id));
}

const labelInput = z.object({ name: z.string().trim().min(1).max(40), color: color.optional() });

export async function createLabel(input: z.input<typeof labelInput>) {
  const data = parse(labelInput, input);
  const db = await getDb();
  const [existing] = await db.select().from(labels).where(eq(labels.name, data.name));
  if (existing) return existing;
  const [row] = await db.insert(labels).values(data).returning();
  return row;
}

export async function updateLabel(id: string, input: Partial<z.input<typeof labelInput>>) {
  const data = parse(labelInput.partial(), input);
  const db = await getDb();
  const [row] = await db.update(labels).set(data).where(eq(labels.id, id)).returning();
  if (!row) throw new NotFoundError("Label not found");
  return row;
}

export async function deleteLabel(id: string) {
  const db = await getDb();
  await db.delete(labels).where(eq(labels.id, id));
}
