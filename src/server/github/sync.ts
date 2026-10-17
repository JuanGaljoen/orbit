import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { repositories } from "@/db/schema";
import { logActivity } from "../activity";
import { NotFoundError } from "../errors";
import { octokit } from "./client";
import { aggregateChecks, setChecksState, upsertBranch, upsertCommits, upsertPullRequest, type Repo } from "./ingest";
import { prFromPayload } from "./webhook";

const COMMIT_WINDOW_DAYS = 30;

/**
 * Pull-based sync for when webhooks are unavailable (or to backfill after connecting).
 * Bounded: 300 branches, 100 most recently updated PRs, 30 days of commits on the default branch
 * and on branches whose names mention a ticket.
 */
export async function syncRepository(repoId: string) {
  const db = await getDb();
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, repoId));
  if (!repo) throw new NotFoundError("Repository not found");
  await db.update(repositories).set({ syncStatus: "syncing", syncError: null }).where(eq(repositories.id, repo.id));

  try {
    const gh = octokit();
    const { owner, name } = repo;
    const { data: meta } = await gh.repos.get({ owner, repo: name });
    const fresh: Repo = {
      ...repo,
      description: meta.description ?? "",
      defaultBranch: meta.default_branch,
      private: meta.private,
      htmlUrl: meta.html_url,
    };
    await db
      .update(repositories)
      .set({ description: fresh.description, defaultBranch: fresh.defaultBranch, private: fresh.private, htmlUrl: fresh.htmlUrl })
      .where(eq(repositories.id, repo.id));

    const branches = await gh.paginate(gh.repos.listBranches, { owner, repo: name, per_page: 100 }, (r, stop) => {
      if (r.data.length >= 300) stop();
      return r.data;
    });
    for (const b of branches.slice(0, 300)) await upsertBranch(fresh, { name: b.name, headSha: b.commit.sha });

    const { data: prs } = await gh.pulls.list({ owner, repo: name, state: "all", sort: "updated", direction: "desc", per_page: 100 });
    for (const pr of prs) await upsertPullRequest(fresh, prFromPayload(pr));

    const since = new Date(Date.now() - COMMIT_WINDOW_DAYS * 86_400_000).toISOString();
    const commitBranches = [fresh.defaultBranch, ...branches.map((b) => b.name).filter((n) => /[A-Za-z]-\d/.test(n) && n !== fresh.defaultBranch)].slice(0, 25);
    for (const branch of commitBranches) {
      const { data: commits } = await gh.repos.listCommits({ owner, repo: name, sha: branch, since, per_page: 100 });
      await upsertCommits(
        fresh,
        commits.map((c) => ({
          sha: c.sha,
          message: c.commit.message,
          authorLogin: c.author?.login ?? null,
          authorName: c.commit.author?.name ?? null,
          htmlUrl: c.html_url,
          committedAt: new Date(c.commit.author?.date ?? c.commit.committer?.date ?? Date.now()),
          branch,
        })),
      );
    }

    for (const pr of prs.filter((p) => p.state === "open")) {
      const [runs, status] = await Promise.all([
        gh.checks.listForRef({ owner, repo: name, ref: pr.head.sha, per_page: 100 }).catch(() => null),
        gh.repos.getCombinedStatusForRef({ owner, repo: name, ref: pr.head.sha }).catch(() => null),
      ]);
      const state = aggregateChecks([
        ...(runs?.data.check_runs.map((r) => (r.status === "completed" ? r.conclusion : r.status)) ?? []),
        ...(status?.data.statuses.map((s) => s.state) ?? []),
      ]);
      if (state) await setChecksState(fresh, pr.head.sha, state);
    }

    await db
      .update(repositories)
      .set({ syncStatus: "ok", lastSyncedAt: new Date(), syncError: null })
      .where(eq(repositories.id, repo.id));
    return { branches: branches.length, pullRequests: prs.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(repositories).set({ syncStatus: "error", syncError: message }).where(eq(repositories.id, repo.id));
    await logActivity(db, {
      kind: "github.sync_failed",
      entityType: "repository",
      entityId: repo.id,
      summary: `Sync of ${repo.fullName} failed: ${message}`,
      actor: "system",
    });
    throw err;
  }
}
