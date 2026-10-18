import { apiHandler } from "@/server/api";
import { getProjectByKey } from "@/server/services/projects";
import { milestoneViews } from "@/server/services/views";

export const GET = apiHandler(async (req) => {
  const key = req.nextUrl.searchParams.get("project");
  const ms = await milestoneViews({ projectId: key ? (await getProjectByKey(key)).id : undefined });
  return {
    milestones: ms.map((m) => ({
      project: m.projectKey,
      name: m.name,
      startDate: m.startDate,
      targetDate: m.targetDate,
      completed: !!m.completedAt,
      overdue: m.overdue,
      progress: m.progress,
    })),
  };
});
