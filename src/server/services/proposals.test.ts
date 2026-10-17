import { describe, expect, it } from "vitest";
import { setupTestDb } from "../../../test/db";
import { applyProposal, createProposal, discardProposal, findSimilarTickets, getProposal } from "./proposals";
import { createProject } from "./projects";
import { createTicket, getTicketByKey, listTickets } from "./tickets";

setupTestDb();

describe("AI proposals", () => {
  it("applies a reviewed plan with cross-references, in order", async () => {
    const existing = await createProject({ key: "ORB", name: "Orbit" });
    const login = await createTicket({ projectId: existing.id, title: "Login" });
    const p = await createProposal({
      title: "Launch plan",
      payload: {
        items: [
          { type: "create_objective", ref: "o1", title: "Ship v1" },
          { type: "create_project", ref: "p1", key: "web", name: "Website", objective: "o1" },
          { type: "create_milestone", ref: "m1", project: "p1", name: "Beta", targetDate: "2026-12-01" },
          { type: "create_ticket", ref: "t1", project: "p1", title: "Landing page", priority: "High", milestone: "m1", acceptanceCriteria: "- [ ] renders", labels: ["frontend"] },
          { type: "create_ticket", ref: "t2", project: "p1", title: "Signup form", milestone: "m1", blockedBy: ["t1", login.key] },
          { type: "update_ticket", key: "ORB-1", acceptanceCriteria: "- [ ] works" },
        ],
      },
    });
    expect(p.state).toBe("pending");
    expect(await listTickets({ q: "Landing" })).toHaveLength(0); // nothing applied yet

    const applied = await applyProposal(p.id);
    expect(applied).toHaveLength(6);
    const signup = await getTicketByKey("WEB-2");
    expect(signup.blockers.map((b) => b.key).sort()).toEqual(["ORB-1", "WEB-1"]);
    expect(signup.milestoneName).toBe("Beta");
    expect((await getTicketByKey("WEB-1")).labels.map((l) => l.name)).toEqual(["frontend"]);
    expect((await getTicketByKey("ORB-1")).acceptanceCriteria).toBe("- [ ] works");
    expect((await getProposal(p.id)).state).toBe("applied");
    await expect(applyProposal(p.id)).rejects.toThrow(/already resolved/);
  });

  it("rejects unresolvable references before writing anything", async () => {
    await expect(
      createProposal({ title: "Bad", payload: { items: [{ type: "create_ticket", ref: "t1", project: "NOPE", title: "X" }] } }),
    ).rejects.toThrow(/unknown project "NOPE"/);
    await createProject({ key: "ORB", name: "Orbit" });
    await expect(
      createProposal({ title: "Bad", payload: { items: [{ type: "create_ticket", ref: "t1", project: "ORB", title: "X", blockedBy: ["t9"] }] } }),
    ).rejects.toThrow(/unknown blocker "t9"/);
  });

  it("discarding writes nothing", async () => {
    await createProject({ key: "ORB", name: "Orbit" });
    const p = await createProposal({ title: "Maybe", payload: { items: [{ type: "create_ticket", ref: "t1", project: "ORB", title: "Thing" }] } });
    await discardProposal(p.id);
    expect(await listTickets()).toHaveLength(0);
  });

  it("flags likely duplicates by title overlap", async () => {
    const pr = await createProject({ key: "ORB", name: "Orbit" });
    await createTicket({ projectId: pr.id, title: "Add GitHub webhook signature verification" });
    await createTicket({ projectId: pr.id, title: "Dark mode toggle" });
    const sim = await findSimilarTickets("Verify GitHub webhook signature");
    expect(sim.map((s) => s.key)).toEqual(["ORB-1"]);
  });
});
