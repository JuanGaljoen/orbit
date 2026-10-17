import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { milestones, objectives, projects } from "@/db/schema";
import { listTickets } from "./tickets";

export type SearchHit = {
  kind: "ticket" | "project" | "milestone" | "objective";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

/** Global search across tickets, projects, milestones and objectives (titles + descriptions). */
export async function searchAll(q: string, limit = 8): Promise<SearchHit[]> {
  const query = q.trim();
  if (!query) return [];
  const db = await getDb();
  const like = `%${query.replace(/[%_\\]/g, "\\$&")}%`;

  const [ticketRows, projectRows, milestoneRows, objectiveRows] = await Promise.all([
    listTickets({ q: query, limit, sort: "updated" }),
    db
      .select()
      .from(projects)
      .where(
        and(
          isNull(projects.archivedAt),
          or(ilike(projects.name, like), ilike(projects.key, like), ilike(projects.description, like)),
        ),
      )
      .limit(limit),
    db
      .select({ m: milestones, projectKey: projects.key })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .where(or(ilike(milestones.name, like), ilike(milestones.description, like)))
      .limit(limit),
    db
      .select()
      .from(objectives)
      .where(and(isNull(objectives.archivedAt), or(ilike(objectives.title, like), ilike(objectives.description, like))))
      .limit(limit),
  ]);

  return [
    ...ticketRows.map((t) => ({
      kind: "ticket" as const,
      id: t.id,
      title: `${t.key} ${t.title}`,
      subtitle: `${t.status.name} · ${t.priority.name}`,
      href: `/tickets/${t.key}`,
    })),
    ...projectRows.map((p) => ({
      kind: "project" as const,
      id: p.id,
      title: p.name,
      subtitle: p.key,
      href: `/projects/${p.key}`,
    })),
    ...milestoneRows.map(({ m, projectKey }) => ({
      kind: "milestone" as const,
      id: m.id,
      title: m.name,
      subtitle: `${projectKey} milestone${m.targetDate ? ` · due ${m.targetDate}` : ""}`,
      href: `/projects/${projectKey}?tab=milestones`,
    })),
    ...objectiveRows.map((o) => ({
      kind: "objective" as const,
      id: o.id,
      title: o.title,
      subtitle: "Objective",
      href: `/objectives#${o.id}`,
    })),
  ];
}
