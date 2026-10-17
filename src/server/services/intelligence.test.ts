import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db";
import { repositories, tickets } from "@/db/schema";
import { addDays, today } from "@/lib/dates";
import { setupTestDb } from "../../../test/db";
import { handleWebhook } from "../github/webhook";
import { bottlenecks, discrepancies, evidenceBreakdown, milestonesAtRisk, recommendations, staleTickets } from "./intelligence";
import { createMilestone } from "./milestones";
import { createProject } from "./projects";
import { createTicket } from "./tickets";
import { listPriorities, listStatuses } from "./vocab";

setupTestDb();

async function setup() {
  const project = await createProject({ key: "ORB", name: "Orbit" });
  const statuses = await listStatuses();
  const priorities = await listPriorities();
  const cat = (c: string) => statuses.find((s) => s.category === c)!.id;
  const prio = (n: string) => priorities.find((p) => p.name === n)!.id;
  return { project, cat, prio };
}

describe("intelligence", () => {
  it("flags in-progress tickets untouched for a week, not fresh ones", async () => {
    const { project, cat } = await setup();
    const old = await createTicket({ projectId: project.id, title: "Old", statusId: cat("in_progress") });
    await createTicket({ projectId: project.id, title: "Fresh", statusId: cat("in_progress") });
    const db = await getDb();
    await db.update(tickets).set({ statusChangedAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(tickets.id, old.id));
    const stale = await staleTickets();
    expect(stale.map((s) => s.ticket?.key)).toEqual(["ORB-1"]);
    expect(stale[0].title).toMatch(/for 10 days/);
  });

  it("ranks bottlenecks by transitive blocked work", async () => {
    const { project } = await setup();
    const a = await createTicket({ projectId: project.id, title: "Schema" });
    const b = await createTicket({ projectId: project.id, title: "API", blockedByIds: [a.id] });
    await createTicket({ projectId: project.id, title: "UI", blockedByIds: [b.id] });
    const [top] = await bottlenecks();
    expect(top.ticket.key).toBe("ORB-1");
    expect([top.direct, top.total]).toEqual([1, 2]);
  });

  it("recommends with reasons, skipping blocked work", async () => {
    const { project, cat, prio } = await setup();
    const blocker = await createTicket({ projectId: project.id, title: "Blocker", statusId: cat("todo"), priorityId: prio("Medium") });
    await createTicket({ projectId: project.id, title: "Blocked urgent", statusId: cat("todo"), priorityId: prio("Urgent"), blockedByIds: [blocker.id] });
    await createTicket({ projectId: project.id, title: "Doing", statusId: cat("in_progress"), priorityId: prio("Low") });
    await createTicket({ projectId: project.id, title: "Overdue", statusId: cat("todo"), priorityId: prio("High"), dueDate: addDays(today(), -1) });
    const recs = await recommendations();
    const titles = recs.map((r) => r.ticket.title);
    expect(titles).not.toContain("Blocked urgent");
    expect(titles[0]).toBe("Overdue");
    expect(recs[0].reasons).toEqual(expect.arrayContaining(["High priority", expect.stringMatching(/^Overdue/)]));
    expect(recs.find((r) => r.ticket.title === "Blocker")!.reasons).toContain("Unblocks 1 other ticket(s)");
  });

  it("states milestone risk as facts", async () => {
    const { project } = await setup();
    const m = await createMilestone({ projectId: project.id, name: "MVP", targetDate: addDays(today(), -2) });
    await createTicket({ projectId: project.id, title: "X", milestoneId: m.id });
    const [risk] = await milestonesAtRisk();
    expect(risk.reasons[0]).toMatch(/has passed with 1 of 1 tickets not done/);
  });

  it("separates tracked from implementation-supported progress and spots discrepancies", async () => {
    const { project, cat } = await setup();
    const db = await getDb();
    await db.insert(repositories).values({ githubId: 1, owner: "me", name: "orbit", fullName: "me/orbit", htmlUrl: "https://github.com/me/orbit" });
    await createTicket({ projectId: project.id, title: "Shipped", statusId: cat("done") });
    await createTicket({ projectId: project.id, title: "Claimed", statusId: cat("done") });
    await createTicket({ projectId: project.id, title: "Building", statusId: cat("in_progress") });
    const pr = (n: number, key: string) => ({
      repository: { full_name: "me/orbit" },
      pull_request: {
        number: n, title: `${key} work`, body: "", state: "closed", merged: true, merged_at: new Date().toISOString(),
        head: { ref: key.toLowerCase(), sha: `sha${n}` }, base: { ref: "main" }, user: { login: "me" },
        html_url: `https://github.com/me/orbit/pull/${n}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
    });
    await handleWebhook("w1", "pull_request", pr(1, "ORB-1"));
    await handleWebhook("w3", "pull_request", pr(3, "ORB-3"));
    expect(await evidenceBreakdown()).toEqual([{ projectKey: "ORB", planned: 3, tracked: 2, supported: 1 }]);
    const d = await discrepancies();
    expect(d.map((x) => x.title)).toEqual(["ORB-3 is In Progress but PR #3 was merged"]);
  });
});
