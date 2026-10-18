import { apiHandler, jsonBody } from "@/server/api";
import { apiUpdate } from "@/server/services/ticket-api";
import { getTicketByKey } from "@/server/services/tickets";

export const GET = apiHandler(async (_req, ctx: RouteContext<"/api/v1/tickets/[key]">) => {
  const { key } = await ctx.params;
  return getTicketByKey(key);
});

/** Partial update. Any of: title, type, status, priority, description, acceptanceCriteria,
 *  technicalNotes, dueDate, estimate, labels[] (replaces), milestone, parent, archived. */
export const PATCH = apiHandler(async (req, ctx: RouteContext<"/api/v1/tickets/[key]">) => {
  const { key } = await ctx.params;
  return apiUpdate(key, await jsonBody(req));
});
