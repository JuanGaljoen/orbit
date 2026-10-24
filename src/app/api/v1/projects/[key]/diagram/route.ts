import { NextResponse } from "next/server";
import { apiHandler, jsonBody } from "@/server/api";
import { InvalidError } from "@/server/errors";
import { getProjectDiagram, setProjectDiagram } from "@/server/services/projects";

export const GET = apiHandler(async (_req, ctx: RouteContext<"/api/v1/projects/[key]/diagram">) => {
  const { key } = await ctx.params;
  return getProjectDiagram(key);
});

/**
 * Replaces the whole set of views. Body: { commit?, views: [{ id, title, mermaid }] } (1–6), or the
 * legacy { mermaid, commit? }. A view that fails validation is a 422 naming it.
 */
export const PUT = apiHandler(async (req, ctx: RouteContext<"/api/v1/projects/[key]/diagram">) => {
  const { key } = await ctx.params;
  const body = (await jsonBody(req)) as Parameters<typeof setProjectDiagram>[1];
  try {
    return await setProjectDiagram(key, body, "api");
  } catch (e) {
    if (e instanceof InvalidError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
});
