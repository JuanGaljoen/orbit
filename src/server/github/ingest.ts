import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  ghBranches,
  ghCommits,
  ghPullRequests,
  projects,
  repositories,
  statusSuggestions,
  statuses,
  ticketLinks,
  tickets,
  type ChecksState,
  type LinkKind,
  type PrState,
  type StatusCategory,
} from "@/db/schema";
import { logActivity } from "../activity";
import { extractTicketKeys } from "./keys";
import { suggestFromPr, suggestFromWorkStarted, type Suggestion } from "./suggestions";

export type Repo = typeof repositories.$inferSelect;

export type PrData = {
  number: number;
  title: string;
  body: string;
  state: PrState;
  headRef: string;
  headSha: string;
  baseRef: string;
  authorLogin: string | null;
  htmlUrl: string;
  openedAt: Date;
  mergedAt: Date | null;
  closedAt: Date | null;
  updatedAt: Date;
};

export type CommitData = {
  sha: string;
  message: string;
  authorLogin: string | null;
  authorName: string | null;
  htmlUrl: string;
  committedAt: Date;
  branch: string | null;
};

type LinkedTicket = { id: string; key: string; projectId: string; category: StatusCategory; isNew: boolean };

/** Finds tickets named in `texts` and links them to the artefact. Returns every linked ticket. */
async function linkTickets(
  repo: Repo,
  link: { kind: LinkKind; ref: string; title: string; url: string },
  texts: (string | null | undefined)[],
): Promise<LinkedTicket[]> {
  const db = await getDb();
  const keys = await db.select({ key: projects.key }).from(projects).then((r) => r.map((x) => x.key));
  const found = [...new Set(texts.flatMap((t) => extractTicketKeys(t, keys)))];
  if (!found.length) return [];

  const rows = await db
    .select({ id: tickets.id, projectId: tickets.projectId, key: projects.key, number: tickets.number, category: statuses.category })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .innerJoin(statuses, eq(statuses.id, tickets.statusId))
    .where(inArray(sql`${projects.key} || '-' || ${tickets.number}`, found));

  const linked: LinkedTicket[] = [];
  for (const t of rows) {
    const where = and(
      eq(ticketLinks.ticketId, t.id),
      eq(ticketLinks.repositoryId, repo.id),
      eq(ticketLinks.kind, link.kind),
      eq(ticketLinks.ref, link.ref),
    );
    const [existing] = await db.select({ id: ticketLinks.id }).from(ticketLinks).where(where);
    if (existing) await db.update(ticketLinks).set({ title: link.title, url: link.url }).where(where);
    else
      await db
        .insert(ticketLinks)
        .values({ ticketId: t.id, repositoryId: repo.id, ...link, source: "auto" })
        .onConflictDoNothing();
    const isNew = !existing;
    linked.push({ id: t.id, key: `${t.key}-${t.number}`, projectId: t.projectId, category: t.category, isNew });
  }
  return linked;
}

/** Records a pending suggestion unless the same one (ticket + category + evidence) was ever made. */
async function recordSuggestion(ticket: LinkedTicket, s: Suggestion | null, evidenceUrl: string) {
  if (!s) return;
  const db = await getDb();
  const [seen] = await db
    .select({ id: statusSuggestions.id })
    .from(statusSuggestions)
    .where(
      and(
        eq(statusSuggestions.ticketId, ticket.id),
        eq(statusSuggestions.suggestedCategory, s.category),
        eq(statusSuggestions.evidenceUrl, evidenceUrl),
      ),
    );
  if (seen) return;
  // Older pending suggestions for this ticket are now stale.
  await db
    .update(statusSuggestions)
    .set({ state: "dismissed", resolvedAt: new Date() })
    .where(and(eq(statusSuggestions.ticketId, ticket.id), eq(statusSuggestions.state, "pending")));
  await db.insert(statusSuggestions).values({
    ticketId: ticket.id,
    suggestedCategory: s.category,
    reason: s.reason,
    evidenceUrl,
  });
}

export async function upsertPullRequest(repo: Repo, pr: PrData) {
  const db = await getDb();
  const [prev] = await db
    .select({ state: ghPullRequests.state })
    .from(ghPullRequests)
    .where(and(eq(ghPullRequests.repositoryId, repo.id), eq(ghPullRequests.number, pr.number)));
  const values = {
    repositoryId: repo.id,
    number: pr.number,
    title: pr.title,
    body: pr.body,
    state: pr.state,
    headRef: pr.headRef,
    headSha: pr.headSha,
    baseRef: pr.baseRef,
    authorLogin: pr.authorLogin,
    htmlUrl: pr.htmlUrl,
    openedAt: pr.openedAt,
    mergedAt: pr.mergedAt,
    closedAt: pr.closedAt,
    ghUpdatedAt: pr.updatedAt,
  };
  await db
    .insert(ghPullRequests)
    .values(values)
    .onConflictDoUpdate({ target: [ghPullRequests.repositoryId, ghPullRequests.number], set: values });

  const linked = await linkTickets(
    repo,
    { kind: "pr", ref: String(pr.number), title: pr.title, url: pr.htmlUrl },
    [pr.title, pr.body, pr.headRef],
  );
  const changed = prev?.state !== pr.state;
  for (const t of linked) {
    if (changed || t.isNew)
      await logActivity(db, {
        kind: `github.pr_${pr.state}`,
        entityType: "ticket",
        entityId: t.id,
        projectId: t.projectId,
        ticketId: t.id,
        summary: `PR #${pr.number} ${pr.state === "open" ? "opened" : pr.state}: ${pr.title}`,
        data: { url: pr.htmlUrl, repo: repo.fullName, number: pr.number, state: pr.state },
        actor: "github",
      });
    await recordSuggestion(t, suggestFromPr(t.category, pr), pr.htmlUrl);
  }
  return linked;
}

export async function upsertCommits(repo: Repo, commits: CommitData[]) {
  const db = await getDb();
  for (const c of commits) {
    const inserted = await db
      .insert(ghCommits)
      .values({ repositoryId: repo.id, ...c })
      .onConflictDoNothing()
      .returning({ id: ghCommits.id });
    const linked = await linkTickets(
      repo,
      { kind: "commit", ref: c.sha, title: c.message.split("\n")[0], url: c.htmlUrl },
      [c.message],
    );
    for (const t of linked) {
      if (inserted.length && t.isNew)
        await logActivity(db, {
          kind: "github.commit",
          entityType: "ticket",
          entityId: t.id,
          projectId: t.projectId,
          ticketId: t.id,
          summary: `Commit ${c.sha.slice(0, 7)}: ${c.message.split("\n")[0]}`,
          data: { url: c.htmlUrl, repo: repo.fullName, sha: c.sha },
          actor: "github",
        });
      await recordSuggestion(t, suggestFromWorkStarted(t.category, `Commit ${c.sha.slice(0, 7)} references this ticket`), c.htmlUrl);
    }
  }
}

export async function upsertBranch(repo: Repo, branch: { name: string; headSha: string }) {
  const db = await getDb();
  await db
    .insert(ghBranches)
    .values({ repositoryId: repo.id, name: branch.name, headSha: branch.headSha, deletedAt: null })
    .onConflictDoUpdate({
      target: [ghBranches.repositoryId, ghBranches.name],
      set: { headSha: branch.headSha, deletedAt: null },
    });
  if (branch.name === repo.defaultBranch) return;
  const url = `${repo.htmlUrl}/tree/${encodeURIComponent(branch.name)}`;
  const linked = await linkTickets(repo, { kind: "branch", ref: branch.name, title: branch.name, url }, [branch.name]);
  for (const t of linked) {
    if (t.isNew)
      await logActivity(db, {
        kind: "github.branch",
        entityType: "ticket",
        entityId: t.id,
        projectId: t.projectId,
        ticketId: t.id,
        summary: `Branch ${branch.name} created`,
        data: { url, repo: repo.fullName },
        actor: "github",
      });
    await recordSuggestion(t, suggestFromWorkStarted(t.category, `Branch ${branch.name} created`), url);
  }
}

export async function markBranchDeleted(repo: Repo, name: string) {
  const db = await getDb();
  await db
    .update(ghBranches)
    .set({ deletedAt: new Date() })
    .where(and(eq(ghBranches.repositoryId, repo.id), eq(ghBranches.name, name)));
}

/** Aggregated CI state for a head SHA → stored on matching PRs/commits; a new failure is logged. */
export async function setChecksState(repo: Repo, headSha: string, state: ChecksState) {
  const db = await getDb();
  const prs = await db
    .update(ghPullRequests)
    .set({ checksState: state })
    .where(
      and(
        eq(ghPullRequests.repositoryId, repo.id),
        eq(ghPullRequests.headSha, headSha),
        sql`${ghPullRequests.checksState} is distinct from ${state}`,
      ),
    )
    .returning();
  await db
    .update(ghCommits)
    .set({ checksState: state })
    .where(and(eq(ghCommits.repositoryId, repo.id), eq(ghCommits.sha, headSha)));
  if (state !== "failure") return;
  for (const pr of prs) {
    const links = await db
      .select({ ticketId: ticketLinks.ticketId, projectId: tickets.projectId })
      .from(ticketLinks)
      .innerJoin(tickets, eq(tickets.id, ticketLinks.ticketId))
      .where(and(eq(ticketLinks.repositoryId, repo.id), eq(ticketLinks.kind, "pr"), eq(ticketLinks.ref, String(pr.number))));
    for (const l of links)
      await logActivity(db, {
        kind: "github.checks_failed",
        entityType: "ticket",
        entityId: l.ticketId,
        projectId: l.projectId,
        ticketId: l.ticketId,
        summary: `CI failing on PR #${pr.number}`,
        data: { url: pr.htmlUrl, repo: repo.fullName },
        actor: "github",
      });
  }
}

/** Combine check-run conclusions / commit statuses into one state. */
export function aggregateChecks(states: (string | null | undefined)[]): ChecksState | null {
  const s = states.filter(Boolean) as string[];
  if (!s.length) return null;
  if (s.some((x) => ["failure", "timed_out", "cancelled", "action_required", "error", "startup_failure"].includes(x)))
    return "failure";
  if (s.some((x) => ["pending", "queued", "in_progress", "waiting", "requested", "expected"].includes(x))) return "pending";
  if (s.every((x) => ["neutral", "skipped", "stale"].includes(x))) return "neutral";
  return "success";
}

export async function repoByFullName(fullName: string) {
  const db = await getDb();
  const [r] = await db.select().from(repositories).where(eq(repositories.fullName, fullName));
  return r ?? null;
}

