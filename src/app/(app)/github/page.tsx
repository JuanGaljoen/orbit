import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { GithubActivityList } from "@/components/github/github-activity";
import { RepoManager } from "@/components/github/repo-manager";
import { PageBody, PageHeader, Section } from "@/components/page";
import { requireUser } from "@/server/auth";
import { githubActivity, integrationHealth, pendingSuggestions } from "@/server/services/github";
import { listTickets } from "@/server/services/tickets";

export const metadata = { title: "GitHub" };

export default async function GithubPage() {
  await requireUser();
  const [health, activity, suggestions] = await Promise.all([
    integrationHealth(),
    githubActivity({ days: 14, limit: 40 }),
    pendingSuggestions(),
  ]);
  const suggested = suggestions.length ? await listTickets({ ids: [...new Set(suggestions.map((s) => s.ticketId))] }) : [];
  const appUrl = process.env.APP_URL ?? "https://<your-orbit-domain>";

  return (
    <>
      <PageHeader title="GitHub" description="GitHub is the source of truth for code activity; Orbit is the source of truth for planning." />
      <PageBody className="max-w-5xl">
        <Section title="Repositories">
          <RepoManager repos={health.repos} configured={health.githubConfigured} />
        </Section>

        {suggestions.length > 0 && (
          <Section title={`Suggested status changes (${suggestions.length})`}>
            <ul className="space-y-1 text-sm">
              {suggestions.map((s) => {
                const t = suggested.find((x) => x.id === s.ticketId);
                return (
                  t && (
                    <li key={s.id}>
                      <Link href={`/tickets/${t.key}`} className="font-mono text-xs text-muted-foreground hover:text-foreground">
                        {t.key}
                      </Link>{" "}
                      {t.title} — <span className="text-muted-foreground">{s.reason}</span>
                    </li>
                  )
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">Review and apply them on each ticket. Nothing changes until you do.</p>
          </Section>
        )}

        <Section title="Recent activity (14 days)">
          <GithubActivityList activity={activity} />
        </Section>

        <Section title="Webhooks">
          <div className="space-y-2 rounded-lg border p-4 text-sm">
            <p>
              Status:{" "}
              {health.webhookConfigured ? (
                <span className="text-emerald-400">secret configured</span>
              ) : (
                <span className="text-amber-400">GITHUB_WEBHOOK_SECRET not set — webhooks are rejected; use Sync now</span>
              )}
            </p>
            <p className="text-muted-foreground">
              In each repo → Settings → Webhooks: payload URL <code className="font-mono text-foreground">{appUrl}/api/github/webhook</code>,
              content type <code className="font-mono">application/json</code>, the same secret, and events: Pull requests, Pushes,
              Branch or tag creation/deletion, Check runs, Check suites, Statuses.
            </p>
            {health.failedDeliveries.length > 0 && (
              <div className="space-y-1">
                <p className="text-red-400">Failed deliveries</p>
                {health.failedDeliveries.map((d) => (
                  <p key={d.deliveryId} className="font-mono text-xs text-muted-foreground">
                    {d.event} · {d.repositoryFullName} · {formatDistanceToNow(d.receivedAt, { addSuffix: true })} — {d.error}
                  </p>
                ))}
              </div>
            )}
            {health.recentDeliveries.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Recent deliveries</summary>
                {health.recentDeliveries.map((d) => (
                  <p key={d.deliveryId} className="font-mono">
                    {d.event} · {d.repositoryFullName ?? "—"} · {formatDistanceToNow(d.receivedAt, { addSuffix: true })} ·{" "}
                    {d.processedAt ? "ok" : d.error ? "failed" : "pending"}
                  </p>
                ))}
              </details>
            )}
          </div>
        </Section>
      </PageBody>
    </>
  );
}
