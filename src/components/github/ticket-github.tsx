"use client";

import { useState } from "react";
import { FileCode, GitBranch, GitCommit, GitPullRequest, Plus, X } from "lucide-react";
import { acceptSuggestionAction, addManualLinkAction, dismissSuggestionAction, removeLinkAction } from "@/actions/github";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { LINK_KINDS, type LinkKind } from "@/db/schema";
import { call } from "@/lib/action-client";
import type { TicketDetail } from "@/server/services/tickets";
import { ChecksBadge } from "./github-activity";

const KIND_ICON = { pr: GitPullRequest, commit: GitCommit, branch: GitBranch, file: FileCode };
const CATEGORY_LABEL = { backlog: "Backlog", todo: "Todo", in_progress: "In Progress", in_review: "In Review", done: "Done" };

type PrInfo = { repositoryId: string; number: number; state: string; checksState: string | null };

export function TicketGithub({
  ticket,
  repos,
  prs,
}: {
  ticket: TicketDetail;
  repos: { id: string; fullName: string }[];
  prs: PrInfo[];
}) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<LinkKind>("pr");
  const [ref, setRef] = useState("");
  const [repoId, setRepoId] = useState(repos[0]?.id ?? "");
  const [confirm, dialog] = useConfirm();

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Code</h2>
        {repos.length > 0 && (
          <Button size="xs" variant="ghost" onClick={() => setAdding((a) => !a)}>
            <Plus /> Link
          </Button>
        )}
      </div>

      {ticket.suggestions.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-sm">
          <span>
            Suggest <strong>{CATEGORY_LABEL[s.suggestedCategory]}</strong>: {s.reason}
            {s.evidenceUrl && (
              <a href={s.evidenceUrl} target="_blank" rel="noreferrer" className="ml-1 text-sky-400 hover:underline">
                evidence
              </a>
            )}
          </span>
          <span className="ml-auto flex gap-1">
            <Button
              size="xs"
              onClick={async () => {
                if (
                  s.suggestedCategory !== "done" ||
                  (await confirm({
                    title: `Mark ${ticket.key} as Done?`,
                    description: "A merged PR is evidence, not proof. Check the acceptance criteria are actually met.",
                    confirmLabel: "Mark done",
                  }))
                )
                  call(acceptSuggestionAction(s.id), "Status updated");
              }}
            >
              Apply
            </Button>
            <Button size="xs" variant="ghost" onClick={() => call(dismissSuggestionAction(s.id))}>
              Dismiss
            </Button>
          </span>
        </div>
      ))}

      {adding && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if ((await call(addManualLinkAction({ ticketId: ticket.id, repositoryId: repoId, kind, ref }), "Linked")) !== null) {
              setRef("");
              setAdding(false);
            }
          }}
        >
          <NativeSelect className="h-7 w-auto text-xs" value={repoId} onChange={(e) => setRepoId(e.target.value)}>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect className="h-7 w-auto text-xs" value={kind} onChange={(e) => setKind(e.target.value as LinkKind)}>
            {LINK_KINDS.map((k) => (
              <option key={k} value={k}>
                {k === "pr" ? "Pull request #" : k}
              </option>
            ))}
          </NativeSelect>
          <Input
            className="h-7 w-48 text-xs"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={{ pr: "42", commit: "sha", branch: "branch-name", file: "src/path/file.ts" }[kind]}
          />
          <Button size="xs" type="submit" disabled={!ref.trim()}>
            Add
          </Button>
        </form>
      )}

      {ticket.links.length > 0 ? (
        <ul className="space-y-1">
          {ticket.links.map((l) => {
            const Icon = KIND_ICON[l.kind];
            const pr = l.kind === "pr" ? prs.find((p) => p.repositoryId === l.repositoryId && String(p.number) === l.ref) : null;
            return (
              <li key={l.id} className="group flex items-center gap-2 text-sm">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <a href={l.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                  {l.kind === "pr" ? `#${l.ref} ` : l.kind === "commit" ? `${l.ref.slice(0, 7)} ` : ""}
                  {l.title}
                </a>
                {pr && <span className="shrink-0 text-xs text-muted-foreground">{pr.state}</span>}
                {pr && <ChecksBadge state={pr.checksState} />}
                <span className="shrink-0 text-[11px] text-muted-foreground/70">{l.source}</span>
                <button
                  className="ml-auto opacity-0 group-hover:opacity-100"
                  aria-label="Remove link"
                  onClick={() => call(removeLinkAction(l.id))}
                >
                  <X className="size-3.5 text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground/70">
          {repos.length
            ? `No linked code yet. Mention ${ticket.key} in a branch name, PR title/body or commit message to link automatically.`
            : "Connect a GitHub repository to link code to tickets."}
        </p>
      )}
      {dialog}
    </section>
  );
}
