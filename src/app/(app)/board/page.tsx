import Link from "next/link";
import { Empty, PageBody, PageHeader } from "@/components/page";
import { Board } from "@/components/tickets/board";
import { NewTicketButton } from "@/components/tickets/new-ticket-button";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { filterFromParams } from "@/lib/ticket-params";
import { requireUser } from "@/server/auth";
import { listProjects } from "@/server/services/projects";
import { listTickets } from "@/server/services/tickets";

export const metadata = { title: "Board" };

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  await requireUser();
  const params = await searchParams;
  const projects = await listProjects();
  const filter = filterFromParams(params, { projects });
  const tickets = await listTickets({ ...filter, sort: "position" });
  const projectId = filter.projectIds?.length === 1 ? filter.projectIds[0] : undefined;

  return (
    <>
      <PageHeader title="Board" description="Drag cards between columns to change status." actions={<NewTicketButton defaults={{ projectId }} />}>
        <TicketFilters showSort={false} showStatus={false} />
      </PageHeader>
      <PageBody>
        {projects.length === 0 ? (
          <Empty>
            No projects yet. <Link href="/projects?new=1" className="underline">Create a project</Link> first.
          </Empty>
        ) : (
          <Board tickets={tickets} projectId={projectId} />
        )}
      </PageBody>
    </>
  );
}
