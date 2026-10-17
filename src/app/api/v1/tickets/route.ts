import { STATUS_CATEGORIES, type StatusCategory } from "@/db/schema";
import { apiHandler } from "@/server/api";
import { getProjectByKey } from "@/server/services/projects";
import { listTickets } from "@/server/services/tickets";

export const GET = apiHandler(async (req) => {
  const sp = req.nextUrl.searchParams;
  const project = sp.get("project");
  const categories = sp
    .get("status")
    ?.split(",")
    .filter((s): s is StatusCategory => (STATUS_CATEGORIES as readonly string[]).includes(s));
  const tickets = await listTickets({
    projectIds: project ? [(await getProjectByKey(project)).id] : undefined,
    categories: categories?.length ? categories : undefined,
    q: sp.get("q") ?? undefined,
    blocked: sp.get("blocked") === "1" ? true : undefined,
    limit: Math.min(500, Number(sp.get("limit")) || 100),
  });
  return { count: tickets.length, tickets };
});
