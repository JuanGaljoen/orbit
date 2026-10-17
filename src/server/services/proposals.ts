import { desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { aiProposals, milestones, projects, TICKET_TYPES, tickets } from "@/db/schema";
import { logActivity } from "../activity";
import { ConflictError, InvalidError, NotFoundError } from "../errors";
import { isoDate, parse } from "../validation";
import { createMilestone } from "./milestones";
import { createObjective } from "./objectives";
import { createProject, PROJECT_KEY_RE } from "./projects";
import { addDependency, createTicket, getTicketByKey, updateTicket } from "./tickets";
import { createLabel, listLabels, listPriorities, listStatuses } from "./vocab";

/**
 * AI-proposed changes. The assistant can only *write proposals*; the user reviews, edits and then
 * applies them. References between items use `ref` names (e.g. "t1"); anything else is resolved as
 * an existing key (project "ORB", ticket "ORB-12") or id.
 */
const ref = z.string().trim().min(1).max(60);
const opt = <T extends z.ZodType>(s: T) => s.nullable().optional();

export const proposalItem = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_objective"),
    ref,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).default(""),
    targetDate: opt(isoDate),
  }),
  z.object({
    type: z.literal("create_project"),
    ref,
    key: z.string().trim().toUpperCase().regex(PROJECT_KEY_RE),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(20_000).default(""),
    targetDate: opt(isoDate),
    objective: opt(ref).describe("ref of a create_objective item, or an existing objective id"),
  }),
  z.object({
    type: z.literal("create_milestone"),
    ref,
    project: ref.describe("existing project key, or ref of a create_project item"),
    name: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).default(""),
    startDate: opt(isoDate),
    targetDate: opt(isoDate),
  }),
  z.object({
    type: z.literal("create_ticket"),
    ref,
    project: ref.describe("existing project key, or ref of a create_project item"),
    title: z.string().trim().min(1).max(300),
    ticketType: z.enum(TICKET_TYPES).default("task"),
    priority: z.string().default("Medium").describe("priority name, e.g. Urgent, High, Medium, Low"),
    description: z.string().max(50_000).default(""),
    acceptanceCriteria: z.string().max(50_000).default(""),
    technicalNotes: z.string().max(50_000).default(""),
    estimate: opt(z.number().min(0).max(1000)),
    dueDate: opt(isoDate),
    milestone: opt(ref).describe("ref of a create_milestone item, or existing milestone id"),
    parent: opt(ref).describe("ref of a create_ticket item, or existing ticket key"),
    blockedBy: z.array(ref).default([]).describe("refs or existing ticket keys that block this ticket"),
    labels: z.array(z.string().trim().min(1).max(40)).default([]),
    rationale: z.string().max(2000).default("").describe("why this ticket / priority / dependency"),
  }),
  z.object({
    type: z.literal("update_ticket"),
    key: z.string().describe("existing ticket key"),
    title: opt(z.string().trim().min(1).max(300)),
    description: opt(z.string().max(50_000)),
    acceptanceCriteria: opt(z.string().max(50_000)),
    technicalNotes: opt(z.string().max(50_000)),
    priority: opt(z.string()),
    estimate: opt(z.number().min(0).max(1000)),
    dueDate: opt(isoDate),
    rationale: z.string().max(2000).default(""),
  }),
  z.object({
    type: z.literal("add_dependency"),
    ticket: ref.describe("ref or existing ticket key that is blocked"),
    blockedBy: ref.describe("ref or existing ticket key that blocks it"),
  }),
]);
export type ProposalItem = z.output<typeof proposalItem>;

export const proposalPayload = z.object({
  summary: z.string().max(5000).default(""),
  items: z.array(proposalItem).min(1).max(100),
});
export type ProposalPayload = z.output<typeof proposalPayload>;

export type Proposal = Omit<typeof aiProposals.$inferSelect, "payload"> & { payload: ProposalPayload };

export async function createProposal(input: { title: string; prompt?: string; payload: unknown }) {
  const payload = parse(proposalPayload, input.payload);
  await validateReferences(payload);
  const db = await getDb();
  const [row] = await db
    .insert(aiProposals)
    .values({ title: input.title.slice(0, 200), prompt: input.prompt ?? "", payload })
    .returning();
  return row as Proposal;
}

export async function listProposals(state?: "pending" | "applied" | "discarded") {
  const db = await getDb();
  const rows = await db
    .select()
    .from(aiProposals)
    .where(state ? eq(aiProposals.state, state) : undefined)
    .orderBy(desc(aiProposals.createdAt))
    .limit(50);
  return rows as Proposal[];
}

export async function getProposal(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(aiProposals).where(eq(aiProposals.id, id));
  if (!row) throw new NotFoundError("Proposal not found");
  return row as Proposal;
}

/** The user edited the proposal before applying. */
export async function updateProposal(id: string, payload: unknown) {
  const p = await getProposal(id);
  if (p.state !== "pending") throw new ConflictError("Only pending proposals can be edited");
  const data = parse(proposalPayload, payload);
  await validateReferences(data);
  const db = await getDb();
  await db.update(aiProposals).set({ payload: data }).where(eq(aiProposals.id, id));
}

export async function discardProposal(id: string) {
  const p = await getProposal(id);
  if (p.state !== "pending") throw new ConflictError("Proposal already resolved");
  const db = await getDb();
  await db.update(aiProposals).set({ state: "discarded", resolvedAt: new Date() }).where(eq(aiProposals.id, id));
}

/** Checks every reference resolves to an earlier item or an existing entity — before anything is written. */
async function validateReferences(payload: ProposalPayload) {
  const db = await getDb();
  const [projectRows, ticketRows, milestoneRows, priorities] = await Promise.all([
    db.select({ key: projects.key }).from(projects),
    db
      .select({ key: projects.key, number: tickets.number })
      .from(tickets)
      .innerJoin(projects, eq(projects.id, tickets.projectId))
      .where(isNull(tickets.archivedAt)),
    db.select({ id: milestones.id }).from(milestones),
    listPriorities(),
  ]);
  const projectKeys = new Set(projectRows.map((p) => p.key));
  const ticketKeys = new Set(ticketRows.map((t) => `${t.key}-${t.number}`));
  const milestoneIds = new Set(milestoneRows.map((m) => m.id));
  const refs = new Map<string, ProposalItem["type"]>();
  const fail = (i: number, msg: string): never => {
    throw new InvalidError(`Item ${i + 1}: ${msg}`);
  };
  const isTicket = (r: string) => refs.get(r) === "create_ticket" || ticketKeys.has(r.toUpperCase());

  payload.items.forEach((item, i) => {
    if ("ref" in item) {
      if (refs.has(item.ref)) fail(i, `duplicate ref "${item.ref}"`);
    }
    switch (item.type) {
      case "create_project":
        if (projectKeys.has(item.key)) fail(i, `project key ${item.key} already exists`);
        if (item.objective && refs.get(item.objective) !== "create_objective" && !z.uuid().safeParse(item.objective).success)
          fail(i, `unknown objective "${item.objective}"`);
        break;
      case "create_milestone":
        if (refs.get(item.project) !== "create_project" && !projectKeys.has(item.project.toUpperCase()))
          fail(i, `unknown project "${item.project}"`);
        break;
      case "create_ticket":
        if (refs.get(item.project) !== "create_project" && !projectKeys.has(item.project.toUpperCase()))
          fail(i, `unknown project "${item.project}"`);
        if (item.milestone && refs.get(item.milestone) !== "create_milestone" && !milestoneIds.has(item.milestone))
          fail(i, `unknown milestone "${item.milestone}"`);
        if (item.parent && !isTicket(item.parent)) fail(i, `unknown parent "${item.parent}"`);
        for (const b of item.blockedBy) if (!isTicket(b)) fail(i, `unknown blocker "${b}"`);
        if (!priorities.some((p) => p.name.toLowerCase() === item.priority.toLowerCase()))
          fail(i, `unknown priority "${item.priority}"`);
        break;
      case "update_ticket":
        if (!ticketKeys.has(item.key.toUpperCase())) fail(i, `unknown ticket ${item.key}`);
        if (item.priority && !priorities.some((p) => p.name.toLowerCase() === item.priority!.toLowerCase()))
          fail(i, `unknown priority "${item.priority}"`);
        break;
      case "add_dependency":
        if (!isTicket(item.ticket)) fail(i, `unknown ticket "${item.ticket}"`);
        if (!isTicket(item.blockedBy)) fail(i, `unknown blocker "${item.blockedBy}"`);
        break;
    }
    if ("ref" in item) refs.set(item.ref, item.type);
  });
}

/**
 * Applies a reviewed proposal in order. References are re-validated first so a stale proposal
 * fails before writing; if an item still fails mid-way, the items applied so far are recorded.
 */
export async function applyProposal(id: string) {
  const p = await getProposal(id);
  if (p.state !== "pending") throw new ConflictError("Proposal already resolved");
  const payload = parse(proposalPayload, p.payload);
  await validateReferences(payload);

  const [priorities, statuses, labels] = await Promise.all([listPriorities(), listStatuses(), listLabels()]);
  const priorityId = (name: string) => priorities.find((x) => x.name.toLowerCase() === name.toLowerCase())!.id;
  const backlog = statuses.find((s) => s.category === "backlog") ?? statuses[0];
  const created = new Map<string, { id: string; key?: string }>();
  const applied: string[] = [];

  const projectId = async (r: string) => created.get(r)?.id ?? (await getProjectIdByKey(r));
  const ticketId = async (r: string) => created.get(r)?.id ?? (await getTicketByKey(r)).id;
  const labelIds = async (names: string[]) => {
    const ids: string[] = [];
    for (const n of names) {
      const existing = labels.find((l) => l.name.toLowerCase() === n.toLowerCase());
      ids.push(existing?.id ?? (await createLabel({ name: n })).id);
    }
    return ids;
  };

  try {
    for (const item of payload.items) {
      switch (item.type) {
        case "create_objective": {
          const o = await createObjective({ title: item.title, description: item.description, targetDate: item.targetDate }, "ai");
          created.set(item.ref, { id: o.id });
          applied.push(`Objective "${o.title}"`);
          break;
        }
        case "create_project": {
          const objectiveId = item.objective ? (created.get(item.objective)?.id ?? item.objective) : null;
          const pr = await createProject({ key: item.key, name: item.name, description: item.description, targetDate: item.targetDate, objectiveId }, "ai");
          created.set(item.ref, { id: pr.id, key: pr.key });
          applied.push(`Project ${pr.key}`);
          break;
        }
        case "create_milestone": {
          const m = await createMilestone(
            { projectId: await projectId(item.project), name: item.name, description: item.description, startDate: item.startDate, targetDate: item.targetDate },
            "ai",
          );
          created.set(item.ref, { id: m.id });
          applied.push(`Milestone "${m.name}"`);
          break;
        }
        case "create_ticket": {
          const t = await createTicket(
            {
              projectId: await projectId(item.project),
              title: item.title,
              type: item.ticketType,
              statusId: backlog.id,
              priorityId: priorityId(item.priority),
              description: item.description,
              acceptanceCriteria: item.acceptanceCriteria,
              technicalNotes: item.technicalNotes,
              estimate: item.estimate ?? null,
              dueDate: item.dueDate ?? null,
              milestoneId: item.milestone ? (created.get(item.milestone)?.id ?? item.milestone) : null,
              parentId: item.parent ? await ticketId(item.parent) : null,
              labelIds: await labelIds(item.labels),
            },
            "ai",
          );
          for (const b of item.blockedBy) await addDependency(t.id, await ticketId(b), "ai");
          created.set(item.ref, { id: t.id, key: t.key });
          applied.push(`Ticket ${t.key}`);
          break;
        }
        case "update_ticket": {
          const t = await getTicketByKey(item.key);
          await updateTicket(
            t.id,
            {
              ...(item.title != null && { title: item.title }),
              ...(item.description != null && { description: item.description }),
              ...(item.acceptanceCriteria != null && { acceptanceCriteria: item.acceptanceCriteria }),
              ...(item.technicalNotes != null && { technicalNotes: item.technicalNotes }),
              ...(item.priority != null && { priorityId: priorityId(item.priority) }),
              ...(item.estimate !== undefined && { estimate: item.estimate }),
              ...(item.dueDate !== undefined && { dueDate: item.dueDate }),
            },
            "ai",
          );
          applied.push(`Updated ${t.key}`);
          break;
        }
        case "add_dependency":
          await addDependency(await ticketId(item.ticket), await ticketId(item.blockedBy), "ai");
          applied.push(`Dependency ${item.blockedBy} → ${item.ticket}`);
          break;
      }
    }
  } catch (err) {
    await recordResult(id, "pending", { applied, error: err instanceof Error ? err.message : String(err) });
    throw new InvalidError(
      `Stopped after ${applied.length} of ${payload.items.length} item(s): ${err instanceof Error ? err.message : err}. Applied: ${applied.join(", ") || "nothing"}.`,
    );
  }
  await recordResult(id, "applied", { applied, created: Object.fromEntries([...created].map(([k, v]) => [k, v.key ?? v.id])) });
  const db = await getDb();
  await logActivity(db, { kind: "proposal.applied", entityType: "proposal", entityId: id, summary: `Applied AI proposal "${p.title}" (${applied.length} changes)`, actor: "user" });
  return applied;
}

async function recordResult(id: string, state: "pending" | "applied", result: unknown) {
  const db = await getDb();
  await db
    .update(aiProposals)
    .set({ state, result, resolvedAt: state === "applied" ? new Date() : null })
    .where(eq(aiProposals.id, id));
}

async function getProjectIdByKey(key: string) {
  const db = await getDb();
  const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.key, key.toUpperCase()));
  if (!row) throw new NotFoundError(`Project ${key} not found`);
  return row.id;
}

/** Word-overlap similarity against existing ticket titles — flags likely duplicates for review. */
export async function findSimilarTickets(title: string, limit = 3) {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const target = words(title);
  if (!target.size) return [];
  const db = await getDb();
  const rows = await db
    .select({ title: tickets.title, number: tickets.number, key: projects.key })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(isNull(tickets.archivedAt));
  return rows
    .map((r) => {
      const w = words(r.title);
      const inter = [...target].filter((x) => w.has(x)).length;
      return { key: `${r.key}-${r.number}`, title: r.title, score: inter / (target.size + w.size - inter || 1) };
    })
    .filter((r) => r.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

