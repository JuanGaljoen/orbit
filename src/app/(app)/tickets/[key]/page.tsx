import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBody } from "@/components/page";
import { TicketDetail } from "@/components/tickets/ticket-detail";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
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

  return (
    <PageBody className="max-w-6xl">
      <nav className="text-xs text-muted-foreground">
        <Link href={`/projects/${ticket.projectKey}`} className="hover:text-foreground">
          {ticket.projectKey}
        </Link>{" "}
        / <span className="font-mono">{ticket.key}</span>
      </nav>
      <TicketDetail ticket={ticket} />
    </PageBody>
  );
}
