import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody, PageHeader } from "@/components/page";
import { Board } from "@/components/tickets/board";
import { NewTicketButton } from "@/components/tickets/new-ticket-button";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { boardTint } from "@/lib/board-tint";
import { filterFromParams } from "@/lib/ticket-params";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { getProjectByKey, listProjects } from "@/server/services/projects";
import { listTickets } from "@/server/services/tickets";

export async function generateMetadata({ params }: PageProps<"/board/[key]">) {
  const { key } = await params;
  return { title: `${key.toUpperCase()} board` };
}

export default async function BoardPage({ params, searchParams }: PageProps<"/board/[key]">) {
  await requireUser();
  const { key } = await params;
  const projects = await listProjects();
  // Looked up directly (not from `projects`) so an archived project's board still opens.
  const project = await getProjectByKey(key).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });

  const filter = filterFromParams(await searchParams, { projects });
  const tickets = await listTickets({ ...filter, projectIds: [project.id], sort: "position" });

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className={cn("inline-block size-2.5 rounded-sm", boardTint(project.key))} />
            <span className="font-mono text-sm text-muted-foreground">{project.key}</span> {project.name}
          </span>
        }
        description="Drag cards between columns to change status."
        actions={
          <>
            <Link href={`/projects/${project.key}`} className="text-xs text-muted-foreground hover:text-foreground">
              Project overview
            </Link>
            <NewTicketButton defaults={{ projectId: project.id }} />
          </>
        }
      >
        <nav aria-label="Boards" className="mt-3 flex flex-wrap gap-1 text-sm">
          <Link href="/board" className="rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground">
            ← Boards
          </Link>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/board/${p.key}`}
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-xs leading-5 text-muted-foreground hover:text-foreground",
                p.id === project.id && "bg-muted text-foreground",
              )}
            >
              {p.key}
            </Link>
          ))}
        </nav>
        <TicketFilters showSort={false} showStatus={false} showProject={false} />
      </PageHeader>
      <PageBody>
        <Board tickets={tickets} projectId={project.id} />
      </PageBody>
    </>
  );
}
