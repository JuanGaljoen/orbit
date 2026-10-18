import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import { getDb, type DbOrTx } from "@/db";
import {
  activity,
  comments,
  labels,
  milestones,
  priorities,
  projects,
  STATUS_CATEGORIES,
  statusSuggestions,
  statuses,
  TICKET_TYPES,
  ticketDeps,
  ticketLabels,
  ticketLinks,
  tickets,
  type StatusCategory,
} from "@/db/schema";
import { addDays, today } from "@/lib/dates";
import { logActivity, type Actor } from "../activity";
import { ConflictError, InvalidError, NotFoundError } from "../errors";
import { optionalDate, parse } from "../validation";
import { reaches } from "./milestones";
import { nextTicketNumber } from "./projects";
import { defaultPriority, listStatuses, type Label } from "./vocab";

// ── Shapes ────────────────────────────────────────────────────────────────────

export type TicketSummary = {
  id: string;
  key: string;
  projectId: string;
  projectKey: string;
  number: number;
  title: string;
  type: (typeof TICKET_TYPES)[number];
  status: { id: string; name: string; category: StatusCategory; color: string };
  priority: { id: string; name: string; rank: number; color: string };
  labels: Pick<Label, "id" | "name" | "color">[];
  dueDate: string | null;
  estimate: number | null;
  parentId: string | null;
  milestoneId: string | null;
  milestoneName: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  statusChangedAt: Date;
  completedAt: Date | null;
  archivedAt: Date | null;
  /** Has at least one blocker that isn't done. */
  blocked: boolean;
  overdue: boolean;
  highPriority: boolean;
  subtaskCount: number;
  subtaskDone: number;
};

export const TICKET_KEY_RE = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/;

export function parseTicketKey(key: string): { projectKey: string; number: number } | null {
  const m = TICKET_KEY_RE.exec(key.trim());
  return m ? { projectKey: m[1].toUpperCase(), number: Number(m[2]) } : null;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export const ticketFilter = z.object({
  projectIds: z.array(z.uuid()).optional(),
  statusIds: z.array(z.uuid()).optional(),
  categories: z.array(z.enum(STATUS_CATEGORIES)).optional(),
  priorityIds: z.array(z.uuid()).optional(),
  labelIds: z.array(z.uuid()).optional(),
  types: z.array(z.enum(TICKET_TYPES)).optional(),
  milestoneId: z.uuid().optional(),
  parentId: z.uuid().nullable().optional(),
  due: z.enum(["overdue", "today", "week", "none", "any"]).optional(),
  blocked: z.boolean().optional(),
  q: z.string().trim().max(200).optional(),
  ids: z.array(z.uuid()).optional(),
  includeArchived: z.boolean().optional(),
  archivedOnly: z.boolean().optional(),
  sort: z.enum(["priority", "due", "updated", "created", "key", "status", "position"]).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(2000).optional(),
});
export type TicketFilter = z.input<typeof ticketFilter>;

export async function listTickets(input: TicketFilter = {}): Promise<TicketSummary[]> {
  const f = parse(ticketFilter, input);
  const db = await getDb();
  const t = today();
  const where: SQL[] = [];

  if (f.archivedOnly) where.push(isNotNull(tickets.archivedAt));
  else if (!f.includeArchived) where.push(isNull(tickets.archivedAt));
  if (f.ids) where.push(f.ids.length ? inArray(tickets.id, f.ids) : sql`false`);
  if (f.projectIds?.length) where.push(inArray(tickets.projectId, f.projectIds));
  if (f.statusIds?.length) where.push(inArray(tickets.statusId, f.statusIds));
  if (f.categories?.length) where.push(inArray(statuses.category, f.categories));
  if (f.priorityIds?.length) where.push(inArray(tickets.priorityId, f.priorityIds));
  if (f.types?.length) where.push(inArray(tickets.type, f.types));
  if (f.milestoneId) where.push(eq(tickets.milestoneId, f.milestoneId));
  if (f.parentId !== undefined)
    where.push(f.parentId === null ? isNull(tickets.parentId) : eq(tickets.parentId, f.parentId));
  if (f.labelIds?.length)
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(ticketLabels)
          .where(and(eq(ticketLabels.ticketId, tickets.id), inArray(ticketLabels.labelId, f.labelIds))),
      ),
    );
  if (f.due === "overdue")
    where.push(and(lt(tickets.dueDate, t), sql`${statuses.category} <> 'done'`)!);
  if (f.due === "today") where.push(eq(tickets.dueDate, t));
  if (f.due === "week")
    where.push(and(sql`${tickets.dueDate} >= ${t}`, sql`${tickets.dueDate} <= ${addDays(t, 7)}`)!);
  if (f.due === "none") where.push(isNull(tickets.dueDate));
  if (f.due === "any") where.push(isNotNull(tickets.dueDate));
  if (f.q) {
    const key = parseTicketKey(f.q);
    const like = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(
      or(
        ilike(tickets.title, like),
        ilike(tickets.description, like),
        ilike(tickets.acceptanceCriteria, like),
        key ? and(eq(projects.key, key.projectKey), eq(tickets.number, key.number)) : undefined,
      )!,
    );
  }

  const dir = f.dir === "desc" ? desc : asc;
  const dueNullsLast = sql`${tickets.dueDate} ${sql.raw(f.dir === "desc" ? "desc" : "asc")} nulls last`;
  const order = {
    priority: [dir(priorities.rank), sql`${tickets.dueDate} asc nulls last`],
    due: [dueNullsLast],
    updated: [f.dir === "asc" ? asc(tickets.updatedAt) : desc(tickets.updatedAt)],
    created: [f.dir === "asc" ? asc(tickets.createdAt) : desc(tickets.createdAt)],
    key: [dir(projects.key), dir(tickets.number)],
    status: [dir(statuses.position), asc(priorities.rank)],
    position: [asc(tickets.position), asc(tickets.createdAt)],
  }[f.sort ?? "priority"];

  const rows = await db
    .select({
      t: tickets,
      projectKey: projects.key,
      status: { id: statuses.id, name: statuses.name, category: statuses.category, color: statuses.color },
      priority: { id: priorities.id, name: priorities.name, rank: priorities.rank, color: priorities.color },
      milestoneName: milestones.name,
    })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .innerJoin(statuses, eq(statuses.id, tickets.statusId))
    .innerJoin(priorities, eq(priorities.id, tickets.priorityId))
    .leftJoin(milestones, eq(milestones.id, tickets.milestoneId))
    .where(and(...where))
    .orderBy(...order, asc(tickets.number))
    .limit(f.limit ?? 1000);

  const summaries = await enrich(db, rows);
  return f.blocked === undefined ? summaries : summaries.filter((s) => s.blocked === f.blocked);
}

type Row = {
  t: typeof tickets.$inferSelect;
  projectKey: string;
  status: TicketSummary["status"];
  priority: TicketSummary["priority"];
  milestoneName: string | null;
};

async function enrich(db: DbOrTx, rows: Row[]): Promise<TicketSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.t.id);
  const t = today();
  const [labelRows, blockerRows, subtaskRows] = await Promise.all([
    db
      .select({ ticketId: ticketLabels.ticketId, id: labels.id, name: labels.name, color: labels.color })
      .from(ticketLabels)
      .innerJoin(labels, eq(labels.id, ticketLabels.labelId))
      .where(inArray(ticketLabels.ticketId, ids)),
    db
      .select({ ticketId: ticketDeps.ticketId, category: statuses.category })
      .from(ticketDeps)
      .innerJoin(tickets, eq(tickets.id, ticketDeps.blockedById))
      .innerJoin(statuses, eq(statuses.id, tickets.statusId))
      .where(and(inArray(ticketDeps.ticketId, ids), isNull(tickets.archivedAt))),
    db
      .select({ parentId: tickets.parentId, category: statuses.category })
      .from(tickets)
      .innerJoin(statuses, eq(statuses.id, tickets.statusId))
      .where(and(inArray(tickets.parentId, ids), isNull(tickets.archivedAt))),
  ]);
  return rows.map(({ t: row, projectKey, status, priority, milestoneName }) => {
    const subs = subtaskRows.filter((s) => s.parentId === row.id);
    return {
      id: row.id,
      key: `${projectKey}-${row.number}`,
      projectId: row.projectId,
      projectKey,
      number: row.number,
      title: row.title,
      type: row.type,
      status,
      priority,
      labels: labelRows.filter((l) => l.ticketId === row.id).map(({ id, name, color }) => ({ id, name, color })),
      dueDate: row.dueDate,
      estimate: row.estimate,
      parentId: row.parentId,
      milestoneId: row.milestoneId,
      milestoneName,
      position: row.position,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      statusChangedAt: row.statusChangedAt,
      completedAt: row.completedAt,
      archivedAt: row.archivedAt,
      blocked: blockerRows.some((b) => b.ticketId === row.id && b.category !== "done"),
      overdue: !!row.dueDate && row.dueDate < t && status.category !== "done",
      highPriority: priority.rank <= 1,
      subtaskCount: subs.length,
      subtaskDone: subs.filter((s) => s.category === "done").length,
    };
  });
}

export async function getTicketByKey(key: string) {
  const parsed = parseTicketKey(key);
  if (!parsed) throw new NotFoundError(`"${key}" is not a ticket key`);
  const db = await getDb();
  const [row] = await db
    .select({ id: tickets.id })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(and(eq(projects.key, parsed.projectKey), eq(tickets.number, parsed.number)));
  if (!row) throw new NotFoundError(`Ticket ${key.toUpperCase()} not found`);
  return getTicket(row.id);
}

export async function getTicketSummary(id: string): Promise<TicketSummary> {
  const [s] = await listTickets({ ids: [id], includeArchived: true });
  if (!s) throw new NotFoundError("Ticket not found");
  return s;
}

export async function getTicket(id: string) {
  const db = await getDb();
  const summary = await getTicketSummary(id);
  const [full] = await db.select().from(tickets).where(eq(tickets.id, id));

  const [blockerIds, blockingIds, subtaskIds, commentRows, linkRows, history, suggestions] =
    await Promise.all([
      db.select({ id: ticketDeps.blockedById }).from(ticketDeps).where(eq(ticketDeps.ticketId, id)),
      db.select({ id: ticketDeps.ticketId }).from(ticketDeps).where(eq(ticketDeps.blockedById, id)),
      db.select({ id: tickets.id }).from(tickets).where(eq(tickets.parentId, id)),
      db.select().from(comments).where(eq(comments.ticketId, id)).orderBy(asc(comments.createdAt)),
      db.select().from(ticketLinks).where(eq(ticketLinks.ticketId, id)).orderBy(desc(ticketLinks.createdAt)),
      db.select().from(activity).where(eq(activity.ticketId, id)).orderBy(desc(activity.createdAt)).limit(100),
      db
        .select()
        .from(statusSuggestions)
        .where(and(eq(statusSuggestions.ticketId, id), eq(statusSuggestions.state, "pending")))
        .orderBy(desc(statusSuggestions.createdAt)),
    ]);

  const related = await listTickets({
    ids: [...blockerIds, ...blockingIds, ...subtaskIds].map((r) => r.id).concat(full.parentId ?? []),
    includeArchived: true,
    sort: "key",
  });
  const pick = (rs: { id: string }[]) => related.filter((r) => rs.some((x) => x.id === r.id));

  return {
    ...summary,
    description: full.description,
    acceptanceCriteria: full.acceptanceCriteria,
    technicalNotes: full.technicalNotes,
    parent: related.find((r) => r.id === full.parentId) ?? null,
    blockers: pick(blockerIds),
    blocking: pick(blockingIds),
    subtasks: pick(subtaskIds),
    comments: commentRows,
    links: linkRows,
    history,
    suggestions,
  };
}
export type TicketDetail = Awaited<ReturnType<typeof getTicket>>;

// ── Mutations ─────────────────────────────────────────────────────────────────

const ticketFields = z.object({
  title: z.string().trim().min(1).max(300),
  type: z.enum(TICKET_TYPES),
  statusId: z.uuid(),
  priorityId: z.uuid(),
  description: z.string().max(100_000),
  acceptanceCriteria: z.string().max(50_000),
  technicalNotes: z.string().max(50_000),
  dueDate: optionalDate,
  estimate: z.number().min(0).max(10_000).nullable().optional(),
  parentId: z.uuid().nullable().optional(),
  milestoneId: z.uuid().nullable().optional(),
  labelIds: z.array(z.uuid()).optional(),
});

const createTicketInput = ticketFields.partial().extend({
  projectId: z.uuid(),
  title: ticketFields.shape.title,
  blockedByIds: z.array(z.uuid()).optional(),
});
export type CreateTicketInput = z.input<typeof createTicketInput>;

export async function createTicket(input: CreateTicketInput, actor: Actor = "user") {
  const data = parse(createTicketInput, input);
  const db = await getDb();
  const statusId = data.statusId ?? (await listStatuses())[0]?.id;
  const priorityId = data.priorityId ?? (await defaultPriority()).id;
  if (!statusId || !priorityId) throw new InvalidError("Statuses and priorities must be configured");
  await assertRelations(db, data.projectId, { parentId: data.parentId, milestoneId: data.milestoneId });

  const id = await db.transaction(async (tx) => {
    const { number, key } = await nextTicketNumber(tx, data.projectId);
    const [{ pos }] = await tx
      .select({ pos: max(tickets.position) })
      .from(tickets)
      .where(eq(tickets.statusId, statusId));
    const [row] = await tx
      .insert(tickets)
      .values({
        projectId: data.projectId,
        number,
        title: data.title,
        type: data.type ?? "task",
        statusId,
        priorityId,
        description: data.description ?? "",
        acceptanceCriteria: data.acceptanceCriteria ?? "",
        technicalNotes: data.technicalNotes ?? "",
        dueDate: data.dueDate ?? null,
        estimate: data.estimate ?? null,
        parentId: data.parentId ?? null,
        milestoneId: data.milestoneId ?? null,
        position: (pos ?? 0) + 1,
        completedAt: (await categoryOf(tx, statusId)) === "done" ? new Date() : null,
      })
      .returning();
    if (data.labelIds?.length)
      await tx.insert(ticketLabels).values(data.labelIds.map((labelId) => ({ ticketId: row.id, labelId })));
    for (const blockedById of data.blockedByIds ?? []) await insertDep(tx, row.id, blockedById);
    await logActivity(tx, {
      kind: "ticket.created",
      entityType: "ticket",
      entityId: row.id,
      projectId: row.projectId,
      ticketId: row.id,
      summary: `Created ${key}-${number} — ${row.title}`,
      data: { statusId, category: await categoryOf(tx, statusId) },
      actor,
    });
    return row.id;
  });
  return getTicketSummary(id);
}

const updateTicketInput = ticketFields.partial();

const FIELD_LABEL: Record<string, string> = {
  priorityId: "priority",
  milestoneId: "milestone",
  parentId: "parent",
  dueDate: "due date",
  acceptanceCriteria: "acceptance criteria",
  technicalNotes: "technical notes",
};
export type UpdateTicketInput = z.input<typeof updateTicketInput>;

export async function updateTicket(id: string, input: UpdateTicketInput, actor: Actor = "user") {
  const data = parse(updateTicketInput, input);
  const db = await getDb();
  const [current] = await db.select().from(tickets).where(eq(tickets.id, id));
  if (!current) throw new NotFoundError("Ticket not found");
  await assertRelations(db, current.projectId, {
    parentId: data.parentId,
    milestoneId: data.milestoneId,
    selfId: id,
  });
  const { labelIds, ...fields } = data;

  await db.transaction(async (tx) => {
    const patch: Partial<typeof tickets.$inferInsert> = { ...fields };
    if (fields.statusId && fields.statusId !== current.statusId) {
      Object.assign(patch, await statusTransition(tx, current, fields.statusId, actor));
    }
    const changed = Object.keys(fields).filter(
      (k) => k !== "statusId" && fields[k as keyof typeof fields] !== current[k as keyof typeof current],
    );
    if (Object.keys(patch).length) await tx.update(tickets).set(patch).where(eq(tickets.id, id));
    if (labelIds) {
      await tx.delete(ticketLabels).where(eq(ticketLabels.ticketId, id));
      if (labelIds.length)
        await tx.insert(ticketLabels).values(labelIds.map((labelId) => ({ ticketId: id, labelId })));
      changed.push("labels");
    }
    if (changed.length)
      await logActivity(tx, {
        kind: "ticket.updated",
        entityType: "ticket",
        entityId: id,
        projectId: current.projectId,
        ticketId: id,
        summary: `Updated ${changed.map((f) => FIELD_LABEL[f] ?? f).join(", ")}`,
        data: { fields: changed },
        actor,
      });
  });
  return getTicketSummary(id);
}

/** Moves a ticket within/between board columns. `position` is a fractional sort key. */
export async function moveTicket(id: string, statusId: string, position: number, actor: Actor = "user") {
  const db = await getDb();
  const [current] = await db.select().from(tickets).where(eq(tickets.id, id));
  if (!current) throw new NotFoundError("Ticket not found");
  await db.transaction(async (tx) => {
    const patch: Partial<typeof tickets.$inferInsert> = { position };
    if (statusId !== current.statusId) Object.assign(patch, await statusTransition(tx, current, statusId, actor));
    await tx.update(tickets).set(patch).where(eq(tickets.id, id));
  });
  return getTicketSummary(id);
}

async function categoryOf(db: DbOrTx, statusId: string): Promise<StatusCategory> {
  const [s] = await db.select({ category: statuses.category }).from(statuses).where(eq(statuses.id, statusId));
  if (!s) throw new InvalidError("Unknown status");
  return s.category;
}

async function statusTransition(
  tx: DbOrTx,
  current: typeof tickets.$inferSelect,
  toStatusId: string,
  actor: Actor,
) {
  const all = await tx.select().from(statuses);
  const from = all.find((s) => s.id === current.statusId)!;
  const to = all.find((s) => s.id === toStatusId);
  if (!to) throw new InvalidError("Unknown status");
  const now = new Date();
  await logActivity(tx, {
    kind: "ticket.status_changed",
    entityType: "ticket",
    entityId: current.id,
    projectId: current.projectId,
    ticketId: current.id,
    summary: `${from.name} → ${to.name}`,
    data: { from: from.id, to: to.id, fromCategory: from.category, toCategory: to.category },
    actor,
  });
  return {
    statusId: to.id,
    statusChangedAt: now,
    completedAt: to.category === "done" ? (from.category === "done" ? current.completedAt : now) : null,
  };
}

async function assertRelations(
  db: DbOrTx,
  projectId: string,
  rel: { parentId?: string | null; milestoneId?: string | null; selfId?: string },
) {
  if (rel.parentId) {
    if (rel.parentId === rel.selfId) throw new InvalidError("A ticket cannot be its own parent");
    const [parent] = await db.select().from(tickets).where(eq(tickets.id, rel.parentId));
    if (!parent) throw new InvalidError("Parent ticket not found");
    if (parent.projectId !== projectId) throw new InvalidError("Parent must be in the same project");
    // One level of nesting keeps progress maths unambiguous (leaf = no subtasks).
    if (parent.parentId) throw new InvalidError("Subtasks cannot have their own subtasks");
    if (rel.selfId) {
      const [child] = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.parentId, rel.selfId));
      if (child) throw new InvalidError("A ticket with subtasks cannot become a subtask");
    }
  }
  if (rel.milestoneId) {
    const [m] = await db.select().from(milestones).where(eq(milestones.id, rel.milestoneId));
    if (!m || m.projectId !== projectId) throw new InvalidError("Milestone must belong to the same project");
  }
}

export async function setTicketArchived(id: string, archived: boolean, actor: Actor = "user") {
  const db = await getDb();
  const [row] = await db
    .update(tickets)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(tickets.id, id))
    .returning();
  if (!row) throw new NotFoundError("Ticket not found");
  await logActivity(db, {
    kind: archived ? "ticket.archived" : "ticket.unarchived",
    entityType: "ticket",
    entityId: id,
    projectId: row.projectId,
    ticketId: id,
    summary: archived ? "Archived" : "Restored from archive",
    actor,
  });
}

export async function deleteTicket(id: string) {
  const db = await getDb();
  const [row] = await db.delete(tickets).where(eq(tickets.id, id)).returning();
  if (!row) throw new NotFoundError("Ticket not found");
  const [p] = await db.select({ key: projects.key }).from(projects).where(eq(projects.id, row.projectId));
  await logActivity(db, {
    kind: "ticket.deleted",
    entityType: "ticket",
    projectId: row.projectId,
    summary: `Deleted ${p?.key}-${row.number} — ${row.title}`,
  });
}

// ── Dependencies ──────────────────────────────────────────────────────────────

async function insertDep(tx: DbOrTx, ticketId: string, blockedById: string) {
  if (ticketId === blockedById) throw new InvalidError("A ticket cannot block itself");
  const edges = await tx.select().from(ticketDeps);
  if (reaches(edges.map((e) => [e.ticketId, e.blockedById]), blockedById, ticketId))
    throw new ConflictError("That dependency would create a cycle");
  await tx.insert(ticketDeps).values({ ticketId, blockedById }).onConflictDoNothing();
}

export async function addDependency(ticketId: string, blockedById: string, actor: Actor = "user") {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await insertDep(tx, ticketId, blockedById);
    const blocker = await getTicketSummaryTx(tx, blockedById);
    const [t] = await tx.select({ projectId: tickets.projectId }).from(tickets).where(eq(tickets.id, ticketId));
    await logActivity(tx, {
      kind: "ticket.dependency_added",
      entityType: "ticket",
      entityId: ticketId,
      projectId: t?.projectId,
      ticketId,
      summary: `Blocked by ${blocker}`,
      data: { blockedById },
      actor,
    });
  });
}

export async function removeDependency(ticketId: string, blockedById: string, actor: Actor = "user") {
  const db = await getDb();
  await db
    .delete(ticketDeps)
    .where(and(eq(ticketDeps.ticketId, ticketId), eq(ticketDeps.blockedById, blockedById)));
  const blocker = await getTicketSummaryTx(db, blockedById);
  await logActivity(db, {
    kind: "ticket.dependency_removed",
    entityType: "ticket",
    entityId: ticketId,
    ticketId,
    summary: `No longer blocked by ${blocker}`,
    actor,
  });
}

async function getTicketSummaryTx(db: DbOrTx, id: string): Promise<string> {
  const [r] = await db
    .select({ key: projects.key, number: tickets.number })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(eq(tickets.id, id));
  if (!r) throw new NotFoundError("Ticket not found");
  return `${r.key}-${r.number}`;
}

// ── Comments ──────────────────────────────────────────────────────────────────

const commentBody = z.string().trim().min(1).max(50_000);

export async function addComment(ticketId: string, body: string, author: "user" | "ai" | "system" = "user") {
  const text = parse(commentBody, body);
  const db = await getDb();
  const [t] = await db.select({ projectId: tickets.projectId }).from(tickets).where(eq(tickets.id, ticketId));
  if (!t) throw new NotFoundError("Ticket not found");
  const [row] = await db.insert(comments).values({ ticketId, body: text, author }).returning();
  await db.update(tickets).set({ updatedAt: new Date() }).where(eq(tickets.id, ticketId));
  await logActivity(db, {
    kind: "ticket.commented",
    entityType: "ticket",
    entityId: ticketId,
    projectId: t.projectId,
    ticketId,
    summary: "Commented",
    data: { commentId: row.id },
    actor: author === "user" ? "user" : author,
  });
  return row;
}

export async function updateComment(id: string, body: string) {
  const text = parse(commentBody, body);
  const db = await getDb();
  const [row] = await db.update(comments).set({ body: text }).where(eq(comments.id, id)).returning();
  if (!row) throw new NotFoundError("Comment not found");
  return row;
}

export async function deleteComment(id: string) {
  const db = await getDb();
  await db.delete(comments).where(eq(comments.id, id));
}

// ── Bulk ──────────────────────────────────────────────────────────────────────

const bulkInput = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  statusId: z.uuid().optional(),
  priorityId: z.uuid().optional(),
  addLabelId: z.uuid().optional(),
  milestoneId: z.uuid().nullable().optional(),
  archive: z.boolean().optional(),
});

/** Applies the same change to many tickets. Each ticket still gets its own history entry. */
export async function bulkUpdateTickets(input: z.input<typeof bulkInput>, actor: Actor = "user") {
  const data = parse(bulkInput, input);
  for (const id of data.ids) {
    if (data.statusId || data.priorityId || data.milestoneId !== undefined)
      await updateTicket(
        id,
        {
          ...(data.statusId && { statusId: data.statusId }),
          ...(data.priorityId && { priorityId: data.priorityId }),
          ...(data.milestoneId !== undefined && { milestoneId: data.milestoneId }),
        },
        actor,
      );
    if (data.addLabelId) {
      const db = await getDb();
      await db.insert(ticketLabels).values({ ticketId: id, labelId: data.addLabelId }).onConflictDoNothing();
    }
    if (data.archive !== undefined) await setTicketArchived(id, data.archive, actor);
  }
  return data.ids.length;
}

export async function bulkDeleteTickets(ids: string[]) {
  for (const id of parse(z.array(z.uuid()).min(1).max(500), ids)) await deleteTicket(id);
  return ids.length;
}
