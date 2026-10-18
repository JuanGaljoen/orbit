import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { milestones, STATUS_CATEGORIES, TICKET_TYPES } from "@/db/schema";
import { InvalidError, NotFoundError } from "../errors";
import { optionalDate, parse } from "../validation";
import { getProjectByKey } from "./projects";
import {
  addDependency,
  createTicket,
  getTicketByKey,
  removeDependency,
  setTicketArchived,
  updateTicket,
  type UpdateTicketInput,
} from "./tickets";
import { createLabel, listLabels, listPriorities, listStatuses } from "./vocab";

/**
 * The write surface for /api/v1: the same ticket services, addressed the way an agent naturally
 * refers to things — keys ("RNG-12"), status names or categories ("In Progress" / "in_progress"),
 * priority and label names, milestone names. Every change is attributed to actor "api".
 */

const ticketKey = z.string().trim().min(3);

const writable = {
  title: z.string(),
  type: z.enum(TICKET_TYPES),
  status: z.string().describe("status name or category"),
  priority: z.string().describe("priority name"),
  description: z.string(),
  acceptanceCriteria: z.string(),
  technicalNotes: z.string(),
  dueDate: optionalDate,
  estimate: z.number().min(0).nullable(),
  labels: z.array(z.string().trim().min(1).max(40)).describe("label names; created if new"),
  milestone: z.string().nullable().describe("milestone name within the project, or null"),
  parent: ticketKey.nullable().describe("parent ticket key, or null"),
};

export const apiCreateTicket = z.object({
  project: z.string().trim().min(2).describe("project key"),
  ...writable,
  blockedBy: z.array(ticketKey),
}).partial().required({ project: true, title: true });

export const apiUpdateTicket = z.object({ ...writable, archived: z.boolean() }).partial();

async function statusId(value: string) {
  const v = value.trim().toLowerCase();
  const statuses = await listStatuses();
  const s =
    statuses.find((x) => x.name.toLowerCase() === v) ??
    statuses.find((x) => x.category === v.replace(/[\s-]+/g, "_"));
  if (!s)
    throw new InvalidError(
      `Unknown status "${value}". Use one of: ${statuses.map((x) => x.name).join(", ")} (or a category: ${STATUS_CATEGORIES.join(", ")})`,
    );
  return s.id;
}

async function priorityId(value: string) {
  const priorities = await listPriorities();
  const p = priorities.find((x) => x.name.toLowerCase() === value.trim().toLowerCase());
  if (!p) throw new InvalidError(`Unknown priority "${value}". Use one of: ${priorities.map((x) => x.name).join(", ")}`);
  return p.id;
}

async function labelIds(names: string[]) {
  const existing = await listLabels();
  const ids: string[] = [];
  for (const n of names) ids.push(existing.find((l) => l.name.toLowerCase() === n.toLowerCase())?.id ?? (await createLabel({ name: n })).id);
  return ids;
}

async function milestoneId(projectId: string, name: string | null) {
  if (name === null) return null;
  const db = await getDb();
  const [m] = await db
    .select({ id: milestones.id })
    .from(milestones)
    .where(and(eq(milestones.projectId, projectId), ilike(milestones.name, name.trim())));
  if (!m) throw new NotFoundError(`No milestone named "${name}" in this project`);
  return m.id;
}

/** Translate the friendly fields shared by create and update into service input. */
async function resolve(projectId: string, f: z.output<typeof apiUpdateTicket>): Promise<UpdateTicketInput> {
  return {
    ...(f.title !== undefined && { title: f.title }),
    ...(f.type !== undefined && { type: f.type }),
    ...(f.status !== undefined && { statusId: await statusId(f.status) }),
    ...(f.priority !== undefined && { priorityId: await priorityId(f.priority) }),
    ...(f.description !== undefined && { description: f.description }),
    ...(f.acceptanceCriteria !== undefined && { acceptanceCriteria: f.acceptanceCriteria }),
    ...(f.technicalNotes !== undefined && { technicalNotes: f.technicalNotes }),
    ...(f.dueDate !== undefined && { dueDate: f.dueDate }),
    ...(f.estimate !== undefined && { estimate: f.estimate }),
    ...(f.labels !== undefined && { labelIds: await labelIds(f.labels) }),
    ...(f.milestone !== undefined && { milestoneId: await milestoneId(projectId, f.milestone) }),
    ...(f.parent !== undefined && { parentId: f.parent === null ? null : (await getTicketByKey(f.parent)).id }),
  };
}

export async function apiCreate(input: unknown) {
  const data = parse(apiCreateTicket, input);
  const project = await getProjectByKey(data.project);
  const fields = await resolve(project.id, data);
  const blockers = await Promise.all((data.blockedBy ?? []).map(async (k) => (await getTicketByKey(k)).id));
  const t = await createTicket({ projectId: project.id, ...fields, title: data.title, blockedByIds: blockers }, "api");
  return getTicketByKey(t.key);
}

export async function apiUpdate(key: string, input: unknown) {
  const data = parse(apiUpdateTicket, input);
  const ticket = await getTicketByKey(key);
  const { archived, ...rest } = data;
  const fields = await resolve(ticket.projectId, rest);
  if (Object.keys(fields).length) await updateTicket(ticket.id, fields, "api");
  if (archived !== undefined && archived !== !!ticket.archivedAt) await setTicketArchived(ticket.id, archived, "api");
  return getTicketByKey(key);
}

export async function apiAddBlocker(key: string, blockerKey: string) {
  const [t, b] = await Promise.all([getTicketByKey(key), getTicketByKey(blockerKey)]);
  await addDependency(t.id, b.id, "api");
  return getTicketByKey(key);
}

export async function apiRemoveBlocker(key: string, blockerKey: string) {
  const [t, b] = await Promise.all([getTicketByKey(key), getTicketByKey(blockerKey)]);
  await removeDependency(t.id, b.id, "api");
  return getTicketByKey(key);
}
