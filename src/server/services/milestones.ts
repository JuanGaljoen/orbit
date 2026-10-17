import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { milestoneDeps, milestones, projects } from "@/db/schema";
import { logActivity, type Actor } from "../activity";
import { ConflictError, InvalidError, NotFoundError } from "../errors";
import { optionalDate, parse } from "../validation";

export type Milestone = typeof milestones.$inferSelect;

const milestoneInput = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).default(""),
  startDate: optionalDate,
  targetDate: optionalDate,
});

export async function createMilestone(input: z.input<typeof milestoneInput>, actor: Actor = "user") {
  const data = parse(milestoneInput, input);
  if (data.startDate && data.targetDate && data.startDate > data.targetDate)
    throw new InvalidError("Start date must be on or before the target date");
  const db = await getDb();
  const [row] = await db.insert(milestones).values(data).returning();
  await logActivity(db, {
    kind: "milestone.created",
    entityType: "milestone",
    entityId: row.id,
    projectId: row.projectId,
    summary: `Created milestone "${row.name}"`,
    actor,
  });
  return row;
}

const milestoneUpdate = milestoneInput.omit({ projectId: true }).partial();

export async function updateMilestone(id: string, input: z.input<typeof milestoneUpdate>) {
  const data = parse(milestoneUpdate, input);
  const db = await getDb();
  const current = await getMilestone(id);
  const start = data.startDate === undefined ? current.startDate : data.startDate;
  const target = data.targetDate === undefined ? current.targetDate : data.targetDate;
  if (start && target && start > target)
    throw new InvalidError("Start date must be on or before the target date");
  const [row] = await db.update(milestones).set(data).where(eq(milestones.id, id)).returning();
  await logActivity(db, {
    kind: "milestone.updated",
    entityType: "milestone",
    entityId: row.id,
    projectId: row.projectId,
    summary: `Updated milestone "${row.name}"`,
  });
  return row;
}

/** Marking complete is an explicit user decision — never inferred from ticket state. */
export async function setMilestoneCompleted(id: string, completed: boolean) {
  const db = await getDb();
  const [row] = await db
    .update(milestones)
    .set({ completedAt: completed ? new Date() : null })
    .where(eq(milestones.id, id))
    .returning();
  if (!row) throw new NotFoundError("Milestone not found");
  await logActivity(db, {
    kind: completed ? "milestone.completed" : "milestone.reopened",
    entityType: "milestone",
    entityId: row.id,
    projectId: row.projectId,
    summary: `${completed ? "Completed" : "Reopened"} milestone "${row.name}"`,
  });
  return row;
}

export async function deleteMilestone(id: string) {
  const db = await getDb();
  const [row] = await db.delete(milestones).where(eq(milestones.id, id)).returning();
  if (!row) throw new NotFoundError("Milestone not found");
  await logActivity(db, {
    kind: "milestone.deleted",
    entityType: "milestone",
    projectId: row.projectId,
    summary: `Deleted milestone "${row.name}"`,
  });
  return row;
}

export async function listMilestones(opts: { projectId?: string } = {}) {
  const db = await getDb();
  const rows = await db
    .select({ m: milestones, projectKey: projects.key, projectName: projects.name })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(opts.projectId ? eq(milestones.projectId, opts.projectId) : undefined)
    .orderBy(asc(milestones.targetDate), asc(milestones.name));
  const ids = rows.map((r) => r.m.id);
  const deps = ids.length
    ? await db.select().from(milestoneDeps).where(inArray(milestoneDeps.milestoneId, ids))
    : [];
  return rows.map((r) => ({
    ...r.m,
    projectKey: r.projectKey,
    projectName: r.projectName,
    dependsOn: deps.filter((d) => d.milestoneId === r.m.id).map((d) => d.dependsOnId),
  }));
}

export async function getMilestone(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(milestones).where(eq(milestones.id, id));
  if (!row) throw new NotFoundError("Milestone not found");
  return row;
}

export async function addMilestoneDep(milestoneId: string, dependsOnId: string) {
  if (milestoneId === dependsOnId) throw new InvalidError("A milestone cannot depend on itself");
  const db = await getDb();
  const all = await db.select().from(milestoneDeps);
  if (reaches(all.map((d) => [d.milestoneId, d.dependsOnId]), dependsOnId, milestoneId))
    throw new ConflictError("That dependency would create a cycle");
  await db.insert(milestoneDeps).values({ milestoneId, dependsOnId }).onConflictDoNothing();
}

export async function removeMilestoneDep(milestoneId: string, dependsOnId: string) {
  const db = await getDb();
  await db
    .delete(milestoneDeps)
    .where(and(eq(milestoneDeps.milestoneId, milestoneId), eq(milestoneDeps.dependsOnId, dependsOnId)));
}

/** Does `from` reach `to` following edges [a → b] ("a depends on b")? */
export function reaches(edges: [string, string][], from: string, to: string): boolean {
  const next = new Map<string, string[]>();
  for (const [a, b] of edges) next.set(a, [...(next.get(a) ?? []), b]);
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const n = stack.pop()!;
    if (n === to) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...(next.get(n) ?? []));
  }
  return false;
}
