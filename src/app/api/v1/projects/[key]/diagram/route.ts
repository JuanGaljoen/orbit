import { apiHandler, jsonBody } from "@/server/api";
import { getProjectDiagram, setProjectDiagram } from "@/server/services/projects";

export const GET = apiHandler(async (_req, ctx: RouteContext<"/api/v1/projects/[key]/diagram">) => {
  const { key } = await ctx.params;
  return getProjectDiagram(key);
});

/** Replaces the diagram. Body: { mermaid, commit? } — commit is the SHA it was drawn from. */
export const PUT = apiHandler(async (req, ctx: RouteContext<"/api/v1/projects/[key]/diagram">) => {
  const { key } = await ctx.params;
  return setProjectDiagram(key, (await jsonBody(req)) as Parameters<typeof setProjectDiagram>[1], "api");
});
