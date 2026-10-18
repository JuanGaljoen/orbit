import Link from "next/link";
import { redirect } from "next/navigation";
import { PageBody, PageHeader, pct, ProgressBar } from "@/components/page";
import { NewProjectDialog } from "@/components/planning/new-project-dialog";
import { boardTint } from "@/lib/board-tint";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { listObjectives } from "@/server/services/objectives";
import { progressByProject } from "@/server/services/progress";
import { listProjects } from "@/server/services/projects";

export const metadata = { title: "Boards" };

/** The board gallery: one board per project, Trello-style. */
export default async function BoardsPage({ searchParams }: PageProps<"/board">) {
  await requireUser();
  const sp = await searchParams;
  // Old links (/board?project=KEY) open that project's board.
  if (typeof sp.project === "string" && sp.project) redirect(`/board/${sp.project.toUpperCase()}`);

  const [projects, objectives] = await Promise.all([listProjects(), listObjectives()]);
  const progress = await progressByProject(projects.map((p) => p.id));
  const tile = "flex min-h-32 flex-col overflow-hidden rounded-lg border text-left transition-colors hover:border-foreground/30";

  return (
    <>
      <PageHeader title="Boards" description="One board per project. Pick a board, or create one." />
      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((p) => {
            const pr = progress.get(p.id)!;
            return (
              <Link key={p.id} href={`/board/${p.key}`} className={tile}>
                <div className={cn("h-12 shrink-0", boardTint(p.key))} />
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
                    <span className="truncate font-medium">{p.name}</span>
                  </div>
                  <div className="mt-auto space-y-1.5">
                    <ProgressBar value={pr.countPercent} />
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>{pr.notStarted} to do</span>
                      <span>{pr.active} in progress</span>
                      <span>
                        {pr.done} done · {pct(pr.countPercent)}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
          <NewProjectDialog
            objectives={objectives}
            goTo="board"
            tileClassName={cn(tile, "items-center justify-center gap-1 border-dashed bg-muted/20 text-sm text-muted-foreground hover:text-foreground")}
          />
        </div>
      </PageBody>
    </>
  );
}
