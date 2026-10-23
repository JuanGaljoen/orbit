import { describe, expect, it } from "vitest";
import { setupTestDb } from "../../../test/db";
import { createProject, getProjectDiagram, setProjectDiagram } from "./projects";
import { recentActivity } from "./views";

setupTestDb();

const MERMAID = "flowchart LR\n  A --> B";

describe("project diagram", () => {
  it("stores the diagram with the commit it was drawn from, attributed to the caller", async () => {
    const p = await createProject({ key: "RNG", name: "Ring CAD" });
    expect(await getProjectDiagram("rng")).toEqual({ mermaid: null, commit: null, updatedAt: null });

    const d = await setProjectDiagram("rng", { mermaid: MERMAID, commit: "4bddebc" }, "api");
    expect(d).toMatchObject({ mermaid: MERMAID, commit: "4bddebc" });
    expect(d.updatedAt).toBeInstanceOf(Date);
    expect(await getProjectDiagram("RNG")).toEqual(d);

    const [entry] = await recentActivity({ projectIds: [p.id], limit: 1 });
    expect(entry).toMatchObject({ kind: "project.diagram_updated", actor: "api" });
  });

  it("replaces the previous diagram and rejects bad input", async () => {
    await createProject({ key: "RNG", name: "Ring CAD" });
    await setProjectDiagram("RNG", { mermaid: MERMAID, commit: "4bddebc" });
    expect(await setProjectDiagram("RNG", { mermaid: "graph TD\n  X" })).toMatchObject({ mermaid: "graph TD\n  X", commit: null });

    await expect(setProjectDiagram("RNG", { mermaid: "  " })).rejects.toThrow();
    await expect(setProjectDiagram("RNG", { mermaid: MERMAID, commit: "not a sha" })).rejects.toThrow();
    await expect(setProjectDiagram("NOPE", { mermaid: MERMAID })).rejects.toThrow(/Project NOPE not found/);
  });
});
