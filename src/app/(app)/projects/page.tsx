import Link from "next/link";
import { Empty, PageBody, PageHeader, pct, ProgressBar } from "@/components/page";
import { NewProjectDialog } from "@/components/planning/new-project-dialog";
import { requireUser } from "@/server/auth";
import { listObjectives } from "@/server/services/objectives";
import { progressByProject } from "@/server/services/progress";
import { listProjects } from "@/server/services/projects";
import { cn } from "@/lib/utils";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ searchParams }: PageProps<"/projects">) {
  await requireUser();
  const showArchived = (await searchParams).archived === "1";
  const [projects, objectives] = await Promise.all([
    listProjects({ includeArchived: showArchived }),
    listObjectives(),
  ]);
  const visible = showArchived ? projects.filter((p) => p.archivedAt) : projects;
  const progress = await progressByProject(visible.map((p) => p.id));

  return (
    <>
      <PageHeader
        title={showArchived ? "Archived projects" : "Projects"}
        actions={
          <>
            <Link href={showArchived ? "/projects" : "/projects?archived=1"} className="text-xs text-muted-foreground hover:text-foreground">
              {showArchived ? "← Active" : "Archived"}
            </Link>
            <NewProjectDialog objectives={objectives} />
          </>
        }
      />
      <PageBody>
        {visible.length === 0 ? (
          <Empty>{showArchived ? "No archived projects." : "No projects yet — create your first one."}</Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((p) => {
              const pr = progress.get(p.id)!;
              return (
                <Link key={p.id} href={`/projects/${p.key}`} className="space-y-3 rounded-lg border p-4 transition-colors hover:bg-muted/20">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                    <span className="truncate font-medium">{p.name}</span>
                    <span
                      className={cn(
                        "ml-auto rounded px-1.5 py-px text-[11px] capitalize",
                        p.status === "active" ? "bg-sky-500/15 text-sky-400" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {p.status}
                    </span>
                  </div>
                  {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                  <ProgressBar value={pr.countPercent} />
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>
                      {pr.done}/{pr.total} done · {pct(pr.countPercent)}
                    </span>
                    {pr.estimatePercent != null && <span>{pct(pr.estimatePercent)} by estimate</span>}
                    {p.targetDate && <span>target {p.targetDate}</span>}
                    {p.objectiveTitle && <span>◎ {p.objectiveTitle}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}
