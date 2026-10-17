import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { GitBranch, Bot, User, Cog, Terminal } from "lucide-react";

type Item = {
  id: string;
  summary: string;
  kind: string;
  actor: string;
  createdAt: Date;
  projectKey: string | null;
  data: Record<string, unknown>;
  ticketKey?: string | null;
};

const ACTOR_ICON = { github: GitBranch, ai: Bot, user: User, system: Cog, api: Terminal } as const;

export function ActivityFeed({ items, ticketKeys }: { items: Item[]; ticketKeys?: Map<string, string> }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="space-y-2">
      {items.map((a) => {
        const Icon = ACTOR_ICON[a.actor as keyof typeof ACTOR_ICON] ?? User;
        const key = a.ticketKey ?? (a.data.ticketId ? ticketKeys?.get(String(a.data.ticketId)) : undefined);
        return (
          <li key={a.id} className="flex items-start gap-2 text-sm">
            <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <span className="text-foreground/90">
                {key && (
                  <Link href={`/tickets/${key}`} className="mr-1 font-mono text-xs text-muted-foreground hover:text-foreground">
                    {key}
                  </Link>
                )}
                {a.summary}
              </span>
              <div className="text-xs text-muted-foreground">
                {a.projectKey && `${a.projectKey} · `}
                {formatDistanceToNow(a.createdAt, { addSuffix: true })}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
