import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { repositories } from "@/db/schema";
import { useTestDb } from "../../../test/db";
import { acceptSuggestion, addManualLink, githubActivity, pendingSuggestions } from "../services/github";
import { createProject } from "../services/projects";
import { createTicket, getTicket, getTicketSummary } from "../services/tickets";
import { aggregateChecks } from "./ingest";
import { extractTicketKeys, verifyWebhookSignature } from "./keys";
import { suggestFromPr } from "./suggestions";
import { handleWebhook } from "./webhook";

describe("extractTicketKeys", () => {
  const keys = ["ORB", "LAB"];
  it("finds known keys in branch names, titles and bodies, case-insensitively", () => {
    expect(extractTicketKeys("feature/orb-12-login-page", keys)).toEqual(["ORB-12"]);
    expect(extractTicketKeys("ORB-3: fix webhook (also LAB-7, ORB-3)", keys)).toEqual(["ORB-3", "LAB-7"]);
    expect(extractTicketKeys("Closes orb-04", keys)).toEqual(["ORB-4"]);
  });
  it("ignores unknown prefixes and look-alikes", () => {
    expect(extractTicketKeys("utf-8 and sha-256 and XORB-1 and ORB-12a3", keys)).toEqual([]);
    expect(extractTicketKeys(null, keys)).toEqual([]);
  });
});

describe("verifyWebhookSignature", () => {
  const body = '{"zen":"hi"}';
  const sig = `sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`;
  it("accepts the right signature and rejects anything else", () => {
    expect(verifyWebhookSignature(body, sig, "s3cret")).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig, "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, sig, "other")).toBe(false);
    expect(verifyWebhookSignature(body, null, "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, sig, undefined)).toBe(false);
  });
});

describe("suggestFromPr", () => {
  it("never treats a merge as anything but a suggestion to verify", () => {
    expect(suggestFromPr("in_review", { number: 4, state: "merged" })?.category).toBe("done");
    expect(suggestFromPr("in_review", { number: 4, state: "merged" })?.reason).toMatch(/acceptance criteria/);
    expect(suggestFromPr("done", { number: 4, state: "merged" })).toBeNull();
    expect(suggestFromPr("todo", { number: 4, state: "open" })?.category).toBe("in_review");
    expect(suggestFromPr("in_review", { number: 4, state: "open" })).toBeNull();
    expect(suggestFromPr("backlog", { number: 4, state: "draft" })?.category).toBe("in_progress");
  });
});

describe("aggregateChecks", () => {
  it("fails fast, then pending, then success", () => {
    expect(aggregateChecks(["success", "failure"])).toBe("failure");
    expect(aggregateChecks(["success", "in_progress"])).toBe("pending");
    expect(aggregateChecks(["success", "skipped"])).toBe("success");
    expect(aggregateChecks([])).toBeNull();
  });
});

describe("webhooks", () => {
  useTestDb();

  async function setup() {
    const project = await createProject({ key: "ORB", name: "Orbit" });
    const ticket = await createTicket({ projectId: project.id, title: "Login page" });
    const db = await getDb();
    const [repo] = await db
      .insert(repositories)
      .values({ githubId: 1, owner: "me", name: "orbit", fullName: "me/orbit", htmlUrl: "https://github.com/me/orbit" })
      .returning();
    return { project, ticket, repo };
  }

  const pr = (over: Record<string, unknown> = {}) => ({
    action: "opened",
    repository: { full_name: "me/orbit" },
    pull_request: {
      number: 7,
      title: "ORB-1 login page",
      body: "",
      state: "open",
      draft: false,
      merged: false,
      head: { ref: "orb-1-login", sha: "abc1234" },
      base: { ref: "main" },
      user: { login: "me" },
      html_url: "https://github.com/me/orbit/pull/7",
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
      ...over,
    },
  });

  it("links a PR to the ticket in its title and suggests (not applies) a status", async () => {
    const { ticket } = await setup();
    expect(await handleWebhook("d1", "pull_request", pr())).toEqual({ status: "processed" });
    const detail = await getTicket(ticket.id);
    expect(detail.links.map((l) => [l.kind, l.ref])).toEqual([["pr", "7"]]);
    expect(detail.status.category).toBe("backlog"); // unchanged
    expect(detail.suggestions.map((s) => s.suggestedCategory)).toEqual(["in_review"]);
  });

  it("is idempotent on delivery id", async () => {
    const { ticket } = await setup();
    await handleWebhook("d1", "pull_request", pr());
    expect(await handleWebhook("d1", "pull_request", pr())).toEqual({ status: "duplicate" });
    expect((await getTicket(ticket.id)).history.filter((h) => h.kind.startsWith("github.")).length).toBe(1);
  });

  it("a merged PR only suggests Done; accepting applies it", async () => {
    const { ticket } = await setup();
    await handleWebhook("d1", "pull_request", pr());
    await handleWebhook("d2", "pull_request", pr({ state: "closed", merged: true, merged_at: "2026-10-02T10:00:00Z" }));
    expect((await getTicketSummary(ticket.id)).status.category).toBe("backlog");
    const [s] = await pendingSuggestions();
    expect(s.suggestedCategory).toBe("done");
    await acceptSuggestion(s.id);
    expect((await getTicketSummary(ticket.id)).status.category).toBe("done");
  });

  it("ignores repositories that aren't connected", async () => {
    await setup();
    expect(await handleWebhook("d9", "pull_request", { ...pr(), repository: { full_name: "x/y" } })).toMatchObject({
      status: "ignored",
    });
  });

  it("links commits from pushes and reports unlinked commits", async () => {
    const { ticket, repo } = await setup();
    await handleWebhook("p1", "push", {
      ref: "refs/heads/main",
      after: "def5678",
      repository: { full_name: "me/orbit" },
      commits: [
        { id: "def5678", message: "ORB-1: wire form", url: "https://github.com/me/orbit/commit/def5678", timestamp: new Date().toISOString(), author: { name: "Me" } },
        { id: "aaa0000", message: "chore: deps", url: "https://github.com/me/orbit/commit/aaa0000", timestamp: new Date().toISOString(), author: { name: "Me" } },
      ],
    });
    expect((await getTicket(ticket.id)).links.map((l) => l.kind)).toEqual(["commit"]);
    const activity = await githubActivity({ repositoryIds: [repo.id] });
    expect(activity.commits.map((c) => [c.sha, c.linked])).toEqual(
      expect.arrayContaining([
        ["def5678", true],
        ["aaa0000", false],
      ]),
    );
  });

  it("supports manual file links", async () => {
    const { ticket, repo } = await setup();
    const link = await addManualLink({ ticketId: ticket.id, repositoryId: repo.id, kind: "file", ref: "src/app/page.tsx" });
    expect(link.url).toBe("https://github.com/me/orbit/blob/main/src/app/page.tsx");
  });
});
