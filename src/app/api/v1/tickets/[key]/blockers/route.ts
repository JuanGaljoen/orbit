import { z } from "zod";
import { apiHandler, jsonBody } from "@/server/api";
import { apiAddBlocker, apiRemoveBlocker } from "@/server/services/ticket-api";
import { parse } from "@/server/validation";

const body = z.object({ blockedBy: z.string().min(3) });

/** `{KEY}` becomes blocked by `blockedBy`. */
export const POST = apiHandler(async (req, ctx: RouteContext<"/api/v1/tickets/[key]/blockers">) => {
  const { key } = await ctx.params;
  return apiAddBlocker(key, parse(body, await jsonBody(req)).blockedBy);
});

export const DELETE = apiHandler(async (req, ctx: RouteContext<"/api/v1/tickets/[key]/blockers">) => {
  const { key } = await ctx.params;
  return apiRemoveBlocker(key, parse(body, await jsonBody(req)).blockedBy);
});
