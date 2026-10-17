import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { STATUS_CATEGORIES } from "@/db/schema";
import { today } from "@/lib/dates";
import { isDomainError } from "../errors";
import { githubActivity, projectRepositoryIds } from "../services/github";
import {
  accomplishments,
  bottlenecks,
  discrepancies,
  evidenceBreakdown,
  intelligenceReport,
  milestonesAtRisk,
  recommendations,
  staleTickets,
  untrackedWork,
} from "../services/intelligence";
import { progressByProject } from "../services/progress";
import { createProposal, findSimilarTickets } from "../services/proposals";
import { getProjectByKey, listProjectRepos, listProjects } from "../services/projects";
import { getTicketByKey, listTickets, type TicketSummary } from "../services/tickets";
import { listPriorities } from "../services/vocab";
import { milestoneViews, recentActivity } from "../services/views";

/**
 * The assistant's tools. All read tools return real, current data as compact JSON; the only write
 * tool is `propose_changes`, which stores a proposal for the user to review — it changes nothing.
 */

const row = (t: TicketSummary) => ({
  key: t.key,
  url: `/tickets/${t.key}`,
  title: t.title,
  type: t.type,
  status: t.status.name,
  category: t.status.category,
  priority: t.priority.name,
  due: t.dueDate,
  estimate: t.estimate,
  milestone: t.milestoneName,
  labels: t.labels.map((l) => l.name),
  blocked: t.blocked || undefined,
  overdue: t.overdue || undefined,
  subtasks: t.subtaskCount ? `${t.subtaskDone}/${t.subtaskCount}` : undefined,
  updated: t.updatedAt.toISOString().slice(0, 10),
});

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (x === undefined ? undefined : x));

async function projectIdsFor(key?: string | null) {
  if (!key) return undefined;
  return [(await getProjectByKey(key)).id];
}

/** Tools never throw into the runner: domain errors become readable results the model can act on. */
function safe<I>(fn: (input: I) => Promise<string>) {
  return async (input: I) => {
    try {
      return await fn(input);
    } catch (err) {
      if (isDomainError(err)) return `Error: ${err.message}`;
      throw err;
    }
  };
}

export function buildTools(hooks: { onProposal?: (p: { id: string; title: string }) => void } = {}) {
  return [
    betaZodTool({
      name: "list_projects",
      description: "List active projects with status, target date, objective, linked repos and leaf-ticket progress (count and estimate-weighted).",
      inputSchema: z.object({}),
      run: safe(async () => {
        const projects = await listProjects();
        const progress = await progressByProject(projects.map((p) => p.id));
        const out = [];
        for (const p of projects) {
          const pr = progress.get(p.id)!;
          out.push({
            key: p.key,
            url: `/projects/${p.key}`,
            name: p.name,
            status: p.status,
            targetDate: p.targetDate,
            objective: p.objectiveTitle,
            repos: (await listProjectRepos(p.id)).map((r) => r.fullName),
            progress: { done: pr.done, total: pr.total, countPercent: pr.countPercent, estimatePercent: pr.estimatePercent, unestimated: pr.unestimated },
          });
        }
        return json(out);
      }),
    }),
    betaZodTool({
      name: "search_tickets",
      description:
        "Search and filter tickets. Use before proposing new work to find existing or duplicate tickets. Returns compact rows with key, url, status, priority, due, blocked/overdue flags.",
      inputSchema: z.object({
        query: z.string().optional().describe("text or ticket key"),
        projectKey: z.string().optional(),
        categories: z.array(z.enum(STATUS_CATEGORIES)).optional().describe("status categories to include"),
        blocked: z.boolean().optional(),
        overdue: z.boolean().optional(),
        includeArchived: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      run: safe(async (i) => {
        const tickets = await listTickets({
          q: i.query,
          projectIds: await projectIdsFor(i.projectKey),
          categories: i.categories,
          blocked: i.blocked,
          due: i.overdue ? "overdue" : undefined,
          includeArchived: i.includeArchived,
          limit: i.limit ?? 50,
        });
        return json({ count: tickets.length, tickets: tickets.map(row) });
      }),
    }),
    betaZodTool({
      name: "get_ticket",
      description: "Full detail for one ticket: description, acceptance criteria, notes, parent/subtasks, blockers, linked GitHub code, pending status suggestions, recent comments and history.",
      inputSchema: z.object({ key: z.string().describe("ticket key, e.g. ORB-12") }),
      run: safe(async ({ key }) => {
        const t = await getTicketByKey(key);
        return json({
          ...row(t),
          description: t.description,
          acceptanceCriteria: t.acceptanceCriteria,
          technicalNotes: t.technicalNotes,
          parent: t.parent?.key,
          subtasks: t.subtasks.map(row),
          blockedBy: t.blockers.map(row),
          blocking: t.blocking.map(row),
          links: t.links.map((l) => ({ kind: l.kind, ref: l.ref, title: l.title, url: l.url, source: l.source })),
          pendingSuggestions: t.suggestions.map((s) => ({ suggest: s.suggestedCategory, reason: s.reason, evidence: s.evidenceUrl })),
          comments: t.comments.slice(-5).map((c) => ({ author: c.author, at: c.createdAt.toISOString().slice(0, 10), body: c.body })),
          history: t.history.slice(0, 15).map((h) => ({ at: h.createdAt.toISOString().slice(0, 16), actor: h.actor, what: h.summary })),
          created: t.createdAt.toISOString().slice(0, 10),
          statusSince: t.statusChangedAt.toISOString().slice(0, 10),
        });
      }),
    }),
    betaZodTool({
      name: "project_status",
      description:
        "Current state of one project: progress, milestones (with progress and fact-based risk reasons), blocked/overdue/stale tickets, bottlenecks, ticket-vs-GitHub discrepancies, recent activity and GitHub activity.",
      inputSchema: z.object({ projectKey: z.string() }),
      run: safe(async ({ projectKey }) => {
        const p = await getProjectByKey(projectKey);
        const ids = [p.id];
        const [progress, milestones, risks, blocked, overdue, stale, blockers, mismatches, activity, repoIds, evidence] = await Promise.all([
          progressByProject(ids),
          milestoneViews({ projectId: p.id }),
          milestonesAtRisk(p.id),
          listTickets({ projectIds: ids, blocked: true, categories: ["backlog", "todo", "in_progress", "in_review"] }),
          listTickets({ projectIds: ids, due: "overdue" }),
          staleTickets(ids),
          bottlenecks(ids),
          discrepancies(ids),
          recentActivity({ projectIds: ids, limit: 15 }),
          projectRepositoryIds(ids),
          evidenceBreakdown(ids),
        ]);
        const gh = await githubActivity({ repositoryIds: repoIds, days: 14, limit: 15 });
        return json({
          project: { key: p.key, name: p.name, status: p.status, targetDate: p.targetDate, description: p.description },
          progress: progress.get(p.id),
          evidence: evidence[0],
          milestones: milestones.map((m) => ({
            id: m.id,
            name: m.name,
            targetDate: m.targetDate,
            completed: !!m.completedAt,
            overdue: m.overdue,
            progress: { done: m.progress.done, total: m.progress.total, countPercent: m.progress.countPercent, estimatePercent: m.progress.estimatePercent },
            risks: risks.find((r) => r.milestone.id === m.id)?.reasons ?? [],
          })),
          blocked: blocked.map(row),
          overdue: overdue.map(row),
          stale: stale.map((s) => s.title),
          bottlenecks: blockers.slice(0, 5).map((b) => ({ key: b.ticket.key, blocksTotal: b.total, blocked: b.blocked.map((x) => x.key) })),
          discrepancies: mismatches.map((d) => ({ finding: d.title, detail: d.detail, evidence: d.url })),
          recentActivity: activity.map((a) => ({ at: a.createdAt.toISOString().slice(0, 16), ticket: a.ticketKey, what: a.summary, actor: a.actor })),
          github: {
            pullRequests: gh.pullRequests.map((x) => ({ repo: x.repo, number: x.number, title: x.title, state: x.state, checks: x.checksState, url: x.htmlUrl, linkedToTicket: x.linked })),
            commits: gh.commits.slice(0, 10).map((c) => ({ sha: c.sha.slice(0, 7), message: c.message.split("\n")[0], url: c.htmlUrl, linkedToTicket: c.linked })),
          },
        });
      }),
    }),
    betaZodTool({
      name: "insights",
      description:
        "Cross-project intelligence: recommendations with reasons, stale work, bottlenecks, ticket-vs-GitHub discrepancies, merged work with no ticket (last 14 days), milestone risks, roadmap gaps, planned vs tracked vs implementation-supported counts.",
      inputSchema: z.object({ projectKey: z.string().optional() }),
      run: safe(async ({ projectKey }) => {
        const r = await intelligenceReport(await projectIdsFor(projectKey));
        return json({
          recommendations: r.recommendations.map((x) => ({ ...row(x.ticket), score: x.score, reasons: x.reasons })),
          stale: r.stale.map((s) => s.title),
          bottlenecks: r.bottlenecks.slice(0, 8).map((b) => ({ key: b.ticket.key, title: b.ticket.title, blocksTotal: b.total })),
          discrepancies: r.discrepancies.map((d) => ({ finding: d.title, detail: d.detail, evidence: d.url })),
          untrackedWork: r.untracked,
          milestoneRisks: r.milestoneRisks.map((m) => ({ milestone: m.milestone.name, project: m.milestone.projectKey, target: m.milestone.targetDate, reasons: m.reasons })),
          gaps: r.gaps.map((g) => g.title),
          evidence: r.evidence,
        });
      }),
    }),
    betaZodTool({
      name: "recommend_next",
      description: "Ranked next tickets to work on, each with the scoring reasons (status, priority, due date, unblocking, milestone risk, CI). Blocked tickets are excluded.",
      inputSchema: z.object({ projectKey: z.string().optional(), limit: z.number().int().min(1).max(20).optional() }),
      run: safe(async (i) => {
        const recs = await recommendations({ projectIds: await projectIdsFor(i.projectKey), limit: i.limit ?? 7 });
        return json(recs.map((r) => ({ ...row(r.ticket), score: r.score, reasons: r.reasons })));
      }),
    }),
    betaZodTool({
      name: "accomplishments",
      description: "What got done in the last N days: tickets completed and created, merged pull requests, commit count.",
      inputSchema: z.object({ days: z.number().int().min(1).max(365).default(7), projectKey: z.string().optional() }),
      run: safe(async (i) => {
        const a = await accomplishments({ days: i.days, projectIds: await projectIdsFor(i.projectKey) });
        return json({
          since: a.since,
          completed: a.completed.map(row),
          createdCount: a.created.length,
          mergedPullRequests: a.mergedPullRequests,
          commitCount: a.commitCount,
        });
      }),
    }),
    betaZodTool({
      name: "github_activity",
      description: "Recent pull requests (state, CI) and commits from connected repositories, flagged by whether a ticket references them.",
      inputSchema: z.object({ projectKey: z.string().optional(), days: z.number().int().min(1).max(90).default(14) }),
      run: safe(async (i) => {
        const ids = await projectIdsFor(i.projectKey);
        const gh = await githubActivity({ repositoryIds: ids ? await projectRepositoryIds(ids) : undefined, days: i.days, limit: 40 });
        const untracked = await untrackedWork(ids);
        return json({
          pullRequests: gh.pullRequests.map((x) => ({ repo: x.repo, number: x.number, title: x.title, state: x.state, checks: x.checksState, url: x.htmlUrl, linkedToTicket: x.linked })),
          commits: gh.commits.map((c) => ({ repo: c.repo, sha: c.sha.slice(0, 7), message: c.message.split("\n")[0], branch: c.branch, url: c.htmlUrl, linkedToTicket: c.linked })),
          mergedWithoutTicket: untracked,
        });
      }),
    }),
    betaZodTool({
      name: "list_milestones",
      description: "Milestones (with ids, needed to reference existing milestones in proposals), target dates, progress and dependencies.",
      inputSchema: z.object({ projectKey: z.string().optional() }),
      run: safe(async ({ projectKey }) => {
        const p = projectKey ? await getProjectByKey(projectKey) : null;
        const ms = await milestoneViews({ projectId: p?.id });
        return json(
          ms.map((m) => ({
            id: m.id,
            project: m.projectKey,
            name: m.name,
            startDate: m.startDate,
            targetDate: m.targetDate,
            completed: !!m.completedAt,
            overdue: m.overdue,
            done: m.progress.done,
            total: m.progress.total,
            dependsOn: m.dependsOn.map((d) => ms.find((x) => x.id === d)?.name ?? d),
          })),
        );
      }),
    }),
    betaZodTool({
      name: "propose_changes",
      description: `Store proposed changes for the user to review, edit and apply. This does NOT change anything — never say changes were made.
Search existing tickets first; don't propose duplicates. Each item is an object with a "type":
- create_objective: {ref, title, description?, targetDate?}
- create_project: {ref, key (2-10 uppercase letters/digits, unused), name, description?, targetDate?, objective? (ref)}
- create_milestone: {ref, project (existing key or ref), name, description?, startDate?, targetDate?}
- create_ticket: {ref, project (existing key or ref), title, ticketType (feature|bug|task|improvement|research|documentation), priority (a configured priority name), description (markdown), acceptanceCriteria (markdown checklist), technicalNotes?, estimate? (points), dueDate?, milestone? (ref or existing milestone id), parent? (ref or existing ticket key), blockedBy? [refs or existing keys], labels? [names], rationale (why this ticket, priority and dependencies)}
- update_ticket: {key, title?, description?, acceptanceCriteria?, technicalNotes?, priority?, estimate?, dueDate?, rationale}
- add_dependency: {ticket, blockedBy} (refs or existing keys)
Dates are YYYY-MM-DD. Refs are short names like "t1" and must be defined before use.`,
      inputSchema: z.object({
        title: z.string().describe("short name for this proposal"),
        summary: z.string().describe("what this proposal does and any assumptions made"),
        items: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
      }),
      run: safe(async (input) => {
        const p = await createProposal({ title: input.title, payload: { summary: input.summary, items: input.items } });
        hooks.onProposal?.({ id: p.id, title: p.title });
        const duplicates = [];
        for (const item of p.payload.items)
          if (item.type === "create_ticket") {
            const similar = await findSimilarTickets(item.title);
            if (similar.length) duplicates.push({ proposed: item.title, similarExisting: similar.map((s) => `${s.key} ${s.title}`) });
          }
        return json({ proposalId: p.id, reviewUrl: `/assistant?proposal=${p.id}`, items: p.payload.items.length, possibleDuplicates: duplicates });
      }),
    }),
  ];
}

export async function systemPrompt() {
  const priorities = (await listPriorities()).map((p) => p.name).join(", ");
  return `You are Orbit's project assistant for a single developer's personal ticketing system. Today is ${today()}.

Ground every answer in data you retrieve with your tools in this conversation — never from memory or assumption. Retrieve before answering; prefer one well-chosen tool over many.

How to answer:
- Lead with the direct answer, then the supporting facts. Be concise.
- Link every ticket you mention as [KEY](/tickets/KEY) and pull requests/commits with their GitHub URL.
- Keep facts and inferences apart. Use a short "**Facts**" section for what the data shows and an "**Assumptions / interpretation**" section for anything you infer. If the data can't answer the question, say what's missing.
- Never invent completion percentages, delivery dates, forecasts or implementation evidence. Only quote percentages the tools return. A merged PR is evidence of code, not proof a ticket's acceptance criteria are met.

Proposing work (new tickets, breaking an objective into projects/milestones/tickets, writing descriptions or acceptance criteria, priorities, dependencies):
- First inspect what exists (search_tickets, list_projects, list_milestones) to avoid duplicates and to reuse existing projects/milestones.
- Then call propose_changes once with the complete set. Give each ticket a clear description, a testable acceptance-criteria checklist, a priority from: ${priorities}, and a rationale. Only add dependencies with a real ordering reason.
- After proposing, tell the user it's ready to review at the returned reviewUrl, and mention any possible duplicates flagged. Nothing is applied until they approve it.
- You cannot edit or delete anything directly.`;
}
