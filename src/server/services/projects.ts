import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { objectives, PROJECT_STATUSES, projectRepos, projects, repositories } from "@/db/schema";
import { logActivity, type Actor } from "../activity";
import { ConflictError, InvalidError, NotFoundError } from "../errors";
import { optionalDate, parse } from "../validation";

export type Project = typeof projects.$inferSelect;

export const PROJECT_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

const projectInput = z.object({
  key: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(PROJECT_KEY_RE, "Key must be 2–10 chars: a letter then letters/digits")),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(20_000).default(""),
  status: z.enum(PROJECT_STATUSES).default("active"),
  targetDate: optionalDate,
  objectiveId: z.uuid().nullable().optional(),
});

export type ProjectInput = z.input<typeof projectInput>;

export async function createProject(input: ProjectInput, actor: Actor = "user") {
  const data = parse(projectInput, input);
  const db = await getDb();
  const [clash] = await db.select({ id: projects.id }).from(projects).where(eq(projects.key, data.key));
  if (clash) throw new ConflictError(`Project key ${data.key} is already in use`);
  const [row] = await db.insert(projects).values(data).returning();
  await logActivity(db, {
    kind: "project.created",
    entityType: "project",
    entityId: row.id,
    projectId: row.id,
    summary: `Created project ${row.key} — ${row.name}`,
    actor,
  });
  return row;
}

const projectUpdate = projectInput.omit({ key: true }).partial();

export async function updateProject(id: string, input: z.input<typeof projectUpdate>, actor: Actor = "user") {
  const data = parse(projectUpdate, input);
  const db = await getDb();
  const [row] = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
  if (!row) throw new NotFoundError("Project not found");
  await logActivity(db, {
    kind: "project.updated",
    entityType: "project",
    entityId: row.id,
    projectId: row.id,
    summary: `Updated project ${row.key}`,
    data: { fields: Object.keys(data) },
    actor,
  });
  return row;
}

export async function setProjectArchived(id: string, archived: boolean) {
  const db = await getDb();
  const [row] = await db
    .update(projects)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(projects.id, id))
    .returning();
  if (!row) throw new NotFoundError("Project not found");
  await logActivity(db, {
    kind: archived ? "project.archived" : "project.unarchived",
    entityType: "project",
    entityId: row.id,
    projectId: row.id,
    summary: `${archived ? "Archived" : "Restored"} project ${row.key}`,
  });
  return row;
}

/** Hard delete — cascades to milestones, tickets, comments and links. Callers must confirm. */
export async function deleteProject(id: string) {
  const db = await getDb();
  const [row] = await db.delete(projects).where(eq(projects.id, id)).returning();
  if (!row) throw new NotFoundError("Project not found");
  await logActivity(db, {
    kind: "project.deleted",
    entityType: "project",
    entityId: null,
    summary: `Deleted project ${row.key} — ${row.name}`,
  });
  return row;
}

export async function listProjects(opts: { includeArchived?: boolean } = {}) {
  const db = await getDb();
  return db
    .select({
      project: projects,
      objectiveTitle: objectives.title,
    })
    .from(projects)
    .leftJoin(objectives, eq(objectives.id, projects.objectiveId))
    .where(opts.includeArchived ? undefined : isNull(projects.archivedAt))
    .orderBy(asc(projects.name))
    .then((rows) => rows.map((r) => ({ ...r.project, objectiveTitle: r.objectiveTitle })));
}

export async function getProjectByKey(key: string) {
  const db = await getDb();
  const [row] = await db.select().from(projects).where(eq(projects.key, key.toUpperCase()));
  if (!row) throw new NotFoundError(`Project ${key} not found`);
  return row;
}

/** Hard cap on a stored graph. Vercel limits request bodies to 4.5 MB, so a larger cap would be unreachable. */
export const FLOORPLAN_MAX_BYTES = 4_000_000;

const floorplanInput = z.object({
  commit: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{7,40}$/i, "commit must be a git SHA")
    .nullable()
    .optional(),
  graph: z.record(z.string(), z.unknown(), { error: "graph must be an object" }),
});

/** The graph must look like Floorplan's graph.json; the viewer does the rest. Names the first problem. */
function checkGraph(graph: Record<string, unknown>) {
  if (typeof graph.schema !== "string" || !graph.schema.startsWith("floorplan/graph"))
    throw new InvalidError('graph.schema must be a string starting with "floorplan/graph"');
  for (const field of ["nodes", "files", "links"])
    if (!Array.isArray(graph[field])) throw new InvalidError(`graph.${field} must be an array`);
  const bytes = Buffer.byteLength(JSON.stringify(graph));
  if (bytes > FLOORPLAN_MAX_BYTES)
    throw new InvalidError(`graph is ${(bytes / 1e6).toFixed(1)} MB; the limit is ${FLOORPLAN_MAX_BYTES / 1e6} MB`);
}

const floorplanOf = (p: Project) => ({ commit: p.floorplanCommit, updatedAt: p.floorplanUpdatedAt, graph: p.floorplan });

export async function getProjectFloorplan(key: string) {
  return floorplanOf(await getProjectByKey(key));
}

/** Replaces the project's whole Floorplan graph (no merge). Only graph JSON is accepted, never HTML. */
export async function setProjectFloorplan(
  key: string,
  input: { commit?: string | null; graph: unknown },
  actor: Actor = "user",
) {
  const data = parse(floorplanInput, input);
  checkGraph(data.graph);
  const project = await getProjectByKey(key);
  const db = await getDb();
  const [row] = await db
    .update(projects)
    .set({ floorplan: data.graph, floorplanCommit: data.commit ?? null, floorplanUpdatedAt: new Date() })
    .where(eq(projects.id, project.id))
    .returning();
  await logActivity(db, {
    kind: "project.floorplan_updated",
    entityType: "project",
    entityId: row.id,
    projectId: row.id,
    summary: `Updated the architecture floorplan of ${row.key}${data.commit ? ` (from ${data.commit.slice(0, 7)})` : ""}`,
    actor,
  });
  return floorplanOf(row);
}

export async function getProject(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  if (!row) throw new NotFoundError("Project not found");
  return row;
}

export async function listProjectRepos(projectId: string) {
  const db = await getDb();
  return db
    .select({ repo: repositories })
    .from(projectRepos)
    .innerJoin(repositories, eq(repositories.id, projectRepos.repositoryId))
    .where(eq(projectRepos.projectId, projectId))
    .then((rows) => rows.map((r) => r.repo));
}

export async function setProjectRepos(projectId: string, repositoryIds: string[]) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(projectRepos).where(eq(projectRepos.projectId, projectId));
    if (repositoryIds.length)
      await tx.insert(projectRepos).values(repositoryIds.map((repositoryId) => ({ projectId, repositoryId })));
  });
}

/** Atomically reserve the next ticket number for a project. */
export async function nextTicketNumber(
  tx: Pick<Awaited<ReturnType<typeof getDb>>, "update">,
  projectId: string,
): Promise<{ number: number; key: string }> {
  const [row] = await tx
    .update(projects)
    .set({ ticketSeq: sql`${projects.ticketSeq} + 1` })
    .where(and(eq(projects.id, projectId)))
    .returning({ seq: projects.ticketSeq, key: projects.key });
  if (!row) throw new NotFoundError("Project not found");
  return { number: row.seq, key: row.key };
}

export async function projectKeys(): Promise<string[]> {
  const db = await getDb();
  return db.select({ key: projects.key }).from(projects).then((r) => r.map((x) => x.key));
}

export async function projectsByIds(ids: string[]) {
  if (!ids.length) return [];
  const db = await getDb();
  return db.select().from(projects).where(inArray(projects.id, ids));
}
