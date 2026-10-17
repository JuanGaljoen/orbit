import { apiHandler } from "@/server/api";
import { implementationBrief } from "@/server/services/brief";

export const GET = apiHandler(async (_req, ctx: RouteContext<"/api/v1/tickets/[key]/brief">) => {
  const { key } = await ctx.params;
  return new Response(await implementationBrief(key), { headers: { "content-type": "text/markdown; charset=utf-8" } });
});
