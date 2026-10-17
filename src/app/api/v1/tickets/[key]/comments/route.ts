import { z } from "zod";
import { apiHandler, jsonBody } from "@/server/api";
import { addComment, getTicketByKey } from "@/server/services/tickets";
import { parse } from "@/server/validation";

/** Claude Code can leave notes on a ticket (shown as "Assistant"). It cannot change status or fields. */
export const POST = apiHandler(async (req, ctx: RouteContext<"/api/v1/tickets/[key]/comments">) => {
  const { key } = await ctx.params;
  const { body } = parse(z.object({ body: z.string() }), await jsonBody(req));
  const ticket = await getTicketByKey(key);
  return addComment(ticket.id, body, "ai");
});
