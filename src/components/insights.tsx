import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { Finding, Recommendation } from "@/server/services/intelligence";
import { PriorityPill, StatusPill } from "./tickets/badges";

export function Recommendations({ recs }: { recs: Recommendation[] }) {
  if (!recs.length) return <p className="text-sm text-muted-foreground">Nothing to recommend — no open, unblocked work.</p>;
  return (
    <ol className="space-y-2">
      {recs.map((r, i) => (
        <li key={r.ticket.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
            <Link href={`/tickets/${r.ticket.key}`} className="font-medium hover:underline">
              <span className="font-mono text-xs text-muted-foreground">{r.ticket.key}</span> {r.ticket.title}
            </Link>
            <span className="ml-auto flex items-center gap-3">
              <StatusPill status={r.ticket.status} />
              <PriorityPill priority={r.ticket.priority} />
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Why: {r.reasons.join(" · ")}</p>
        </li>
      ))}
    </ol>
  );
}

export function Findings({ items, empty }: { items: Finding[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((f, i) => {
        const href = f.ticket ? `/tickets/${f.ticket.key}` : f.url;
        const external = href?.startsWith("http");
        return (
          <li key={i} className="text-sm">
            {href ? (
              <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="hover:underline">
                {f.title}
              </a>
            ) : (
              f.title
            )}
            <span className="text-muted-foreground"> — {f.detail}</span>
            {f.ticket && f.url && (
              <a href={f.url} target="_blank" rel="noreferrer" className="ml-1 text-xs text-sky-400 hover:underline">
                evidence
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function UntrackedWork({
  untracked,
}: {
  untracked: { pullRequests: { number: number; title: string; url: string; repo: string; mergedAt: Date | null }[]; commits: { sha: string; message: string; url: string; repo: string; at: Date }[] };
}) {
  if (!untracked.pullRequests.length && !untracked.commits.length)
    return <p className="text-sm text-muted-foreground">All recent merged PRs and default-branch commits reference a ticket.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {untracked.pullRequests.map((p) => (
        <li key={p.url}>
          <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">
            {p.repo}#{p.number} {p.title}
          </a>
          <span className="text-xs text-muted-foreground"> · merged {p.mergedAt && formatDistanceToNow(p.mergedAt, { addSuffix: true })}</span>
        </li>
      ))}
      {untracked.commits.map((c) => (
        <li key={c.sha}>
          <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
            <span className="font-mono text-xs text-muted-foreground">{c.sha.slice(0, 7)}</span> {c.message}
          </a>
          <span className="text-xs text-muted-foreground"> · {c.repo} · {formatDistanceToNow(c.at, { addSuffix: true })}</span>
        </li>
      ))}
    </ul>
  );
}
