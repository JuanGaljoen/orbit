import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AssistantChat } from "@/components/assistant/chat";
import { ProposalReview } from "@/components/assistant/proposal-review";
import { PageBody, PageHeader, Section } from "@/components/page";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { aiConfigured } from "@/server/ai/client";
import { NotFoundError } from "@/server/errors";
import { findSimilarTickets, getProposal, listProposals } from "@/server/services/proposals";
import { listProjects } from "@/server/services/projects";
import { getSetting } from "@/server/services/settings";

export const metadata = { title: "Assistant" };

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  await requireUser();
  const sp = await searchParams;
  const [projects, proposals, ai] = await Promise.all([listProjects(), listProposals(), getSetting("ai")]);
  const proposalId = typeof sp.proposal === "string" ? sp.proposal : null;
  const proposal = proposalId ? await getProposal(proposalId).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e))) : null;
  const similar: Record<number, { key: string; title: string }[]> = {};
  if (proposal?.state === "pending")
    for (const [i, item] of proposal.payload.items.entries())
      if (item.type === "create_ticket") similar[i] = (await findSimilarTickets(item.title)).map(({ key, title }) => ({ key, title }));

  return (
    <>
      <PageHeader
        title="Assistant"
        description={aiConfigured() ? `${ai.model} · effort ${ai.effort} · answers from live Orbit + GitHub data` : "AI is not configured"}
      />
      <PageBody className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:space-y-0">
        <div className="min-w-0">
          {proposal ? (
            <ProposalReview proposal={proposal} similar={similar} />
          ) : aiConfigured() ? (
            <AssistantChat projects={projects.map(({ key, name }) => ({ key, name }))} ask={typeof sp.ask === "string" ? sp.ask : undefined} />
          ) : (
            <div className="space-y-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              <p>
                Set <code className="font-mono text-foreground">ANTHROPIC_API_KEY</code> in the environment to enable the assistant. Everything
                else in Orbit works without it.
              </p>
              <p>
                The model and effort are chosen in <Link href="/settings" className="underline">Settings</Link>.
              </p>
            </div>
          )}
        </div>
        <Section title="Proposals">
          {proposals.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ask the assistant to plan work and its proposals appear here for review.</p>
          ) : (
            <ul className="space-y-1">
              {proposals.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/assistant?proposal=${p.id}`}
                    className={cn("block rounded-md px-2 py-1.5 text-sm hover:bg-muted/50", p.id === proposalId && "bg-muted")}
                  >
                    <span className="block truncate">{p.title}</span>
                    <span className="text-xs text-muted-foreground">
                      <span className={cn(p.state === "pending" && "text-sky-400")}>{p.state}</span> · {p.payload.items.length} item(s) ·{" "}
                      {formatDistanceToNow(p.createdAt, { addSuffix: true })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </PageBody>
    </>
  );
}
