import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  ghBranches,
  ghCommits,
  ghPullRequests,
  LINK_KINDS,
  projectRepos,
  repositories,
  statusSuggestions,
  ticketLinks,
  tickets,
  webhookDeliveries,
} from "@/db/schema";
import { logActivity } from "../activity";
import { ConflictError, InvalidError, NotFoundError } from "../errors";
import { githubConfigured, octokit, webhookConfigured } from "../github/client";
import { parse } from "../validation";
import { updateTicket } from "./tickets";
import { statusForCategory } from "./vocab";

export async function listRepositories() {
  const db = await getDb();
  return db.select().from(repositories).orderBy(asc(repositories.fullName));
}

/** Repos the PAT can see — for the "connect a repository" picker. */
export async function listAccessibleRepos() {
  const gh = octokit();
  const repos = await gh.paginate(gh.repos.listForAuthenticatedUser, { per_page: 100, sort: "updated" });
  return repos.map((r) => ({ fullName: r.full_name, private: r.private, description: r.description ?? "" }));
}

const fullNameSchema = z.string().trim().regex(/^[\w.-]+\/[\w.-]+$/, "Expected owner/name");

export async function connectRepository(fullName: string) {
  const name = parse(fullNameSchema, fullName);
  const db = await getDb();
  const [exists] = await db.select().from(repositories).where(eq(repositories.fullName, name));
  if (exists) throw new ConflictError(`${name} is already connected`);
  const [owner, repo] = name.split("/");
  const { data } = await octokit()
    .repos.get({ owner, repo })
    .catch(() => {
      throw new InvalidError(`GitHub returned no access to ${name} — check the token's repository access`);
    });
  const [row] = await db
    .insert(repositories)
    .values({
      githubId: data.id,
      owner: data.owner.login,
      name: data.name,
      fullName: data.full_name,
      description: data.description ?? "",
      defaultBranch: data.default_branch,
      private: data.private,
      htmlUrl: data.html_url,
    })
    .returning();
  await logActivity(db, {
    kind: "github.repo_connected",
    entityType: "repository",
    entityId: row.id,
    summary: `Connected ${row.fullName}`,
  });
  return row;
}

/** Removes the repo and everything synced from it (links included). Tickets are untouched. */
export async function disconnectRepository(id: string) {
  const db = await getDb();
  const [row] = await db.delete(repositories).where(eq(repositories.id, id)).returning();
  if (!row) throw new NotFoundError("Repository not found");
  await logActivity(db, { kind: "github.repo_disconnected", entityType: "repository", summary: `Disconnected ${row.fullName}` });
}

const manualLinkInput = z.object({
  ticketId: z.uuid(),
  repositoryId: z.uuid(),
  kind: z.enum(LINK_KINDS),
  ref: z.string().trim().min(1).max(500),
});

/** Link a ticket to a branch, commit, PR number or file path by hand. */
export async function addManualLink(input: z.input<typeof manualLinkInput>) {
  const data = parse(manualLinkInput, input);
  const db = await getDb();
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, data.repositoryId));
  if (!repo) throw new NotFoundError("Repository not found");
  let url: string;
  let title = data.ref;
  switch (data.kind) {
    case "pr": {
      const n = Number(data.ref.replace(/^#/, ""));
      if (!Number.isInteger(n) || n <= 0) throw new InvalidError("PR reference must be a number");
      data.ref = String(n);
      const [pr] = await db
        .select()
        .from(ghPullRequests)
        .where(and(eq(ghPullRequests.repositoryId, repo.id), eq(ghPullRequests.number, n)));
      url = pr?.htmlUrl ?? `${repo.htmlUrl}/pull/${n}`;
      title = pr?.title ?? `PR #${n}`;
      break;
    }
    case "commit":
      if (!/^[0-9a-f]{7,40}$/i.test(data.ref)) throw new InvalidError("Commit must be a hex SHA");
      url = `${repo.htmlUrl}/commit/${data.ref}`;
      break;
    case "branch":
      url = `${repo.htmlUrl}/tree/${encodeURIComponent(data.ref)}`;
      break;
    case "file":
      url = `${repo.htmlUrl}/blob/${repo.defaultBranch}/${data.ref.replace(/^\/+/, "")}`;
      break;
  }
  const [row] = await db
    .insert(ticketLinks)
    .values({ ...data, title, url, source: "manual" })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new ConflictError("That link already exists");
  const [t] = await db.select({ projectId: tickets.projectId }).from(tickets).where(eq(tickets.id, data.ticketId));
  await logActivity(db, {
    kind: "ticket.linked",
    entityType: "ticket",
    entityId: data.ticketId,
    projectId: t?.projectId,
    ticketId: data.ticketId,
    summary: `Linked ${data.kind} ${title}`,
    data: { url },
  });
  return row;
}

export async function removeLink(id: string) {
  const db = await getDb();
  await db.delete(ticketLinks).where(eq(ticketLinks.id, id));
}

/** Applies a suggestion: the user has looked at the evidence and agreed. */
export async function acceptSuggestion(id: string) {
  const db = await getDb();
  const [s] = await db.select().from(statusSuggestions).where(eq(statusSuggestions.id, id));
  if (!s || s.state !== "pending") throw new NotFoundError("Suggestion not found or already resolved");
  const status = await statusForCategory(s.suggestedCategory);
  await updateTicket(s.ticketId, { statusId: status.id });
  await db.update(statusSuggestions).set({ state: "accepted", resolvedAt: new Date() }).where(eq(statusSuggestions.id, id));
}

export async function dismissSuggestion(id: string) {
  const db = await getDb();
  await db.update(statusSuggestions).set({ state: "dismissed", resolvedAt: new Date() }).where(eq(statusSuggestions.id, id));
}

export async function pendingSuggestions() {
  const db = await getDb();
  return db
    .select()
    .from(statusSuggestions)
    .where(eq(statusSuggestions.state, "pending"))
    .orderBy(desc(statusSuggestions.createdAt));
}

/** Recent PRs and commits for a set of repositories (a project's, or all). */
export async function githubActivity(opts: { repositoryIds?: string[]; days?: number; limit?: number } = {}) {
  const db = await getDb();
  const since = new Date(Date.now() - (opts.days ?? 14) * 86_400_000);
  const repoFilter = (col: typeof ghPullRequests.repositoryId | typeof ghCommits.repositoryId) =>
    opts.repositoryIds ? inArray(col, opts.repositoryIds) : undefined;
  if (opts.repositoryIds && !opts.repositoryIds.length) return { pullRequests: [], commits: [], branches: [] };

  const [prs, commits, branches] = await Promise.all([
    db
      .select({ pr: ghPullRequests, repo: repositories.fullName })
      .from(ghPullRequests)
      .innerJoin(repositories, eq(repositories.id, ghPullRequests.repositoryId))
      .where(and(repoFilter(ghPullRequests.repositoryId), gte(ghPullRequests.ghUpdatedAt, since)))
      .orderBy(desc(ghPullRequests.ghUpdatedAt))
      .limit(opts.limit ?? 30),
    db
      .select({ c: ghCommits, repo: repositories.fullName })
      .from(ghCommits)
      .innerJoin(repositories, eq(repositories.id, ghCommits.repositoryId))
      .where(and(repoFilter(ghCommits.repositoryId), gte(ghCommits.committedAt, since)))
      .orderBy(desc(ghCommits.committedAt))
      .limit(opts.limit ?? 30),
    db
      .select({ b: ghBranches, repo: repositories.fullName })
      .from(ghBranches)
      .innerJoin(repositories, eq(repositories.id, ghBranches.repositoryId))
      .where(and(opts.repositoryIds ? inArray(ghBranches.repositoryId, opts.repositoryIds) : undefined, isNull(ghBranches.deletedAt)))
      .orderBy(desc(ghBranches.updatedAt))
      .limit(50),
  ]);
  const prLinks = prs.length
    ? await db
        .select({ ref: ticketLinks.ref, repositoryId: ticketLinks.repositoryId })
        .from(ticketLinks)
        .where(and(eq(ticketLinks.kind, "pr"), inArray(ticketLinks.repositoryId, [...new Set(prs.map((p) => p.pr.repositoryId))])))
    : [];
  const commitLinks = commits.length
    ? await db
        .select({ ref: ticketLinks.ref })
        .from(ticketLinks)
        .where(and(eq(ticketLinks.kind, "commit"), inArray(ticketLinks.ref, commits.map((c) => c.c.sha))))
    : [];
  return {
    pullRequests: prs.map(({ pr, repo }) => ({
      ...pr,
      repo,
      linked: prLinks.some((l) => l.repositoryId === pr.repositoryId && l.ref === String(pr.number)),
    })),
    commits: commits.map(({ c, repo }) => ({ ...c, repo, linked: commitLinks.some((l) => l.ref === c.sha) })),
    branches: branches.map(({ b, repo }) => ({ ...b, repo })),
  };
}

/** The synced PR rows behind a ticket's PR links (state + CI). */
export async function linkedPullRequests(links: { kind: string; repositoryId: string; ref: string }[]) {
  const prLinks = links.filter((l) => l.kind === "pr");
  if (!prLinks.length) return [];
  const db = await getDb();
  const rows = await db
    .select()
    .from(ghPullRequests)
    .where(inArray(ghPullRequests.repositoryId, [...new Set(prLinks.map((l) => l.repositoryId))]));
  return rows.filter((pr) => prLinks.some((l) => l.repositoryId === pr.repositoryId && l.ref === String(pr.number)));
}

export async function projectRepositoryIds(projectIds: string[]) {
  if (!projectIds.length) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: projectRepos.repositoryId })
    .from(projectRepos)
    .where(inArray(projectRepos.projectId, projectIds));
  return [...new Set(rows.map((r) => r.id))];
}

export async function integrationHealth() {
  const db = await getDb();
  const [repos, failedDeliveries, recentDeliveries] = await Promise.all([
    listRepositories(),
    db
      .select()
      .from(webhookDeliveries)
      .where(isNull(webhookDeliveries.processedAt))
      .orderBy(desc(webhookDeliveries.receivedAt))
      .limit(20),
    db.select().from(webhookDeliveries).orderBy(desc(webhookDeliveries.receivedAt)).limit(10),
  ]);
  return {
    githubConfigured: githubConfigured(),
    webhookConfigured: webhookConfigured(),
    repos,
    failedDeliveries: failedDeliveries.filter((d) => d.error),
    recentDeliveries,
  };
}
