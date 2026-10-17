import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { activity, labels, projects, STATUS_CATEGORIES, TICKET_TYPES, ticketDeps, ticketLabels, tickets } from "@/db/schema";
import { ConflictError, InvalidError } from "../errors";
import { parse } from "../validation";
import { PROJECT_KEY_RE } from "./projects";
import { listPriorities, listStatuses } from "./vocab";

/**
 * Bulk import from another tracker (e.g. a Jira export or a reconstructed backlog). Unlike
 * `createTicket`, it keeps the original ticket numbers and historical timestamps, and writes the
 * created/completed events at those times so burn-up history is real. All-or-nothing.
 */
const isoTime = z.string().datetime({ offset: true });

export const importPayload = z.object({
  project: z.object({
    key: z.string().trim().toUpperCase().regex(PROJECT_KEY_RE),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(20_000).default(""),
  }),
  source: z.string().max(200).default("import"),
  tickets: z
    .array(
      z.object({
        number: z.number().int().positive(),
        title: z.string().trim().min(1).max(300),
        type: z.enum(TICKET_TYPES).default("task"),
        status: z.enum(STATUS_CATEGORIES),
        priority: z.string().default("Medium"),
        description: z.string().max(100_000).default(""),
        acceptanceCriteria: z.string().max(50_000).default(""),
        technicalNotes: z.string().max(50_000).default(""),
        labels: z.array(z.string().trim().min(1).max(40)).default([]),
        blockedBy: z.array(z.number().int().positive()).default([]),
        parent: z.number().int().positive().nullable().default(null),
        estimate: z.number().min(0).nullable().default(null),
        createdAt: isoTime.nullable().default(null),
        completedAt: isoTime.nullable().default(null),
      }),
    )
    .min(1),
});
export type ImportPayload = z.input<typeof importPayload>;

export async function importProject(input: ImportPayload) {
  const data = parse(importPayload, input);
  const numbers = data.tickets.map((t) => t.number);
  if (new Set(numbers).size !== numbers.length) throw new InvalidError("Duplicate ticket numbers in import");
  const known = new Set(numbers);
  for (const t of data.tickets) {
    for (const b of [...t.blockedBy, ...(t.parent ? [t.parent] : [])])
      if (!known.has(b)) throw new InvalidError(`${data.project.key}-${t.number} references ${data.project.key}-${b}, which isn't in the import`);
  }

  const [statuses, priorities] = await Promise.all([listStatuses(), listPriorities()]);
  const statusFor = (c: string) => statuses.find((s) => s.category === c)!;
  const priorityFor = (name: string) => {
    const p = priorities.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!p) throw new InvalidError(`Unknown priority "${name}"`);
    return p;
  };
  const now = new Date();
  const db = await getDb();

  return db.transaction(async (tx) => {
    let [project] = await tx.select().from(projects).where(eq(projects.key, data.project.key));
    if (!project)
      [project] = await tx
        .insert(projects)
        .values({ key: data.project.key, name: data.project.name, description: data.project.description })
        .returning();
    const [clash] = await tx
      .select({ number: tickets.number })
      .from(tickets)
      .where(and(eq(tickets.projectId, project.id), sql`${tickets.number} in ${numbers}`));
    if (clash) throw new ConflictError(`${project.key}-${clash.number} already exists`);

    const labelIds = new Map<string, string>();
    for (const name of new Set(data.tickets.flatMap((t) => t.labels))) {
      const [l] = await tx.insert(labels).values({ name }).onConflictDoUpdate({ target: labels.name, set: { name } }).returning();
      labelIds.set(name, l.id);
    }

    const ids = new Map<number, string>();
    for (const t of data.tickets) {
      const created = t.createdAt ? new Date(t.createdAt) : now;
      const status = statusFor(t.status);
      const done = t.status === "done";
      const completed = done ? (t.completedAt ? new Date(t.completedAt) : created) : null;
      const [row] = await tx
        .insert(tickets)
        .values({
          projectId: project.id,
          number: t.number,
          title: t.title,
          type: t.type,
          statusId: status.id,
          priorityId: priorityFor(t.priority).id,
          description: t.description,
          acceptanceCriteria: t.acceptanceCriteria,
          technicalNotes: t.technicalNotes,
          estimate: t.estimate,
          position: t.number,
          createdAt: created,
          updatedAt: completed ?? created,
          statusChangedAt: completed ?? created,
          completedAt: completed,
        })
        .returning({ id: tickets.id });
      ids.set(t.number, row.id);
      for (const name of t.labels) await tx.insert(ticketLabels).values({ ticketId: row.id, labelId: labelIds.get(name)! });

      // History at the original times: created (open), then the move to its current status.
      const base = { entityType: "ticket", entityId: row.id, projectId: project.id, ticketId: row.id, actor: "system" as const };
      await tx.insert(activity).values({
        ...base,
        kind: "ticket.created",
        summary: `Imported ${project.key}-${t.number} from ${data.source}`,
        data: { category: done ? "todo" : t.status },
        createdAt: created,
      });
      if (done)
        await tx.insert(activity).values({
          ...base,
          kind: "ticket.status_changed",
          summary: `→ ${status.name} (${data.source})`,
          data: { toCategory: "done", fromCategory: "todo" },
          createdAt: completed!,
        });
    }

    for (const t of data.tickets) {
      const id = ids.get(t.number)!;
      if (t.parent) await tx.update(tickets).set({ parentId: ids.get(t.parent)! }).where(eq(tickets.id, id));
      for (const b of t.blockedBy) await tx.insert(ticketDeps).values({ ticketId: id, blockedById: ids.get(b)! }).onConflictDoNothing();
    }

    await tx
      .update(projects)
      .set({ ticketSeq: sql`greatest(${projects.ticketSeq}, ${Math.max(...numbers)})` })
      .where(eq(projects.id, project.id));
    await tx.insert(activity).values({
      kind: "project.imported",
      entityType: "project",
      entityId: project.id,
      projectId: project.id,
      summary: `Imported ${data.tickets.length} tickets from ${data.source}`,
      actor: "system",
    });
    return { projectKey: project.key, imported: data.tickets.length, nextNumber: Math.max(...numbers, project.ticketSeq) + 1 };
  });
}
