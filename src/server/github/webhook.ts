import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { repositories, webhookDeliveries } from "@/db/schema";
import {
  aggregateChecks,
  markBranchDeleted,
  repoByFullName,
  setChecksState,
  upsertBranch,
  upsertCommits,
  upsertPullRequest,
  type PrData,
} from "./ingest";

/* eslint-disable @typescript-eslint/no-explicit-any -- GitHub payloads are untyped JSON; each field read is guarded. */

export type WebhookResult = { status: "processed" | "duplicate" | "ignored"; detail?: string };

export function prFromPayload(pr: any): PrData {
  return {
    number: pr.number,
    title: pr.title ?? "",
    body: pr.body ?? "",
    state: pr.merged || pr.merged_at ? "merged" : pr.state === "closed" ? "closed" : pr.draft ? "draft" : "open",
    headRef: pr.head?.ref ?? "",
    headSha: pr.head?.sha ?? "",
    baseRef: pr.base?.ref ?? "",
    authorLogin: pr.user?.login ?? null,
    htmlUrl: pr.html_url,
    openedAt: new Date(pr.created_at),
    mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
    closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
    updatedAt: new Date(pr.updated_at ?? pr.created_at),
  };
}

/**
 * Processes one verified delivery. Idempotent on `X-GitHub-Delivery`: a delivery that already
 * processed is a no-op; one that failed is retried when GitHub redelivers it.
 */
export async function handleWebhook(deliveryId: string, event: string, payload: any): Promise<WebhookResult> {
  const db = await getDb();
  const fullName: string | null = payload?.repository?.full_name ?? null;

  const [claimed] = await db
    .insert(webhookDeliveries)
    .values({ deliveryId, event, repositoryFullName: fullName })
    .onConflictDoNothing()
    .returning();
  if (!claimed) {
    const [prior] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.deliveryId, deliveryId));
    if (prior?.processedAt || !prior?.error) return { status: "duplicate" };
  }

  const done = (error: string | null = null) =>
    db.update(webhookDeliveries).set({ processedAt: error ? null : new Date(), error }).where(eq(webhookDeliveries.deliveryId, deliveryId));

  try {
    if (event === "ping") {
      await done();
      return { status: "processed", detail: "pong" };
    }
    const repo = fullName ? await repoByFullName(fullName) : null;
    if (!repo) {
      await done();
      return { status: "ignored", detail: "repository not connected" };
    }
    await db.update(repositories).set({ lastWebhookAt: new Date() }).where(eq(repositories.id, repo.id));

    switch (event) {
      case "pull_request":
        await upsertPullRequest(repo, prFromPayload(payload.pull_request));
        break;
      case "push": {
        const branch = String(payload.ref ?? "").replace(/^refs\/heads\//, "");
        if (!String(payload.ref ?? "").startsWith("refs/heads/")) break;
        if (payload.deleted) {
          await markBranchDeleted(repo, branch);
          break;
        }
        if (payload.after) await upsertBranch(repo, { name: branch, headSha: payload.after });
        await upsertCommits(
          repo,
          (payload.commits ?? []).map((c: any) => ({
            sha: c.id,
            message: c.message ?? "",
            authorLogin: c.author?.username ?? null,
            authorName: c.author?.name ?? null,
            htmlUrl: c.url,
            committedAt: new Date(c.timestamp),
            branch,
          })),
        );
        break;
      }
      case "create":
        if (payload.ref_type === "branch")
          await upsertBranch(repo, { name: payload.ref, headSha: "" }); // create events carry no sha
        break;
      case "delete":
        if (payload.ref_type === "branch") await markBranchDeleted(repo, payload.ref);
        break;
      case "check_suite": {
        const suite = payload.check_suite;
        const state = aggregateChecks([suite?.status === "completed" ? suite?.conclusion : suite?.status]);
        if (suite?.head_sha && state) await setChecksState(repo, suite.head_sha, state);
        break;
      }
      case "check_run": {
        const run = payload.check_run;
        const state = aggregateChecks([run?.status === "completed" ? run?.conclusion : run?.status]);
        if (run?.head_sha && state) await setChecksState(repo, run.head_sha, state);
        break;
      }
      case "status": {
        const state = aggregateChecks([payload.state]);
        if (payload.sha && state) await setChecksState(repo, payload.sha, state);
        break;
      }
      default:
        await done();
        return { status: "ignored", detail: `event ${event} not used` };
    }
    await done();
    return { status: "processed" };
  } catch (err) {
    await done(err instanceof Error ? err.message : String(err));
    throw err;
  }
}
