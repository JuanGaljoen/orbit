import { apiHandler } from "@/server/api";
import { progressByProject } from "@/server/services/progress";
import { listProjectRepos, listProjects } from "@/server/services/projects";

export const GET = apiHandler(async () => {
  const projects = await listProjects();
  const progress = await progressByProject(projects.map((p) => p.id));
  return {
    projects: await Promise.all(
      projects.map(async (p) => ({
        key: p.key,
        name: p.name,
        description: p.description,
        status: p.status,
        targetDate: p.targetDate,
        objective: p.objectiveTitle,
        repositories: (await listProjectRepos(p.id)).map((r) => r.fullName),
        progress: progress.get(p.id),
      })),
    ),
  };
});
