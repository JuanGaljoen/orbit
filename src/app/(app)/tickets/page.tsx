import Link from "next/link";
import { Empty, PageBody, PageHeader } from "@/components/page";
import { NewTicketButton } from "@/components/tickets/new-ticket-button";
import { TicketFilters } from "@/components/tickets/ticket-filters";
import { TicketTable } from "@/components/tickets/ticket-table";
import { filterFromParams } from "@/lib/ticket-params";
import { requireUser } from "@/server/auth";
import { listProjects } from "@/server/services/projects";
import { listTickets } from "@/server/services/tickets";

export const metadata = { title: "Tickets" };

export default async function TicketsPage({ searchParams }: PageProps<"/tickets">) {
  await requireUser();
  const params = await searchParams;
  const projects = await listProjects();
  const filter = filterFromParams(params, { projects });
  const tickets = await listTickets(filter);
  const archived = !!filter.archivedOnly;

  return (
    <>
      <PageHeader
        title={archived ? "Archived tickets" : "Tickets"}
        description={`${tickets.length} ticket${tickets.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Link
              href={archived ? "/tickets" : "/tickets?archived=1"}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {archived ? "← Active tickets" : "Archived"}
            </Link>
            <NewTicketButton />
          </>
        }
      >
        <TicketFilters />
      </PageHeader>
      <PageBody>
        {tickets.length ? (
          <TicketTable tickets={tickets} archivedView={archived} />
        ) : projects.length === 0 ? (
          <Empty>
            No projects yet. <Link href="/projects?new=1" className="underline">Create a project</Link> to start adding tickets.
          </Empty>
        ) : (
          <Empty>No tickets match. Press <kbd className="font-mono">C</kbd> to create one.</Empty>
        )}
      </PageBody>
    </>
  );
}
