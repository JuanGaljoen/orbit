import { apiHandler } from "@/server/api";
import { getTicketByKey } from "@/server/services/tickets";

export const GET = apiHandler(async (_req, ctx: RouteContext<"/api/v1/tickets/[key]">) => {
  const { key } = await ctx.params;
  return getTicketByKey(key);
});
