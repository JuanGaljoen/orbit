import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { setupTestDb } from "../../../../../test/db";
import { createProject } from "@/server/services/projects";
import { GET, PUT } from "./[key]/floorplan/route";

setupTestDb();

const TOKEN = "t".repeat(32);
const ctx = (key: string) => ({ params: Promise.resolve({ key }) }) as never;
const call = (method: "GET" | "PUT", key: string, body?: unknown, token: string | null = TOKEN) =>
  (method === "GET" ? GET : PUT)(
    new NextRequest(`http://orbit.test/api/v1/projects/${key}/floorplan`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    ctx(key),
  );

const graph = { schema: "floorplan/graph@1", nodes: [], files: [], links: [] };

describe("/api/v1/projects/{KEY}/floorplan", () => {
  beforeEach(async () => {
    process.env.ORBIT_API_TOKEN = TOKEN;
    await createProject({ key: "RNG", name: "Ring CAD" });
  });

  it("needs the bearer token", async () => {
    expect((await call("GET", "RNG", undefined, null)).status).toBe(401);
    expect((await call("PUT", "RNG", { graph }, "wrong")).status).toBe(401);
  });

  it("PUTs a graph and GETs it back; null graph before the first push", async () => {
    expect(await (await call("GET", "RNG")).json()).toEqual({ commit: null, updatedAt: null, graph: null });
    const put = await call("PUT", "RNG", { commit: "4bddebc", graph });
    expect(put.status).toBe(200);
    expect(await (await call("GET", "RNG")).json()).toMatchObject({ commit: "4bddebc", graph });
  });

  it("answers 422 naming the problem, 404 for an unknown project", async () => {
    const bad = await call("PUT", "RNG", { graph: { ...graph, nodes: "x" } });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toMatch(/graph\.nodes must be an array/);
    expect((await call("PUT", "NOPE", { graph })).status).toBe(404);
  });
});
