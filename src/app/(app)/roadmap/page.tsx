import Link from "next/link";
import { Burnup } from "@/components/charts/burnup";
import { Timeline, type TimelineRow } from "@/components/charts/timeline";
import { Empty, PageBody, PageHeader, pct, Section } from "@/components/page";
import { NativeSelectNav } from "@/components/select-nav";
import { toIsoDate, today } from "@/lib/dates";
import { requireUser } from "@/server/auth";
import { getDb } from "@/db";
import { ticketDeps } from "@/db/schema";
import { progressSeries } from "@/server/services/progress";
import { listProjects } from "@/server/services/projects";
import { listTickets } from "@/server/services/tickets";
import { milestoneViews } from "@/server/services/views";

export const metadata = { title: "Roadmap" };

export default async function RoadmapPage({ searchParams }: PageProps<"/roadmap">) {
  await requireUser();
  const sp = await searchParams;
  const showTickets = sp.tickets === "1";
  const projects = await listProjects();
  const selected = projects.find((p) => p.key === sp.project);
  const scope = selected ? [selected] : projects;
  const [milestones, tickets, series] = await Promise.all([
    milestoneViews({ projectId: selected?.id }),
    showTickets ? listTickets({ projectIds: scope.map((p) => p.id), includeArchived: false, limit: 2000, sort: "due" }) : [],
    progressSeries({ projectIds: scope.map((p) => p.id), days: 90 }),
  ]);
  const deps = showTickets ? await (await getDb()).select().from(ticketDeps) : [];
  const t = today();

  const rows: TimelineRow[] = [];
  const unscheduled: typeof milestones = [];
  for (const p of scope) {
    const ms = milestones.filter((m) => m.projectId === p.id);
    const dated = ms.filter((m) => m.targetDate);
    unscheduled.push(...ms.filter((m) => !m.targetDate));
    if (!dated.length) continue;
    rows.push({ kind: "project", id: p.id, label: `${p.key} — ${p.name}`, href: `/projects/${p.key}` });
    for (const m of dated) {
      const start = m.startDate ?? toIsoDate(m.createdAt);
      rows.push({
        kind: "milestone",
        id: m.id,
        label: m.name,
        href: `/projects/${p.key}?tab=milestones`,
        start: start <= m.targetDate! ? start : m.targetDate!,
        end: m.targetDate!,
        done: m.progress.done,
        total: m.progress.total,
        completed: !!m.completedAt,
        overdue: m.overdue,
        dependsOn: m.dependsOn,
      });
      if (showTickets)
        for (const tk of tickets.filter((x) => x.milestoneId === m.id))
          rows.push({
            kind: "ticket",
            id: tk.id,
            label: `${tk.key} ${tk.title}`,
            href: `/tickets/${tk.key}`,
            due: tk.dueDate,
            done: tk.status.category === "done",
            blocked: tk.blocked,
            overdue: tk.overdue,
            blockedBy: deps.filter((d) => d.ticketId === tk.id).map((d) => d.blockedById),
          });
    }
  }

  return (
    <>
      <PageHeader
        title="Roadmap"
        description="Milestones over time. Bars fill with done tickets; dashed connectors are dependencies."
        actions={
          <>
            <NativeSelectNav
              param="project"
              label="Project"
              value={selected?.key ?? ""}
              options={[{ value: "", label: "All projects" }, ...projects.map((p) => ({ value: p.key, label: p.key }))]}
            />
            <NativeSelectNav
              param="tickets"
              label="Detail"
              value={showTickets ? "1" : ""}
              options={[
                { value: "", label: "Milestones only" },
                { value: "1", label: "With tickets" },
              ]}
            />
          </>
        }
      />
      <PageBody>
        {rows.length ? (
          <>
            <Timeline rows={rows} today={t} />
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-sky-500/60" /> done fraction</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm ring-1 ring-amber-500/70" /> overdue</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm ring-1 ring-emerald-500/60" /> completed</span>
              <span className="flex items-center gap-1.5"><span className="h-3 border-l-2 border-sky-400/70" /> today</span>
              {showTickets && <span>◆ ticket due date (green done · red blocked · amber overdue)</span>}
            </div>
          </>
        ) : (
          <Empty>
            No dated milestones{selected ? ` in ${selected.key}` : ""}. Add milestones with target dates on a project&apos;s{" "}
            <Link className="underline" href={selected ? `/projects/${selected.key}?tab=milestones` : "/projects"}>milestones tab</Link>.
          </Empty>
        )}

        {unscheduled.length > 0 && (
          <Section title="Unscheduled milestones (no target date)">
            <ul className="space-y-1 text-sm">
              {unscheduled.map((m) => (
                <li key={m.id}>
                  <Link href={`/projects/${m.projectKey}?tab=milestones`} className="hover:underline">
                    {m.name}
                  </Link>{" "}
                  <span className="text-xs text-muted-foreground">
                    {m.projectKey} · {m.progress.done}/{m.progress.total} · {pct(m.progress.countPercent)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Planned vs completed (90 days)">
          <Burnup series={series} />
        </Section>
      </PageBody>
    </>
  );
}
