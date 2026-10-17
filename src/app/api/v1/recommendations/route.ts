import { apiHandler } from "@/server/api";
import { recommendations } from "@/server/services/intelligence";
import { getProjectByKey } from "@/server/services/projects";

export const GET = apiHandler(async (req) => {
  const project = req.nextUrl.searchParams.get("project");
  const recs = await recommendations({ projectIds: project ? [(await getProjectByKey(project)).id] : undefined });
  return { recommendations: recs.map((r) => ({ key: r.ticket.key, title: r.ticket.title, status: r.ticket.status.name, priority: r.ticket.priority.name, score: r.score, reasons: r.reasons })) };
});
