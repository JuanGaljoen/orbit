import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, projects } from "@/db/schema";
import { today } from "@/lib/dates";
import { listMilestones } from "./milestones";
import { progressByMilestone } from "./progress";

/** Milestones with progress + overdue flag — shared by project pages, roadmap and dashboard. */
export async function milestoneViews(opts: { projectId?: string } = {}) {
  const ms = await listMilestones(opts);
  const progress = await progressByMilestone(ms.map((m) => m.id));
  const t = today();
  return ms.map((m) => ({
    ...m,
    progress: progress.get(m.id)!,
    overdue: !m.completedAt && !!m.targetDate && m.targetDate < t,
  }));
}
export type MilestoneWithProgress = Awaited<ReturnType<typeof milestoneViews>>[number];

export async function recentActivity(opts: { projectIds?: string[]; since?: Date; limit?: number } = {}) {
  const db = await getDb();
  const conds = [];
  if (opts.projectIds) conds.push(inArray(activity.projectId, opts.projectIds));
  if (opts.since) conds.push(gte(activity.createdAt, opts.since));
  return db
    .select({ a: activity, projectKey: projects.key })
    .from(activity)
    .leftJoin(projects, eq(projects.id, activity.projectId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(activity.createdAt))
    .limit(opts.limit ?? 30)
    .then((rows) => rows.map((r) => ({ ...r.a, projectKey: r.projectKey })));
}
