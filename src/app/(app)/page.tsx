import Link from "next/link";
import { ActivityFeed } from "@/components/activity-feed";
import { GithubActivityList } from "@/components/github/github-activity";
import { Recommendations } from "@/components/insights";
import { Empty, PageBody, PageHeader, pct, ProgressBar, Section, Stat } from "@/components/page";
import { NativeSelectNav } from "@/components/select-nav";
import { NewTicketButton } from "@/components/tickets/new-ticket-button";
import { addDays, daysAgo, today } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { githubActivity, pendingSuggestions, projectRepositoryIds } from "@/server/services/github";
import { accomplishments, recommendations, staleTickets } from "@/server/services/intelligence";
import { progressByProject } from "@/server/services/progress";
import { listProjects } from "@/server/services/projects";
import { listTickets } from "@/server/services/tickets";
import { milestoneViews, recentActivity } from "@/server/services/views";

export const metadata = { title: "Dashboard" };

const PERIODS = [7, 14, 30, 90];

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  await requireUser();
  const sp = await searchParams;
  const days = PERIODS.find((d) => String(d) === sp.days) ?? 7;
  const allProjects = await listProjects();
  const selected = allProjects.find((p) => p.key === sp.project);
  const active = allProjects.filter((p) => p.status === "active" || p.status === "planned");
  const scope = selected ? [selected.id] : allProjects.map((p) => p.id);

  if (!allProjects.length)
    return (
      <>
        <PageHeader title="Dashboard" />
        <PageBody>
          <Empty>
            Welcome to Orbit. Start by <Link href="/projects?new=1" className="underline">creating a project</Link>, or describe an objective to the{" "}
            <Link href="/assistant" className="underline">assistant</Link>.
          </Empty>
        </PageBody>
      </>
    );

  const t = today();
  const since = daysAgo(days);
  const [open, inProgress, blocked, overdue, recs, done, milestones, progress, activity, repoIds, suggestions, stale] = await Promise.all([
    listTickets({ projectIds: scope, categories: ["backlog", "todo", "in_progress", "in_review"], limit: 2000 }),
    listTickets({ projectIds: scope, categories: ["in_progress", "in_review"] }),
    listTickets({ projectIds: scope, blocked: true, categories: ["backlog", "todo", "in_progress", "in_review"] }),
    listTickets({ projectIds: scope, due: "overdue" }),
    recommendations({ projectIds: scope, limit: 5 }),
    accomplishments({ days, projectIds: scope }),
    milestoneViews({ projectId: selected?.id }),
    progressByProject(selected ? [selected.id] : active.map((p) => p.id)),
    recentActivity({ projectIds: selected ? [selected.id] : undefined, since, limit: 20 }),
    projectRepositoryIds(scope),
    pendingSuggestions(),
    staleTickets(scope),
  ]);
  const gh = await githubActivity({ repositoryIds: selected ? repoIds : undefined, days, limit: 8 });
  const upcoming = milestones
    .filter((m) => !m.completedAt && m.targetDate && m.targetDate <= addDays(t, 30))
    .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Today is ${t}`}
        actions={
          <>
            <NativeSelectNav
              param="project"
              label="Project"
              value={selected?.key ?? ""}
              options={[{ value: "", label: "All projects" }, ...allProjects.map((p) => ({ value: p.key, label: p.key }))]}
            />
            <NativeSelectNav
              param="days"
              label="Period"
              value={String(days)}
              options={PERIODS.map((d) => ({ value: String(d), label: `Last ${d} days` }))}
            />
            <NewTicketButton defaults={{ projectId: selected?.id }} />
          </>
        }
      />
      <PageBody>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Open" value={String(open.length)} sub="not done" />
          <Stat label="In progress" value={String(inProgress.length)} sub={stale.length ? `${stale.length} stale` : "none stale"} warn={stale.length > 0} />
          <Stat label="Blocked" value={String(blocked.length)} warn={blocked.length > 0} />
          <Stat label="Overdue" value={String(overdue.length)} warn={overdue.length > 0} />
          <Stat label={`Done (${days}d)`} value={String(done.completed.length)} sub={`${done.created.length} created`} />
        </div>

        {suggestions.length > 0 && (
          <Link href="/github" className="block rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm hover:bg-sky-500/10">
            {suggestions.length} status suggestion(s) from GitHub activity waiting for review →
          </Link>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Section title="Suggested next" actions={<Link href="/insights" className="text-xs text-muted-foreground hover:text-foreground">All insights</Link>}>
              <Recommendations recs={recs} />
            </Section>

            <Section title="Project progress">
              <div className="space-y-3">
                {(selected ? [selected] : active).map((p) => {
                  const pr = progress.get(p.id);
                  if (!pr) return null;
                  return (
                    <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                      <Link href={`/projects/${p.key}`} className="truncate hover:underline">
                        <span className="font-mono text-xs text-muted-foreground">{p.key}</span> {p.name}
                      </Link>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {pr.done}/{pr.total} · {pct(pr.countPercent)}
                        {pr.estimatePercent != null && ` · ${pct(pr.estimatePercent)} est.`}
                      </span>
                      <ProgressBar value={pr.countPercent} className="col-span-2" />
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="Upcoming & overdue milestones (30 days)">
              {upcoming.length ? (
                <ul className="space-y-1.5 text-sm">
                  {upcoming.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2">
                      <span className={cn("w-24 shrink-0 text-xs tabular-nums", m.overdue ? "text-amber-400" : "text-muted-foreground")}>
                        {m.targetDate}
                      </span>
                      <Link href={`/projects/${m.projectKey}?tab=milestones`} className="hover:underline">
                        {m.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">{m.projectKey}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {m.progress.done}/{m.progress.total} · {pct(m.progress.countPercent)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No milestones due in the next 30 days.</p>
              )}
            </Section>

            <Section title={`Recently completed (${days} days)`}>
              {done.completed.length ? (
                <ul className="space-y-1 text-sm">
                  {done.completed.slice(0, 12).map((c) => (
                    <li key={c.id}>
                      <Link href={`/tickets/${c.key}`} className="hover:underline">
                        <span className="font-mono text-xs text-muted-foreground">{c.key}</span> {c.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing completed in this period.</p>
              )}
            </Section>
          </div>

          <div className="space-y-6">
            <Section title={`GitHub (${days} days)`}>
              <GithubActivityList activity={gh} />
            </Section>
            <Section title="Activity">
              <ActivityFeed items={activity} />
            </Section>
          </div>
        </div>
      </PageBody>
    </>
  );
}
