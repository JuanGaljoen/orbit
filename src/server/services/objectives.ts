import { asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { OBJECTIVE_STATUSES, objectives } from "@/db/schema";
import { logActivity, type Actor } from "../activity";
import { NotFoundError } from "../errors";
import { optionalDate, parse } from "../validation";

export type Objective = typeof objectives.$inferSelect;

const objectiveInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).default(""),
  status: z.enum(OBJECTIVE_STATUSES).default("active"),
  targetDate: optionalDate,
});

export async function createObjective(input: z.input<typeof objectiveInput>, actor: Actor = "user") {
  const data = parse(objectiveInput, input);
  const db = await getDb();
  const [row] = await db.insert(objectives).values(data).returning();
  await logActivity(db, {
    kind: "objective.created",
    entityType: "objective",
    entityId: row.id,
    summary: `Created objective "${row.title}"`,
    actor,
  });
  return row;
}

export async function updateObjective(id: string, input: Partial<z.input<typeof objectiveInput>>) {
  const data = parse(objectiveInput.partial(), input);
  const db = await getDb();
  const [row] = await db.update(objectives).set(data).where(eq(objectives.id, id)).returning();
  if (!row) throw new NotFoundError("Objective not found");
  await logActivity(db, {
    kind: "objective.updated",
    entityType: "objective",
    entityId: row.id,
    summary: `Updated objective "${row.title}"`,
  });
  return row;
}

export async function setObjectiveArchived(id: string, archived: boolean) {
  const db = await getDb();
  const [row] = await db
    .update(objectives)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(objectives.id, id))
    .returning();
  if (!row) throw new NotFoundError("Objective not found");
  return row;
}

/** Projects under it are kept (objective_id set null). */
export async function deleteObjective(id: string) {
  const db = await getDb();
  const [row] = await db.delete(objectives).where(eq(objectives.id, id)).returning();
  if (!row) throw new NotFoundError("Objective not found");
  return row;
}

export async function listObjectives(opts: { includeArchived?: boolean } = {}) {
  const db = await getDb();
  return db
    .select()
    .from(objectives)
    .where(opts.includeArchived ? undefined : isNull(objectives.archivedAt))
    .orderBy(asc(objectives.targetDate), asc(objectives.title));
}

export async function getObjective(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(objectives).where(eq(objectives.id, id));
  if (!row) throw new NotFoundError("Objective not found");
  return row;
}
