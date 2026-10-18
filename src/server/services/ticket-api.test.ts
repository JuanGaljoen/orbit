import { describe, expect, it } from "vitest";
import { setupTestDb } from "../../../test/db";
import { createMilestone } from "./milestones";
import { createProject } from "./projects";
import { apiAddBlocker, apiCreate, apiRemoveBlocker, apiUpdate } from "./ticket-api";
import { createTicket } from "./tickets";

setupTestDb();

describe("ticket write API", () => {
  it("creates tickets from friendly names and attributes them to the API", async () => {
    const p = await createProject({ key: "RNG", name: "Ring CAD" });
    await createMilestone({ projectId: p.id, name: "Fidelity" });
    const blocker = await createTicket({ projectId: p.id, title: "Reference sketches" });
    const t = await apiCreate({
      project: "rng",
      title: "Trilogy spacing",
      type: "bug",
      status: "Todo",
      priority: "High",
      acceptanceCriteria: "- [ ] stones read as one line",
      labels: ["fidelity"],
      milestone: "fidelity",
      blockedBy: [blocker.key],
    });
    expect(t).toMatchObject({ key: "RNG-2", type: "bug", milestoneName: "Fidelity", blocked: true });
    expect([t.status.name, t.priority.name, t.labels.map((l) => l.name)]).toEqual(["Todo", "High", ["fidelity"]]);
    expect(t.history.find((h) => h.kind === "ticket.created")?.actor).toBe("api");
  });

  it("moves status by name or category, edits fields and archives", async () => {
    const p = await createProject({ key: "RNG", name: "Ring CAD" });
    const t = await createTicket({ projectId: p.id, title: "Viewer" });
    expect((await apiUpdate(t.key, { status: "in_progress" })).status.name).toBe("In Progress");
    const done = await apiUpdate(t.key, { status: "Done", estimate: 3, title: "Viewer presentation" });
    expect([done.status.category, done.estimate, done.title, !!done.completedAt]).toEqual(["done", 3, "Viewer presentation", true]);
    expect(done.history.filter((h) => h.kind === "ticket.status_changed").every((h) => h.actor === "api")).toBe(true);
    expect((await apiUpdate(t.key, { archived: true })).archivedAt).toBeInstanceOf(Date);
  });

  it("explains unknown names instead of guessing", async () => {
    const p = await createProject({ key: "RNG", name: "Ring CAD" });
    const t = await createTicket({ projectId: p.id, title: "X" });
    await expect(apiUpdate(t.key, { status: "Shipped" })).rejects.toThrow(/Unknown status "Shipped". Use one of: Backlog, Todo/);
    await expect(apiUpdate(t.key, { priority: "P0" })).rejects.toThrow(/Unknown priority/);
    await expect(apiUpdate(t.key, { milestone: "Nope" })).rejects.toThrow(/No milestone named "Nope"/);
    await expect(apiCreate({ project: "NOPE", title: "x" })).rejects.toThrow(/Project NOPE not found/);
  });

  it("adds and removes blockers by key", async () => {
    const p = await createProject({ key: "RNG", name: "Ring CAD" });
    const a = await createTicket({ projectId: p.id, title: "A" });
    const b = await createTicket({ projectId: p.id, title: "B" });
    expect((await apiAddBlocker(b.key, a.key)).blockers.map((x) => x.key)).toEqual(["RNG-1"]);
    expect((await apiRemoveBlocker(b.key, a.key)).blockers).toEqual([]);
  });
});
