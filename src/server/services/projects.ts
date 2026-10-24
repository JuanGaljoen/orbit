import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { type DiagramView, objectives, PROJECT_STATUSES, projectRepos, projects, repositories } from "@/db/schema";
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

const diagramView = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "id must be a kebab-case slug"),
  title: z.string().trim().min(1, "title is required").max(200),
  mermaid: z.string().trim().min(1, "mermaid is required").max(50_000, "mermaid must be at most 50,000 chars"),
});

const diagramCommit = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{7,40}$/i, "commit must be a git SHA")
  .nullable()
  .optional();

const diagramInput = z.preprocess(
  // Legacy single-diagram body { mermaid, commit } is stored as one view.
  (v) =>
    v && typeof v === "object" && !("views" in v) && "mermaid" in v
      ? { commit: (v as { commit?: unknown }).commit, views: [{ id: "map", title: "Architecture", mermaid: v.mermaid }] }
      : v,
  z.object({ commit: diagramCommit, views: z.array(z.unknown()).min(1, "send 1–6 views").max(6, "send 1–6 views") }),
);

/** Validates each view, naming the offending one (by position and id) in the error. */
function parseViews(views: unknown[]): DiagramView[] {
  const seen = new Set<string>();
  return views.map((v, i) => {
    const id = (v as { id?: unknown })?.id;
    const label = `view ${i + 1}${typeof id === "string" ? ` ("${id}")` : ""}`;
    const result = diagramView.safeParse(v);
    if (!result.success) throw new InvalidError(`${label}: ${result.error.issues[0]?.message ?? "invalid view"}`);
    if (seen.has(result.data.id)) throw new InvalidError(`${label}: duplicate id`);
    seen.add(result.data.id);
    return result.data;
  });
}

const diagramOf = (p: Project) => ({ commit: p.diagramCommit, updatedAt: p.diagramUpdatedAt, views: p.diagram ?? [] });

export async function getProjectDiagram(key: string) {
  return diagramOf(await getProjectByKey(key));
}

/**
 * Replaces the project's whole set of architecture diagram views (Mermaid sources drawn by the
 * user's agent) — a structure map plus request flows. Order is kept; old views are not merged.
 */
export async function setProjectDiagram(
  key: string,
  input: { commit?: string | null; views: unknown[] } | { commit?: string | null; mermaid: string },
  actor: Actor = "user",
) {
  const data = parse(diagramInput, input);
  const views = parseViews(data.views);
  const project = await getProjectByKey(key);
  const db = await getDb();
  const [row] = await db
    .update(projects)
    .set({ diagram: views, diagramCommit: data.commit ?? null, diagramUpdatedAt: new Date() })
    .where(eq(projects.id, project.id))
    .returning();
  await logActivity(db, {
    kind: "project.diagram_updated",
    entityType: "project",
    entityId: row.id,
    projectId: row.id,
    summary: `Updated the architecture diagram of ${row.key}${data.commit ? ` (from ${data.commit.slice(0, 7)})` : ""}`,
    actor,
  });
  return diagramOf(row);
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
