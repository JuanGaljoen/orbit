import { NextResponse } from "next/server";
import { apiHandler, jsonBody } from "@/server/api";
import { InvalidError } from "@/server/errors";
import { getProjectFloorplan, setProjectFloorplan } from "@/server/services/projects";

export const GET = apiHandler(async (_req, ctx: RouteContext<"/api/v1/projects/[key]/floorplan">) => {
  const { key } = await ctx.params;
  return getProjectFloorplan(key);
});

/** Replaces the project's whole Floorplan graph. Body: { commit?, graph }. An invalid graph is a 422 naming the problem. */
export const PUT = apiHandler(async (req, ctx: RouteContext<"/api/v1/projects/[key]/floorplan">) => {
  const { key } = await ctx.params;
  const body = (await jsonBody(req)) as Parameters<typeof setProjectFloorplan>[1];
  try {
    return await setProjectFloorplan(key, body, "api");
  } catch (e) {
    if (e instanceof InvalidError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
});
