import { PageBody, PageHeader } from "@/components/page";
import { Objectives } from "@/components/planning/objectives";
import { requireUser } from "@/server/auth";
import { listObjectives } from "@/server/services/objectives";
import { progressByProject } from "@/server/services/progress";
import { listProjects } from "@/server/services/projects";

export const metadata = { title: "Objectives" };

export default async function ObjectivesPage() {
  await requireUser();
  const [objectives, projects] = await Promise.all([listObjectives(), listProjects()]);
  const progress = await progressByProject(projects.map((p) => p.id));

  const view = objectives.map((o) => {
    const ps = projects
      .filter((p) => p.objectiveId === o.id)
      .map((p) => {
        const pr = progress.get(p.id)!;
        return { key: p.key, name: p.name, done: pr.done, total: pr.total, percent: pr.countPercent };
      });
    return {
      ...o,
      projects: ps,
      done: ps.reduce((n, p) => n + p.done, 0),
      total: ps.reduce((n, p) => n + p.total, 0),
    };
  });

  return (
    <>
      <PageHeader title="Objectives" description="Outcomes your projects roll up into." />
      <PageBody className="max-w-4xl">
        <Objectives objectives={view} />
      </PageBody>
    </>
  );
}
