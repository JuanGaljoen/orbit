import { describe, expect, it } from "vitest";
import { setupTestDb } from "../../../test/db";
import { createProject, FLOORPLAN_MAX_BYTES, getProjectFloorplan, setProjectFloorplan } from "./projects";
import { recentActivity } from "./views";

setupTestDb();

const graph = (extra: Record<string, unknown> = {}) => ({
  schema: "floorplan/graph@1",
  nodes: [{ id: "web", name: "Web" }],
  files: [],
  links: [],
  ...extra,
});

describe("project floorplan", () => {
  it("stores the graph with the commit it was drawn from, attributed to the caller", async () => {
    const p = await createProject({ key: "RNG", name: "Ring CAD" });
    expect(await getProjectFloorplan("rng")).toEqual({ commit: null, updatedAt: null, graph: null });

    const f = await setProjectFloorplan("rng", { commit: "4bddebc", graph: graph() }, "api");
    expect(f).toMatchObject({ commit: "4bddebc", graph: graph() });
    expect(f.updatedAt).toBeInstanceOf(Date);
    expect(await getProjectFloorplan("RNG")).toEqual(f);

    const [entry] = await recentActivity({ projectIds: [p.id], limit: 1 });
    expect(entry).toMatchObject({ kind: "project.floorplan_updated", actor: "api" });
  });

  it("replaces the whole graph rather than merging", async () => {
    await createProject({ key: "RNG", name: "Ring CAD" });
    await setProjectFloorplan("RNG", { commit: "4bddebc", graph: graph({ flows: [{ id: "a" }], tour: ["x"] }) });
    const f = await setProjectFloorplan("RNG", { graph: graph() });
    expect(f.commit).toBeNull();
    expect(f.graph).toEqual(graph());
    expect(f.graph).not.toHaveProperty("flows");
  });

  it("rejects bad input, naming the problem", async () => {
    await createProject({ key: "RNG", name: "Ring CAD" });
    const bad = (input: Parameters<typeof setProjectFloorplan>[1]) => expect(setProjectFloorplan("RNG", input)).rejects;

    await bad({ graph: "<html>" }).toThrow(/graph/);
    await bad({ graph: [] }).toThrow(/graph/);
    await bad({ graph: graph({ schema: "mermaid/1" }) }).toThrow(/graph\.schema.*floorplan\/graph/);
    await bad({ graph: graph({ schema: 3 }) }).toThrow(/graph\.schema/);
    for (const field of ["nodes", "files", "links"]) await bad({ graph: graph({ [field]: {} }) }).toThrow(new RegExp(`graph\\.${field} must be an array`));
    await bad({ graph: graph({ pad: "x".repeat(FLOORPLAN_MAX_BYTES) }) }).toThrow(/limit is 4 MB/);
    await bad({ graph: graph(), commit: "not a sha" }).toThrow(/commit/);
    await expect(setProjectFloorplan("NOPE", { graph: graph() })).rejects.toThrow(/Project NOPE not found/);
    expect((await getProjectFloorplan("RNG")).graph).toBeNull(); // nothing stored by the failures
  });
});
