import { describe, expect, it } from "vitest";
import { setupTestDb } from "../../../test/db";
import { createMilestone } from "../services/milestones";
import { createProject } from "../services/projects";
import { listProposals } from "../services/proposals";
import { createTicket } from "../services/tickets";
import { buildTools, systemPrompt } from "./tools";

setupTestDb();

describe("assistant tools", () => {
  it("every read tool returns JSON built from real data", async () => {
    const p = await createProject({ key: "ORB", name: "Orbit" });
    await createMilestone({ projectId: p.id, name: "MVP", targetDate: "2026-12-01" });
    await createTicket({ projectId: p.id, title: "Board drag and drop" });
    const tools = Object.fromEntries(buildTools().map((t) => [t.name, t]));
    const call = async (name: string, input: unknown) => JSON.parse(String(await tools[name].run(input as never)));

    expect((await call("list_projects", {}))[0]).toMatchObject({ key: "ORB", progress: { total: 1, done: 0 } });
    expect((await call("search_tickets", { query: "drag" })).tickets[0]).toMatchObject({ key: "ORB-1", url: "/tickets/ORB-1" });
    expect(await call("get_ticket", { key: "ORB-1" })).toMatchObject({ title: "Board drag and drop" });
    expect((await call("project_status", { projectKey: "ORB" })).milestones[0].name).toBe("MVP");
    expect(await call("insights", {})).toHaveProperty("recommendations");
    expect(await call("recommend_next", {})).toEqual([]); // backlog-only work scores ≤ 0
    expect(await call("accomplishments", { days: 7 })).toMatchObject({ createdCount: 1 });
    expect(await call("github_activity", { days: 14 })).toMatchObject({ pullRequests: [] });
    expect((await call("list_milestones", {}))[0]).toHaveProperty("id");
  });

  it("returns domain errors as text instead of throwing", async () => {
    const [getTicket] = buildTools().filter((t) => t.name === "get_ticket");
    expect(await getTicket.run({ key: "NOPE-1" } as never)).toMatch(/^Error: /);
  });

  it("propose_changes only stores a proposal and flags duplicates", async () => {
    const p = await createProject({ key: "ORB", name: "Orbit" });
    await createTicket({ projectId: p.id, title: "Webhook signature verification" });
    const seen: string[] = [];
    const [propose] = buildTools({ onProposal: (x) => seen.push(x.id) }).filter((t) => t.name === "propose_changes");
    const out = JSON.parse(
      String(
        await propose.run({
          title: "Hardening",
          summary: "",
          items: [{ type: "create_ticket", ref: "t1", project: "ORB", title: "Verify webhook signature", priority: "High" }],
        } as never),
      ),
    );
    expect(out.possibleDuplicates[0].similarExisting[0]).toMatch(/^ORB-1/);
    expect(seen).toEqual([out.proposalId]);
    expect((await listProposals("pending")).length).toBe(1);
  });

  it("system prompt names the configured priorities", async () => {
    expect(await systemPrompt()).toMatch(/Urgent, High, Medium, Low/);
  });
});
