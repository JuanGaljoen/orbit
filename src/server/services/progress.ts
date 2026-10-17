import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, statuses, tickets, type StatusCategory } from "@/db/schema";
import { addDays, toIsoDate, today } from "@/lib/dates";

export type ProgressItem = {
  id: string;
  parentId: string | null;
  category: StatusCategory;
  estimate: number | null;
};

export type Progress = {
  total: number;
  done: number;
  active: number; // in_progress + in_review
  notStarted: number; // backlog + todo
  /** done / total, or null when there is nothing to measure. */
  countPercent: number | null;
  estimateTotal: number;
  estimateDone: number;
  /** Σ done estimates / Σ estimates, or null when no leaf has an estimate. */
  estimatePercent: number | null;
  /** Leaves without an estimate — reported, never imputed. */
  unestimated: number;
};

/**
 * Progress over *leaf* tickets only: a parent with subtasks is represented by its subtasks, so
 * nothing is counted twice. Callers pass non-archived tickets.
 */
export function computeProgress(items: ProgressItem[]): Progress {
  const ids = new Set(items.map((i) => i.id));
  const parents = new Set(items.filter((i) => i.parentId && ids.has(i.parentId)).map((i) => i.parentId));
  const leaves = items.filter((i) => !parents.has(i.id));
  const done = leaves.filter((l) => l.category === "done");
  const estimated = leaves.filter((l) => l.estimate != null);
  const estimateTotal = sum(estimated.map((l) => l.estimate!));
  const estimateDone = sum(estimated.filter((l) => l.category === "done").map((l) => l.estimate!));
  return {
    total: leaves.length,
    done: done.length,
    active: leaves.filter((l) => l.category === "in_progress" || l.category === "in_review").length,
    notStarted: leaves.filter((l) => l.category === "backlog" || l.category === "todo").length,
    countPercent: leaves.length ? done.length / leaves.length : null,
    estimateTotal,
    estimateDone,
    estimatePercent: estimateTotal > 0 ? estimateDone / estimateTotal : null,
    unestimated: leaves.length - estimated.length,
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

async function progressItems(where: { projectIds?: string[]; milestoneIds?: string[] }) {
  const db = await getDb();
  const conds = [isNull(tickets.archivedAt)];
  if (where.projectIds) conds.push(inArray(tickets.projectId, where.projectIds));
  if (where.milestoneIds) conds.push(inArray(tickets.milestoneId, where.milestoneIds));
  return db
    .select({
      id: tickets.id,
      parentId: tickets.parentId,
      category: statuses.category,
      estimate: tickets.estimate,
      projectId: tickets.projectId,
      milestoneId: tickets.milestoneId,
    })
    .from(tickets)
    .innerJoin(statuses, eq(statuses.id, tickets.statusId))
    .where(and(...conds));
}

export async function progressByProject(projectIds: string[]): Promise<Map<string, Progress>> {
  if (!projectIds.length) return new Map();
  const items = await progressItems({ projectIds });
  return new Map(projectIds.map((id) => [id, computeProgress(items.filter((i) => i.projectId === id))]));
}

/**
 * Milestone progress. A subtask counts toward its *own* milestone if it has one, else its
 * parent's — so a parent assigned to a milestone carries its subtasks with it.
 */
export async function progressByMilestone(milestoneIds: string[]): Promise<Map<string, Progress>> {
  if (!milestoneIds.length) return new Map();
  const db = await getDb();
  const direct = await progressItems({ milestoneIds });
  const parentIds = direct.map((d) => d.id);
  const children = parentIds.length
    ? await db
        .select({
          id: tickets.id,
          parentId: tickets.parentId,
          category: statuses.category,
          estimate: tickets.estimate,
          milestoneId: tickets.milestoneId,
        })
        .from(tickets)
        .innerJoin(statuses, eq(statuses.id, tickets.statusId))
        .where(and(isNull(tickets.archivedAt), inArray(tickets.parentId, parentIds), isNull(tickets.milestoneId)))
    : [];
  const all = [
    ...direct,
    ...children.map((c) => ({ ...c, milestoneId: direct.find((d) => d.id === c.parentId)!.milestoneId })),
  ];
  return new Map(milestoneIds.map((id) => [id, computeProgress(all.filter((i) => i.milestoneId === id))]));
}

export type SeriesPoint = { date: string; scope: number; done: number };

/**
 * Burn-up series: per day, how many leaf tickets existed (scope) and how many were done, rebuilt
 * from the activity log's status transitions. Uses today's hierarchy/archive state.
 */
export async function progressSeries(opts: {
  projectIds?: string[];
  milestoneIds?: string[];
  days?: number;
}): Promise<SeriesPoint[]> {
  const db = await getDb();
  const items = opts.milestoneIds
    ? await progressItems({ milestoneIds: opts.milestoneIds })
    : await progressItems({ projectIds: opts.projectIds });
  if (!items.length) return [];
  const parents = new Set(items.map((i) => i.parentId).filter(Boolean));
  const leaves = items.filter((i) => !parents.has(i.id));
  const leafIds = leaves.map((l) => l.id);

  const [created, events] = await Promise.all([
    db.select({ id: tickets.id, createdAt: tickets.createdAt }).from(tickets).where(inArray(tickets.id, leafIds)),
    db
      .select({ ticketId: activity.ticketId, kind: activity.kind, data: activity.data, at: activity.createdAt })
      .from(activity)
      .where(
        and(
          inArray(activity.ticketId, leafIds),
          inArray(activity.kind, ["ticket.created", "ticket.status_changed"]),
        ),
      )
      .orderBy(asc(activity.createdAt)),
  ]);

  const end = today();
  const firstCreated = created.reduce((min, c) => (c.createdAt < min ? c.createdAt : min), new Date());
  const start = opts.days ? addDays(end, -(opts.days - 1)) : toIsoDate(firstCreated);
  const points: SeriesPoint[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    let scope = 0;
    let done = 0;
    for (const leaf of leaves) {
      const c = created.find((x) => x.id === leaf.id)!;
      if (toIsoDate(c.createdAt) > d) continue;
      scope++;
      const evs = events.filter((e) => e.ticketId === leaf.id && toIsoDate(e.at) <= d);
      const last = evs.at(-1);
      const category = last
        ? ((last.data.toCategory ?? last.data.category) as StatusCategory | undefined)
        : leaf.category;
      if ((category ?? leaf.category) === "done") done++;
    }
    points.push({ date: d, scope, done });
  }
  return points;
}
