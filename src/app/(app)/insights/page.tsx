import Link from "next/link";
import { Findings, Recommendations, UntrackedWork } from "@/components/insights";
import { PageBody, PageHeader, Section } from "@/components/page";
import { NativeSelectNav } from "@/components/select-nav";
import { requireUser } from "@/server/auth";
import { intelligenceReport, STALE_DAYS } from "@/server/services/intelligence";
import { listProjects } from "@/server/services/projects";

export const metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  await requireUser();
  const projects = await listProjects();
  const key = (await searchParams).project;
  const project = projects.find((p) => p.key === key);
  const r = await intelligenceReport(project ? [project.id] : undefined);

  return (
    <>
      <PageHeader
        title="Insights"
        description="Derived from your tickets and synced GitHub data. Each item shows why it's here."
        actions={
          <NativeSelectNav
            param="project"
            value={project?.key ?? ""}
            options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.key, label: `${p.key} — ${p.name}` }))]}
          />
        }
      />
      <PageBody className="grid max-w-6xl gap-8 lg:grid-cols-2 lg:space-y-0">
        <Section title="Recommended next" className="lg:col-span-2">
          <Recommendations recs={r.recommendations} />
        </Section>
        <Section title="Milestones at risk">
          {r.milestoneRisks.length ? (
            <ul className="space-y-2 text-sm">
              {r.milestoneRisks.map(({ milestone: m, reasons }) => (
                <li key={m.id}>
                  <Link href={`/projects/${m.projectKey}?tab=milestones`} className="font-medium hover:underline">
                    {m.name}
                  </Link>{" "}
                  <span className="text-xs text-muted-foreground">{m.projectKey}</span>
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {reasons.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No open milestone meets a risk rule.</p>
          )}
        </Section>
        <Section title="Blocking bottlenecks">
          {r.bottlenecks.length ? (
            <ul className="space-y-1.5 text-sm">
              {r.bottlenecks.slice(0, 8).map((b) => (
                <li key={b.ticket.id}>
                  <Link href={`/tickets/${b.ticket.key}`} className="hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{b.ticket.key}</span> {b.ticket.title}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}— blocks {b.direct} directly, {b.total} in total ({b.blocked.map((t) => t.key).join(", ")})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No open ticket is blocking other work.</p>
          )}
        </Section>
        <Section title="Tickets vs GitHub">
          <Findings items={r.discrepancies} empty="Ticket statuses agree with linked GitHub activity." />
        </Section>
        <Section title={`Stale (no movement in ${STALE_DAYS}+ days)`}>
          <Findings items={r.stale} empty="Nothing in progress has gone stale." />
        </Section>
        <Section title="Implemented but not in tickets (14 days)">
          <UntrackedWork untracked={r.untracked} />
        </Section>
        <Section title="Roadmap gaps">
          <Findings items={r.gaps} empty="No gaps found." />
        </Section>
        <Section title="Planned vs tracked vs implementation-supported" className="lg:col-span-2">
          {r.evidence.length ? (
            <table className="text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pr-6 text-left font-medium">Project</th>
                  <th className="pr-6 text-right font-medium">Planned</th>
                  <th className="pr-6 text-right font-medium">Marked done</th>
                  <th className="text-right font-medium">Done with merged code</th>
                </tr>
              </thead>
              <tbody>
                {r.evidence.map((e) => (
                  <tr key={e.projectKey}>
                    <td className="pr-6 font-mono text-xs">{e.projectKey}</td>
                    <td className="pr-6 text-right tabular-nums">{e.planned}</td>
                    <td className="pr-6 text-right tabular-nums">{e.tracked}</td>
                    <td className="text-right tabular-nums">{e.supported}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted-foreground">No tickets yet.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Leaf tickets only. &ldquo;Done with merged code&rdquo; = marked done and linked to a merged PR or commit. Tickets like research or docs
            may legitimately have none.
          </p>
        </Section>
      </PageBody>
    </>
  );
}
