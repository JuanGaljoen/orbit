import { describe, expect, it } from "vitest";
import { setupTestDb } from "../../../test/db";
import { createMilestone } from "./milestones";
import { createProject } from "./projects";
import {
  addDependency,
  bulkUpdateTickets,
  createTicket,
  getTicket,
  getTicketByKey,
  listTickets,
  moveTicket,
  updateTicket,
} from "./tickets";
import { listPriorities, listStatuses } from "./vocab";

setupTestDb();

async function setup() {
  const project = await createProject({ key: "orb", name: "Orbit" });
  const statuses = await listStatuses();
  const byCat = (c: string) => statuses.find((s) => s.category === c)!;
  return { project, statuses, byCat };
}

describe("tickets", () => {
  it("allocates sequential human-readable keys per project", async () => {
    const { project } = await setup();
    const other = await createProject({ key: "LAB", name: "Lab" });
    const a = await createTicket({ projectId: project.id, title: "First" });
    const b = await createTicket({ projectId: project.id, title: "Second" });
    const c = await createTicket({ projectId: other.id, title: "Elsewhere" });
    expect([a.key, b.key, c.key]).toEqual(["ORB-1", "ORB-2", "LAB-1"]);
    expect((await getTicketByKey("orb-2")).title).toBe("Second");
  });

  it("rejects a duplicate project key", async () => {
    await setup();
    await expect(createProject({ key: "ORB", name: "Again" })).rejects.toThrow(/already in use/);
  });

  it("derives blocked from unfinished blockers and clears it when the blocker is done", async () => {
    const { project, byCat } = await setup();
    const blocker = await createTicket({ projectId: project.id, title: "API" });
    const t = await createTicket({ projectId: project.id, title: "UI", blockedByIds: [blocker.id] });
    expect(t.blocked).toBe(true);
    await updateTicket(blocker.id, { statusId: byCat("done").id });
    expect((await getTicket(t.id)).blocked).toBe(false);
  });

  it("refuses dependency cycles and self-blocks", async () => {
    const { project } = await setup();
    const a = await createTicket({ projectId: project.id, title: "A" });
    const b = await createTicket({ projectId: project.id, title: "B", blockedByIds: [a.id] });
    await expect(addDependency(a.id, b.id)).rejects.toThrow(/cycle/);
    await expect(addDependency(a.id, a.id)).rejects.toThrow(/itself/);
  });

  it("keeps subtasks one level deep and in the same project", async () => {
    const { project } = await setup();
    const other = await createProject({ key: "LAB", name: "Lab" });
    const parent = await createTicket({ projectId: project.id, title: "Epic-ish" });
    const child = await createTicket({ projectId: project.id, title: "Sub", parentId: parent.id });
    await expect(
      createTicket({ projectId: project.id, title: "Subsub", parentId: child.id }),
    ).rejects.toThrow(/cannot have their own subtasks/);
    await expect(createTicket({ projectId: other.id, title: "X", parentId: parent.id })).rejects.toThrow(
      /same project/,
    );
    const detail = await getTicket(parent.id);
    expect(detail.subtasks.map((s) => s.key)).toEqual(["ORB-2"]);
    expect(detail.subtaskCount).toBe(1);
  });

  it("records status transitions in history and stamps completedAt", async () => {
    const { project, byCat } = await setup();
    const t = await createTicket({ projectId: project.id, title: "Ship" });
    await moveTicket(t.id, byCat("in_progress").id, 1);
    const done = await moveTicket(t.id, byCat("done").id, 1);
    expect(done.completedAt).toBeInstanceOf(Date);
    const reopened = await updateTicket(t.id, { statusId: byCat("todo").id });
    expect(reopened.completedAt).toBeNull();
    const history = (await getTicket(t.id)).history.filter((h) => h.kind === "ticket.status_changed");
    expect(history.map((h) => h.summary)).toEqual(["Done → Todo", "In Progress → Done", "Backlog → In Progress"]);
  });

  it("filters by search text, key, category, overdue and label", async () => {
    const { project, byCat } = await setup();
    const prios = await listPriorities();
    await createTicket({ projectId: project.id, title: "Login page", dueDate: "2000-01-01" });
    await createTicket({
      projectId: project.id,
      title: "Webhook handler",
      statusId: byCat("in_progress").id,
      priorityId: prios[0].id,
    });
    expect((await listTickets({ q: "login" })).map((t) => t.key)).toEqual(["ORB-1"]);
    expect((await listTickets({ q: "ORB-2" })).map((t) => t.title)).toEqual(["Webhook handler"]);
    expect((await listTickets({ categories: ["in_progress"] })).length).toBe(1);
    const overdue = await listTickets({ due: "overdue" });
    expect(overdue.map((t) => [t.key, t.overdue])).toEqual([["ORB-1", true]]);
    expect((await listTickets({ sort: "priority" }))[0].highPriority).toBe(true);
  });

  it("bulk-updates status with a history entry per ticket", async () => {
    const { project, byCat } = await setup();
    const a = await createTicket({ projectId: project.id, title: "A" });
    const b = await createTicket({ projectId: project.id, title: "B" });
    await bulkUpdateTickets({ ids: [a.id, b.id], statusId: byCat("todo").id });
    const rows = await listTickets({ categories: ["todo"] });
    expect(rows.length).toBe(2);
    expect((await getTicket(a.id)).history.some((h) => h.kind === "ticket.status_changed")).toBe(true);
  });

  it("only accepts a milestone from the ticket's own project", async () => {
    const { project } = await setup();
    const other = await createProject({ key: "LAB", name: "Lab" });
    const m = await createMilestone({ projectId: other.id, name: "Beta" });
    await expect(createTicket({ projectId: project.id, title: "X", milestoneId: m.id })).rejects.toThrow(
      /same project/,
    );
  });
});
