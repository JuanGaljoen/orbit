import { describe, expect, it } from "vitest";
import { setupTestDb } from "../../../test/db";
import { createMilestone } from "./milestones";
import { computeProgress, progressByMilestone, progressByProject, progressSeries } from "./progress";
import { createProject } from "./projects";
import { createTicket, setTicketArchived, updateTicket } from "./tickets";
import { listStatuses } from "./vocab";

describe("computeProgress", () => {
  it("counts leaves only — a parent is represented by its subtasks", () => {
    const p = computeProgress([
      { id: "parent", parentId: null, category: "in_progress", estimate: 8 },
      { id: "s1", parentId: "parent", category: "done", estimate: 3 },
      { id: "s2", parentId: "parent", category: "todo", estimate: 1 },
      { id: "solo", parentId: null, category: "done", estimate: null },
    ]);
    expect(p.total).toBe(3);
    expect(p.done).toBe(2);
    expect(p.countPercent).toBeCloseTo(2 / 3);
    // Parent's own 8 points are not double-counted on top of its subtasks.
    expect(p.estimateTotal).toBe(4);
    expect(p.estimateDone).toBe(3);
    expect(p.estimatePercent).toBeCloseTo(0.75);
    expect(p.unestimated).toBe(1);
  });

  it("reports null percentages rather than inventing them", () => {
    expect(computeProgress([]).countPercent).toBeNull();
    const p = computeProgress([{ id: "a", parentId: null, category: "todo", estimate: null }]);
    expect(p.estimatePercent).toBeNull();
    expect(p.countPercent).toBe(0);
  });
});

describe("progress from real data", () => {
  setupTestDb();

  it("excludes archived tickets and carries subtasks into their parent's milestone", async () => {
    const project = await createProject({ key: "ORB", name: "Orbit" });
    const done = (await listStatuses()).find((s) => s.category === "done")!;
    const m = await createMilestone({ projectId: project.id, name: "MVP" });
    const parent = await createTicket({ projectId: project.id, title: "Board", milestoneId: m.id });
    await createTicket({ projectId: project.id, title: "Drag", parentId: parent.id, statusId: done.id, estimate: 2 });
    await createTicket({ projectId: project.id, title: "Drop", parentId: parent.id, estimate: 2 });
    const junk = await createTicket({ projectId: project.id, title: "Junk", statusId: done.id });
    await setTicketArchived(junk.id, true);

    const byProject = (await progressByProject([project.id])).get(project.id)!;
    expect([byProject.total, byProject.done]).toEqual([2, 1]);
    const byMilestone = (await progressByMilestone([m.id])).get(m.id)!;
    expect([byMilestone.total, byMilestone.done, byMilestone.estimatePercent]).toEqual([2, 1, 0.5]);
  });

  it("builds a burn-up series from the activity log", async () => {
    const project = await createProject({ key: "ORB", name: "Orbit" });
    const done = (await listStatuses()).find((s) => s.category === "done")!;
    const a = await createTicket({ projectId: project.id, title: "A" });
    await createTicket({ projectId: project.id, title: "B" });
    await updateTicket(a.id, { statusId: done.id });
    const series = await progressSeries({ projectIds: [project.id], days: 3 });
    expect(series).toHaveLength(3);
    expect(series.at(-1)).toMatchObject({ scope: 2, done: 1 });
    expect(series[0]).toMatchObject({ scope: 0, done: 0 });
  });
});
