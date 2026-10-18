import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityFeed } from "@/components/activity-feed";
import { Burnup } from "@/components/charts/burnup";
import { GithubActivityList } from "@/components/github/github-activity";
import { PageBody, PageHeader, pct, ProgressBar, Section, Stat } from "@/components/page";
import { MilestoneManager } from "@/components/planning/milestones";
import { ProjectSettings } from "@/components/planning/project-settings";
import { NewTicketButton } from "@/components/tickets/new-ticket-button";
import { TicketTable } from "@/components/tickets/ticket-table";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { githubActivity, listRepositories } from "@/server/services/github";
import { listObjectives } from "@/server/services/objectives";
import { progressByProject, progressSeries } from "@/server/services/progress";
import { getProjectByKey, listProjectRepos } from "@/server/services/projects";
import { listTickets } from "@/server/services/tickets";
import { milestoneViews, recentActivity } from "@/server/services/views";

const TABS = ["overview", "tickets", "milestones", "settings"] as const;

export async function generateMetadata({ params }: PageProps<"/projects/[key]">) {
  return { title: (await params).key.toUpperCase() };
}

export default async function ProjectPage({ params, searchParams }: PageProps<"/projects/[key]">) {
  await requireUser();
  const { key } = await params;
  const sp = await searchParams;
  const tab = TABS.find((t) => t === sp.tab) ?? "overview";
  const project = await getProjectByKey(key).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [progress, milestones, repos] = await Promise.all([
    progressByProject([project.id]).then((m) => m.get(project.id)!),
    milestoneViews({ projectId: project.id }),
    listProjectRepos(project.id),
  ]);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{project.key}</span> {project.name}
            {project.archivedAt && <span className="rounded bg-muted px-1.5 py-px text-xs font-normal">Archived</span>}
          </span>
        }
        description={
          <span className="flex flex-wrap gap-x-3">
            <span className="capitalize">{project.status}</span>
            {project.targetDate && <span>Target {project.targetDate}</span>}
            <span>
              {progress.done}/{progress.total} done · {pct(progress.countPercent)}
            </span>
          </span>
        }
        actions={
          <>
            <Link href={`/board/${project.key}`} className="text-xs text-muted-foreground hover:text-foreground">
              Board
            </Link>
            <NewTicketButton defaults={{ projectId: project.id }} />
          </>
        }
      >
        <nav className="mt-3 flex gap-1 text-sm">
          {TABS.map((t) => (
            <Link
              key={t}
              href={`/projects/${project.key}${t === "overview" ? "" : `?tab=${t}`}`}
              className={cn(
                "rounded-md px-2.5 py-1 capitalize text-muted-foreground hover:text-foreground",
                tab === t && "bg-muted text-foreground",
              )}
            >
              {t}
            </Link>
          ))}
        </nav>
      </PageHeader>
      <PageBody>
        {tab === "overview" && <Overview project={project} progress={progress} milestones={milestones} repoIds={repos.map((r) => r.id)} />}
        {tab === "tickets" && <TicketTable tickets={await listTickets({ projectIds: [project.id], sort: "status" })} showProject={false} />}
        {tab === "milestones" && <MilestoneManager projectId={project.id} milestones={milestones} />}
        {tab === "settings" && (
          <ProjectSettings
            project={project}
            objectives={(await listObjectives()).map(({ id, title }) => ({ id, title }))}
            repos={(await listRepositories()).map(({ id, fullName }) => ({ id, fullName }))}
            linkedRepoIds={repos.map((r) => r.id)}
          />
        )}
      </PageBody>
    </>
  );
}

async function Overview({
  project,
  progress,
  milestones,
  repoIds,
}: {
  project: Awaited<ReturnType<typeof getProjectByKey>>;
  progress: Awaited<ReturnType<typeof progressByProject>> extends Map<string, infer P> ? P : never;
  milestones: Awaited<ReturnType<typeof milestoneViews>>;
  repoIds: string[];
}) {
  const [series, activity, gh, blocked, overdue] = await Promise.all([
    progressSeries({ projectIds: [project.id], days: 30 }),
    recentActivity({ projectIds: [project.id], limit: 15 }),
    githubActivity({ repositoryIds: repoIds, days: 14, limit: 10 }),
    listTickets({ projectIds: [project.id], blocked: true }),
    listTickets({ projectIds: [project.id], due: "overdue" }),
  ]);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        {project.description && <p className="max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">{project.description}</p>}
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Done" value={`${progress.done}/${progress.total}`} sub={pct(progress.countPercent) + " by count"} />
          <Stat
            label="By estimate"
            value={pct(progress.estimatePercent)}
            sub={progress.estimatePercent == null ? "no estimates" : `${progress.estimateDone}/${progress.estimateTotal} pts${progress.unestimated ? ` · ${progress.unestimated} unestimated` : ""}`}
          />
          <Stat label="In flight" value={String(progress.active)} sub={`${progress.notStarted} not started`} />
          <Stat label="Blocked / overdue" value={`${blocked.length} / ${overdue.length}`} sub="open tickets" warn={blocked.length + overdue.length > 0} />
        </div>
        <Section title="Burn-up (last 30 days)">
          <Burnup series={series} />
        </Section>
        <Section title="Milestones" actions={<Link href={`/projects/${project.key}?tab=milestones`} className="text-xs text-muted-foreground hover:text-foreground">Manage</Link>}>
          {milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No milestones yet.</p>
          ) : (
            <div className="space-y-2">
              {milestones.map((m) => (
                <div key={m.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                  <span className={cn("truncate", m.completedAt && "text-muted-foreground line-through")}>{m.name}</span>
                  <span className={cn("text-xs", m.overdue ? "text-amber-400" : "text-muted-foreground")}>
                    {m.targetDate ?? "—"} · {pct(m.progress.countPercent)}
                  </span>
                  <ProgressBar value={m.progress.countPercent} className="col-span-2" />
                </div>
              ))}
            </div>
          )}
        </Section>
        {(blocked.length > 0 || overdue.length > 0) && (
          <Section title="Needs attention">
            <TicketTable tickets={[...new Map([...blocked, ...overdue].map((t) => [t.id, t])).values()]} selectable={false} showProject={false} />
          </Section>
        )}
      </div>
      <div className="space-y-6">
        <Section title="GitHub (14 days)">
          {repoIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No repositories linked. <Link className="underline" href={`/projects/${project.key}?tab=settings`}>Link one</Link>.
            </p>
          ) : (
            <GithubActivityList activity={gh} />
          )}
        </Section>
        <Section title="Activity">
          <ActivityFeed items={activity} />
        </Section>
      </div>
    </div>
  );
}

