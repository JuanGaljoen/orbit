import { describe, expect, it } from "vitest";
import { setupTestDb } from "../../../test/db";
import { importProject } from "./import";
import { progressByProject, progressSeries } from "./progress";
import { getProjectByKey } from "./projects";
import { createTicket, getTicketByKey } from "./tickets";

setupTestDb();

const payload = {
  project: { key: "RNG", name: "Ring CAD" },
  source: "test backlog",
  tickets: [
    { number: 1, title: "Template", status: "done" as const, createdAt: "2026-06-01T10:00:00Z", completedAt: "2026-06-03T10:00:00Z", labels: ["base"] },
    { number: 5, title: "Viewer", status: "todo" as const, priority: "High", blockedBy: [1] },
  ],
};

describe("importProject", () => {
  it("keeps keys, timestamps and dependencies, and continues numbering after the highest", async () => {
    const res = await importProject(payload);
    expect(res).toMatchObject({ projectKey: "RNG", imported: 2, nextNumber: 6 });
    const done = await getTicketByKey("RNG-1");
    expect(done.completedAt?.toISOString()).toBe("2026-06-03T10:00:00.000Z");
    expect(done.labels.map((l) => l.name)).toEqual(["base"]);
    const open = await getTicketByKey("RNG-5");
    expect(open.blockers.map((b) => b.key)).toEqual(["RNG-1"]);
    expect(open.blocked).toBe(false); // its blocker is done
    const project = await getProjectByKey("RNG");
    const next = await createTicket({ projectId: project.id, title: "New work" });
    expect(next.key).toBe("RNG-6");
    expect((await progressByProject([project.id])).get(project.id)).toMatchObject({ total: 3, done: 1 });
  });

  it("rebuilds burn-up history from the original dates", async () => {
    await importProject(payload);
    const project = await getProjectByKey("RNG");
    const series = await progressSeries({ projectIds: [project.id] });
    expect(series[0]).toMatchObject({ date: "2026-06-01", scope: 1, done: 0 });
    expect(series.find((p) => p.date === "2026-06-03")).toMatchObject({ done: 1 });
  });

  it("is all-or-nothing and refuses to overwrite existing tickets", async () => {
    await importProject(payload);
    await expect(importProject(payload)).rejects.toThrow(/RNG-1 already exists/);
    await expect(
      importProject({ ...payload, project: { key: "NEW", name: "New" }, tickets: [{ number: 1, title: "x", status: "todo", blockedBy: [9] }] }),
    ).rejects.toThrow(/NEW-9, which isn't in the import/);
  });
});
