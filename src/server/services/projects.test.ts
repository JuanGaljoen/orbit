import { describe, expect, it } from "vitest";
import { setupTestDb } from "../../../test/db";
import { createProject, getProjectDiagram, setProjectDiagram } from "./projects";
import { recentActivity } from "./views";

setupTestDb();

const MAP = { id: "map", title: "Map: modules and services", mermaid: "flowchart LR\n  A --> B" };
const FLOW = { id: "generate-ring", title: "Flow: generate a ring", mermaid: "sequenceDiagram\n  A->>B: go\n  B-->>A: done" };
const view = (i: number) => ({ id: `v-${i}`, title: `View ${i}`, mermaid: "flowchart LR\n  A --> B" });

describe("project diagram", () => {
  it("stores several views in order with the commit they were drawn from, attributed to the caller", async () => {
    const p = await createProject({ key: "RNG", name: "Ring CAD" });
    expect(await getProjectDiagram("rng")).toEqual({ commit: null, updatedAt: null, views: [] });

    const d = await setProjectDiagram("rng", { commit: "4bddebc", views: [FLOW, MAP] }, "api");
    expect(d).toMatchObject({ commit: "4bddebc", views: [FLOW, MAP] });
    expect(d.updatedAt).toBeInstanceOf(Date);
    expect(await getProjectDiagram("RNG")).toEqual(d);

    const [entry] = await recentActivity({ projectIds: [p.id], limit: 1 });
    expect(entry).toMatchObject({ kind: "project.diagram_updated", actor: "api" });
  });

  it("replaces the whole set rather than merging", async () => {
    await createProject({ key: "RNG", name: "Ring CAD" });
    await setProjectDiagram("RNG", { commit: "4bddebc", views: [MAP, FLOW] });
    const d = await setProjectDiagram("RNG", { views: [{ ...FLOW, title: "Flow v2" }] });
    expect(d).toMatchObject({ commit: null, views: [{ ...FLOW, title: "Flow v2" }] });
  });

  it("accepts the legacy single-diagram body as one 'map' view", async () => {
    await createProject({ key: "RNG", name: "Ring CAD" });
    const d = await setProjectDiagram("RNG", { mermaid: MAP.mermaid, commit: "4bddebc" });
    expect(d).toMatchObject({ commit: "4bddebc", views: [{ id: "map", title: "Architecture", mermaid: MAP.mermaid }] });
  });

  it("rejects bad input, naming the offending view", async () => {
    await createProject({ key: "RNG", name: "Ring CAD" });
    const bad = (input: Parameters<typeof setProjectDiagram>[1]) => expect(setProjectDiagram("RNG", input)).rejects;

    await bad({ views: [] }).toThrow(/1–6 views/);
    await bad({ views: Array.from({ length: 7 }, (_, i) => view(i)) }).toThrow(/1–6 views/);
    await bad({ views: [MAP, { ...FLOW, id: "Generate Ring" }] }).toThrow(/view 2 \("Generate Ring"\).*kebab-case/);
    await bad({ views: [MAP, { ...FLOW, title: " " }] }).toThrow(/view 2 \("generate-ring"\).*title/);
    await bad({ views: [MAP, { ...FLOW, mermaid: "x".repeat(50_001) }] }).toThrow(/view 2 \("generate-ring"\).*50,000/);
    await bad({ views: [MAP, { ...FLOW, id: "map" }] }).toThrow(/view 2 \("map"\).*duplicate/);
    await bad({ mermaid: "  " }).toThrow();
    await bad({ views: [MAP], commit: "not a sha" }).toThrow(/commit/);
    await expect(setProjectDiagram("NOPE", { views: [MAP] })).rejects.toThrow(/Project NOPE not found/);
  });
});
