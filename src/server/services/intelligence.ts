import { and, desc, eq, gte, inArray, isNull, like } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, ghCommits, ghPullRequests, repositories, ticketDeps, ticketLinks, tickets } from "@/db/schema";
import { addDays, daysBetween, toIsoDate, today } from "@/lib/dates";
import { projectRepositoryIds } from "./github";
import { listObjectives } from "./objectives";
import { listProjects } from "./projects";
import { listTickets, type TicketSummary } from "./tickets";
import { milestoneViews, type MilestoneWithProgress } from "./views";

/**
 * Explainable project intelligence. Every finding carries the facts that produced it; nothing here
 * predicts delivery dates or invents completion — rules are listed in the docs and the UI.
 */

export const STALE_DAYS = 7;
const GH_WINDOW_DAYS = 14;

export type Finding = { ticket?: TicketSummary; title: string; detail: string; url?: string };

export type Recommendation = { ticket: TicketSummary; score: number; reasons: string[] };

async function context(projectIds?: string[]) {
  const db = await getDb();
  const open = await listTickets({ projectIds, limit: 2000, categories: ["backlog", "todo", "in_progress", "in_review"] });
  const done = await listTickets({ projectIds, limit: 2000, categories: ["done"] });
  const all = [...open, ...done];
  const ids = all.map((t) => t.id);
  const since = new Date(Date.now() - GH_WINDOW_DAYS * 86_400_000);
  const [links, deps, prs, ghEvents] = ids.length
    ? await Promise.all([
        db.select().from(ticketLinks).where(inArray(ticketLinks.ticketId, ids)),
        db.select().from(ticketDeps).where(inArray(ticketDeps.ticketId, ids)),
        db.select().from(ghPullRequests),
        db
          .select({ ticketId: activity.ticketId, at: activity.createdAt })
          .from(activity)
          .where(and(inArray(activity.ticketId, ids), like(activity.kind, "github.%"), gte(activity.createdAt, since))),
      ])
    : [[], [], [], []];
  const prFor = (l: typeof ticketLinks.$inferSelect) =>
    l.kind === "pr" ? prs.find((p) => p.repositoryId === l.repositoryId && String(p.number) === l.ref) : undefined;
  return { open, done, all, links, deps, prFor, ghEvents };
}

export async function staleTickets(projectIds?: string[]): Promise<Finding[]> {
  const { open, ghEvents } = await context(projectIds);
  const cutoff = Date.now() - STALE_DAYS * 86_400_000;
  return open
    .filter((t) => (t.status.category === "in_progress" || t.status.category === "in_review") && t.statusChangedAt.getTime() < cutoff)
    .filter((t) => !ghEvents.some((e) => e.ticketId === t.id && e.at.getTime() >= cutoff))
    .map((t) => ({
      ticket: t,
      title: `${t.key} has been ${t.status.name} for ${Math.floor((Date.now() - t.statusChangedAt.getTime()) / 86_400_000)} days`,
      detail: `No status change and no linked GitHub activity in the last ${STALE_DAYS} days.`,
    }));
}

/** Open tickets that block the most other open work (directly or transitively). */
export async function bottlenecks(projectIds?: string[]) {
  const { open, deps } = await context(projectIds);
  const openIds = new Set(open.map((t) => t.id));
  const blocks = new Map<string, string[]>();
  for (const d of deps) if (openIds.has(d.ticketId)) blocks.set(d.blockedById, [...(blocks.get(d.blockedById) ?? []), d.ticketId]);
  const reach = (id: string, seen = new Set<string>()): Set<string> => {
    for (const n of blocks.get(id) ?? []) if (!seen.has(n)) reach(n, seen.add(n));
    return seen;
  };
  return open
    .map((t) => ({ ticket: t, direct: (blocks.get(t.id) ?? []).length, total: reach(t.id).size }))
    .filter((b) => b.direct > 0)
    .sort((a, b) => b.total - a.total || b.direct - a.direct)
    .map((b) => ({
      ...b,
      blocked: [...reach(b.ticket.id)].map((id) => open.find((t) => t.id === id)!).filter(Boolean),
    }));
}

/** Ticket status vs. GitHub evidence. */
export async function discrepancies(projectIds?: string[]): Promise<Finding[]> {
  const { all, links, prFor } = await context(projectIds);
  const out: Finding[] = [];
  for (const t of all) {
    const tl = links.filter((l) => l.ticketId === t.id);
    const linkedPrs = tl.map(prFor).filter((p): p is NonNullable<ReturnType<typeof prFor>> => !!p);
    const openPr = linkedPrs.find((p) => p.state === "open" || p.state === "draft");
    const mergedPr = linkedPrs.find((p) => p.state === "merged");
    const c = t.status.category;
    if (c === "done" && openPr)
      out.push({ ticket: t, title: `${t.key} is Done but PR #${openPr.number} is still ${openPr.state}`, detail: "Either the PR is stale or the ticket was closed early.", url: openPr.htmlUrl });
    if ((c === "backlog" || c === "todo") && (openPr || tl.some((l) => l.kind === "commit" || l.kind === "branch")))
      out.push({
        ticket: t,
        title: `${t.key} is ${t.status.name} but has code activity`,
        detail: openPr ? `PR #${openPr.number} is ${openPr.state}.` : "Linked branch/commits exist.",
        url: openPr?.htmlUrl,
      });
    if ((c === "in_progress" || c === "in_review") && mergedPr && !openPr)
      out.push({
        ticket: t,
        title: `${t.key} is ${t.status.name} but PR #${mergedPr.number} was merged`,
        detail: "Merged code isn't proof the ticket is complete — check its acceptance criteria, then close it or note what remains.",
        url: mergedPr.htmlUrl,
      });
    const failing = linkedPrs.find((p) => (p.state === "open" || p.state === "draft") && p.checksState === "failure");
    if (failing && c !== "done")
      out.push({ ticket: t, title: `CI failing on PR #${failing.number} for ${t.key}`, detail: failing.title, url: failing.htmlUrl });
  }
  return out;
}

/** Merged PRs and commits in connected repos (last 14 days) that no ticket references. */
export async function untrackedWork(projectIds?: string[]) {
  const db = await getDb();
  const since = new Date(Date.now() - GH_WINDOW_DAYS * 86_400_000);
  const repoIds = projectIds ? await projectRepositoryIds(projectIds) : undefined;
  if (repoIds && !repoIds.length) return { pullRequests: [], commits: [] };
  const inRepos = (col: typeof ghPullRequests.repositoryId | typeof ghCommits.repositoryId) =>
    repoIds ? inArray(col, repoIds) : undefined;
  const [prs, commits, links] = await Promise.all([
    db
      .select({ pr: ghPullRequests, repo: repositories.fullName })
      .from(ghPullRequests)
      .innerJoin(repositories, eq(repositories.id, ghPullRequests.repositoryId))
      .where(and(eq(ghPullRequests.state, "merged"), gte(ghPullRequests.mergedAt, since), inRepos(ghPullRequests.repositoryId)))
      .orderBy(desc(ghPullRequests.mergedAt)),
    db
      .select({ c: ghCommits, repo: repositories.fullName, defaultBranch: repositories.defaultBranch })
      .from(ghCommits)
      .innerJoin(repositories, eq(repositories.id, ghCommits.repositoryId))
      .where(and(gte(ghCommits.committedAt, since), inRepos(ghCommits.repositoryId)))
      .orderBy(desc(ghCommits.committedAt)),
    db.select({ kind: ticketLinks.kind, ref: ticketLinks.ref, repositoryId: ticketLinks.repositoryId }).from(ticketLinks),
  ]);
  const linkedPr = (repoId: string, n: number) => links.some((l) => l.kind === "pr" && l.repositoryId === repoId && l.ref === String(n));
  const mergedHeads = new Set(prs.filter((p) => linkedPr(p.pr.repositoryId, p.pr.number)).map((p) => p.pr.headRef));
  return {
    pullRequests: prs
      .filter((p) => !linkedPr(p.pr.repositoryId, p.pr.number))
      .map((p) => ({ number: p.pr.number, title: p.pr.title, url: p.pr.htmlUrl, repo: p.repo, mergedAt: p.pr.mergedAt })),
    // Commits on the default branch with no ticket, excluding merge commits of linked PRs' branches.
    commits: commits
      .filter((c) => c.c.branch === c.defaultBranch && !links.some((l) => l.kind === "commit" && l.ref === c.c.sha))
      .filter((c) => !/^Merge (pull request|branch)/.test(c.c.message) && !(c.c.branch && mergedHeads.has(c.c.branch)))
      .slice(0, 20)
      .map((c) => ({ sha: c.c.sha, message: c.c.message.split("\n")[0], url: c.c.htmlUrl, repo: c.repo, at: c.c.committedAt })),
  };
}

export type MilestoneRisk = { milestone: MilestoneWithProgress; reasons: string[] };

/** Rule-based, fact-stated risk flags. No forecasting. */
export async function milestonesAtRisk(projectId?: string): Promise<MilestoneRisk[]> {
  const ms = (await milestoneViews({ projectId })).filter((m) => !m.completedAt);
  const t = today();
  const blockedByMilestone = new Map<string, number>();
  for (const tk of await listTickets({ projectIds: projectId ? [projectId] : undefined, blocked: true, limit: 2000 }))
    if (tk.milestoneId) blockedByMilestone.set(tk.milestoneId, (blockedByMilestone.get(tk.milestoneId) ?? 0) + 1);

  const out: MilestoneRisk[] = [];
  for (const m of ms) {
    const reasons: string[] = [];
    const remaining = m.progress.total - m.progress.done;
    if (m.overdue) reasons.push(`Target date ${m.targetDate} has passed with ${remaining} of ${m.progress.total} tickets not done.`);
    else if (m.targetDate) {
      const days = daysBetween(t, m.targetDate);
      if (days <= 7 && m.progress.total > 0 && remaining / m.progress.total > 0.5)
        reasons.push(`Due in ${days} day(s) with ${remaining} of ${m.progress.total} tickets not done.`);
      if (days <= 14 && m.progress.total > 0 && m.progress.active === 0 && remaining > 0)
        reasons.push(`Due in ${days} day(s) and nothing is in progress.`);
    }
    const blocked = blockedByMilestone.get(m.id);
    if (blocked) reasons.push(`${blocked} ticket(s) in it are blocked.`);
    for (const depId of m.dependsOn) {
      const dep = ms.find((x) => x.id === depId);
      if (dep && (!dep.targetDate || (m.targetDate && dep.targetDate > m.targetDate)))
        reasons.push(`Depends on "${dep.name}", which is incomplete and targets ${dep.targetDate ?? "no date"}.`);
      else if (dep?.overdue) reasons.push(`Depends on "${dep.name}", which is overdue.`);
    }
    if (m.progress.total === 0 && m.targetDate && daysBetween(t, m.targetDate) <= 30) reasons.push("Has a target date but no tickets.");
    if (reasons.length) out.push({ milestone: m, reasons });
  }
  return out;
}

/** Planning holes: things a roadmap usually needs that are missing. */
export async function roadmapGaps(): Promise<Finding[]> {
  const [projects, objectives, milestones, open] = await Promise.all([
    listProjects(),
    listObjectives(),
    milestoneViews(),
    listTickets({ categories: ["todo", "in_progress", "in_review"], limit: 2000 }),
  ]);
  const out: Finding[] = [];
  for (const p of projects.filter((p) => p.status === "active"))
    if (!milestones.some((m) => m.projectId === p.id))
      out.push({ title: `Project ${p.key} has no milestones`, detail: "Without milestones it can't show on the roadmap timeline.", url: `/projects/${p.key}?tab=milestones` });
  for (const m of milestones.filter((m) => !m.completedAt)) {
    if (m.progress.total === 0) out.push({ title: `Milestone "${m.name}" (${m.projectKey}) has no tickets`, detail: "Nothing tracks the work it represents.", url: `/projects/${m.projectKey}?tab=milestones` });
    if (!m.targetDate) out.push({ title: `Milestone "${m.name}" (${m.projectKey}) has no target date`, detail: "It can't be scheduled or checked for slippage.", url: `/projects/${m.projectKey}?tab=milestones` });
  }
  for (const o of objectives.filter((o) => o.status === "active"))
    if (!projects.some((p) => p.objectiveId === o.id))
      out.push({ title: `Objective "${o.title}" has no projects`, detail: "Nothing is planned toward it yet.", url: `/objectives#${o.id}` });
  const db = await getDb();
  const withAc = new Set(
    (await db.select({ id: tickets.id, ac: tickets.acceptanceCriteria }).from(tickets).where(isNull(tickets.archivedAt)))
      .filter((r) => r.ac.trim())
      .map((r) => r.id),
  );
  for (const t of open.filter((t) => !withAc.has(t.id) && (t.highPriority || t.status.category !== "todo")))
    out.push({ ticket: t, title: `${t.key} has no acceptance criteria`, detail: `It's ${t.status.name} at ${t.priority.name} priority — "done" is undefined.`, url: `/tickets/${t.key}` });
  return out;
}

/** "What should I work on next?" — a transparent score. Blocked and done tickets are excluded. */
export async function recommendations(opts: { projectIds?: string[]; limit?: number } = {}): Promise<Recommendation[]> {
  const { open, deps, links, prFor } = await context(opts.projectIds);
  const risks = await milestonesAtRisk();
  const riskIds = new Set(risks.map((r) => r.milestone.id));
  const t = today();
  const openIds = new Set(open.map((x) => x.id));

  return open
    // Parents with open subtasks are represented by those subtasks.
    .filter((x) => !x.blocked && (x.subtaskCount === 0 || x.subtaskDone === x.subtaskCount))
    .map((x) => {
      const reasons: string[] = [];
      let score = 0;
      const add = (n: number, why: string) => {
        score += n;
        reasons.push(why);
      };
      if (x.status.category === "in_review") add(35, "Already in review — closest to done");
      else if (x.status.category === "in_progress") add(30, "Already in progress — finish before starting new work");
      else if (x.status.category === "backlog") add(-10, "Still in the backlog");
      const pr = { 0: 40, 1: 25, 2: 10 }[x.priority.rank as 0 | 1 | 2];
      if (pr) add(pr, `${x.priority.name} priority`);
      if (x.overdue) add(30, `Overdue (due ${x.dueDate})`);
      else if (x.dueDate && x.dueDate <= addDays(t, 3)) add(20, `Due ${x.dueDate}`);
      else if (x.dueDate && x.dueDate <= addDays(t, 7)) add(10, `Due ${x.dueDate}`);
      const unblocks = deps.filter((d) => d.blockedById === x.id && openIds.has(d.ticketId)).length;
      if (unblocks) add(Math.min(30, unblocks * 10), `Unblocks ${unblocks} other ticket(s)`);
      if (x.milestoneId && riskIds.has(x.milestoneId)) add(15, `Milestone "${x.milestoneName}" is at risk`);
      const failing = links
        .filter((l) => l.ticketId === x.id)
        .map(prFor)
        .find((p) => p && (p.state === "open" || p.state === "draft") && p.checksState === "failure");
      if (failing) add(15, `CI failing on PR #${failing.number}`);
      return { ticket: x, score, reasons };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.ticket.priority.rank - b.ticket.priority.rank)
    .slice(0, opts.limit ?? 7);
}

/** What happened in a window — "what did I accomplish this week?". */
export async function accomplishments(opts: { days?: number; projectIds?: string[] } = {}) {
  const days = opts.days ?? 7;
  const since = new Date(Date.now() - days * 86_400_000);
  const db = await getDb();
  const completed = (await listTickets({ projectIds: opts.projectIds, categories: ["done"], limit: 2000 })).filter(
    (t) => t.completedAt && t.completedAt >= since,
  );
  const created = (await listTickets({ projectIds: opts.projectIds, includeArchived: true, limit: 2000, sort: "created", dir: "desc" })).filter(
    (t) => t.createdAt >= since,
  );
  const merged = await db
    .select({ number: ghPullRequests.number, title: ghPullRequests.title, url: ghPullRequests.htmlUrl, repo: repositories.fullName })
    .from(ghPullRequests)
    .innerJoin(repositories, eq(repositories.id, ghPullRequests.repositoryId))
    .where(and(eq(ghPullRequests.state, "merged"), gte(ghPullRequests.mergedAt, since)));
  const commits = await db.select({ sha: ghCommits.sha }).from(ghCommits).where(gte(ghCommits.committedAt, since));
  return { since: toIsoDate(since), days, completed, created, mergedPullRequests: merged, commitCount: commits.length };
}

/**
 * Planned vs tracked vs implementation-supported, per project (leaf tickets):
 *  planned = in scope · tracked = marked done · supported = done *and* has a merged PR or commit linked.
 */
export async function evidenceBreakdown(projectIds?: string[]) {
  const { all, links, prFor } = await context(projectIds);
  const parents = new Set(all.map((t) => t.parentId).filter(Boolean));
  const leaves = all.filter((t) => !parents.has(t.id));
  const supported = (t: TicketSummary) =>
    links.some((l) => l.ticketId === t.id && (l.kind === "commit" || (l.kind === "pr" && prFor(l)?.state === "merged")));
  const byProject = new Map<string, { planned: number; tracked: number; supported: number }>();
  for (const t of leaves) {
    const row = byProject.get(t.projectKey) ?? { planned: 0, tracked: 0, supported: 0 };
    row.planned++;
    if (t.status.category === "done") {
      row.tracked++;
      if (supported(t)) row.supported++;
    }
    byProject.set(t.projectKey, row);
  }
  return [...byProject.entries()].map(([projectKey, v]) => ({ projectKey, ...v }));
}

export async function intelligenceReport(projectIds?: string[]) {
  const [stale, blockers, mismatches, untracked, risks, gaps, recs, evidence] = await Promise.all([
    staleTickets(projectIds),
    bottlenecks(projectIds),
    discrepancies(projectIds),
    untrackedWork(projectIds),
    milestonesAtRisk(projectIds?.length === 1 ? projectIds[0] : undefined),
    roadmapGaps(),
    recommendations({ projectIds }),
    evidenceBreakdown(projectIds),
  ]);
  return { stale, bottlenecks: blockers, discrepancies: mismatches, untracked, milestoneRisks: risks, gaps, recommendations: recs, evidence };
}
