import { formatDistanceToNow } from "date-fns";
import { GitCommit, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { githubActivity } from "@/server/services/github";

type Activity = Awaited<ReturnType<typeof githubActivity>>;

const PR_ICON = { open: GitPullRequest, draft: GitPullRequestDraft, merged: GitMerge, closed: GitPullRequestClosed };
const PR_COLOR = { open: "text-emerald-400", draft: "text-muted-foreground", merged: "text-violet-400", closed: "text-red-400" };

export function ChecksBadge({ state }: { state: string | null }) {
  if (!state) return null;
  const meta = {
    success: ["✓ checks", "text-emerald-400"],
    failure: ["✕ checks failing", "text-red-400"],
    pending: ["● checks running", "text-amber-400"],
    neutral: ["○ checks", "text-muted-foreground"],
  }[state] ?? [state, "text-muted-foreground"];
  return <span className={cn("text-[11px]", meta[1])}>{meta[0]}</span>;
}

export function GithubActivityList({ activity, showRepo = true }: { activity: Activity; showRepo?: boolean }) {
  const { pullRequests, commits } = activity;
  if (!pullRequests.length && !commits.length)
    return <p className="text-sm text-muted-foreground">No GitHub activity in this period.</p>;
  return (
    <div className="space-y-4">
      {pullRequests.length > 0 && (
        <ul className="space-y-1.5">
          {pullRequests.map((pr) => {
            const Icon = PR_ICON[pr.state];
            return (
              <li key={pr.id} className="flex items-start gap-2 text-sm">
                <Icon className={cn("mt-0.5 size-3.5 shrink-0", PR_COLOR[pr.state])} />
                <div className="min-w-0">
                  <a href={pr.htmlUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    #{pr.number} {pr.title}
                  </a>
                  <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    {showRepo && <span>{pr.repo}</span>}
                    <span>{pr.state}</span>
                    <span>{formatDistanceToNow(pr.ghUpdatedAt, { addSuffix: true })}</span>
                    <ChecksBadge state={pr.checksState} />
                    {!pr.linked && <span className="text-amber-400/90">no ticket</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {commits.length > 0 && (
        <ul className="space-y-1">
          {commits.slice(0, 15).map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              <GitCommit className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <a href={c.htmlUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  <span className="font-mono text-xs text-muted-foreground">{c.sha.slice(0, 7)}</span> {c.message.split("\n")[0]}
                </a>
                <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  {showRepo && <span>{c.repo}</span>}
                  {c.branch && <span>{c.branch}</span>}
                  <span>{formatDistanceToNow(c.committedAt, { addSuffix: true })}</span>
                  {!c.linked && <span className="text-amber-400/90">no ticket</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
