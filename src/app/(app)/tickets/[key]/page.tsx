import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketGithub } from "@/components/github/ticket-github";
import { PageBody } from "@/components/page";
import { BriefButton } from "@/components/tickets/brief-button";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { linkedPullRequests, listRepositories } from "@/server/services/github";
import { getTicketByKey } from "@/server/services/tickets";

export async function generateMetadata({ params }: PageProps<"/tickets/[key]">) {
  return { title: (await params).key.toUpperCase() };
}

export default async function TicketPage({ params }: PageProps<"/tickets/[key]">) {
  await requireUser();
  const { key } = await params;
  const ticket = await getTicketByKey(key).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [repos, prs] = await Promise.all([listRepositories(), linkedPullRequests(ticket.links)]);

  return (
    <PageBody className="max-w-6xl">
      <nav className="flex items-center gap-1 text-xs text-muted-foreground">
        <Link href={`/projects/${ticket.projectKey}`} className="hover:text-foreground">
          {ticket.projectKey}
        </Link>
        / <span className="font-mono">{ticket.key}</span>
        <span className="ml-auto">
          <BriefButton ticketKey={ticket.key} />
        </span>
      </nav>
      <TicketDetail
        ticket={ticket}
        aside={
          <TicketGithub
            ticket={ticket}
            repos={repos.map(({ id, fullName }) => ({ id, fullName }))}
            prs={prs.map(({ repositoryId, number, state, checksState }) => ({ repositoryId, number, state, checksState }))}
          />
        }
      />
    </PageBody>
  );
}
