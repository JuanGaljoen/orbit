"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Trash2 } from "lucide-react";
import {
  connectRepositoryAction,
  disconnectRepositoryAction,
  listAccessibleReposAction,
  syncRepositoryAction,
} from "@/actions/github";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { call } from "@/lib/action-client";
import { cn } from "@/lib/utils";

type Repo = {
  id: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch: string;
  syncStatus: string;
  syncError: string | null;
  lastSyncedAt: Date | null;
  lastWebhookAt: Date | null;
};

export function RepoManager({ repos, configured }: { repos: Repo[]; configured: boolean }) {
  const [accessible, setAccessible] = useState<{ fullName: string; private: boolean }[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, dialog] = useConfirm();

  async function connect(fullName: string) {
    setBusy("connect");
    const repo = await call(connectRepositoryAction(fullName), `Connected ${fullName}`);
    setBusy(null);
    if (!repo) return;
    setName("");
    setBusy(repo.id);
    await call(syncRepositoryAction(repo.id), "Initial sync complete");
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      {configured ? (
        <div className="flex flex-wrap items-center gap-2">
          {accessible ? (
            <NativeSelect className="w-72" value={name} onChange={(e) => setName(e.target.value)}>
              <option value="">Choose a repository…</option>
              {accessible
                .filter((a) => !repos.some((r) => r.fullName === a.fullName))
                .map((a) => (
                  <option key={a.fullName} value={a.fullName}>
                    {a.fullName}
                    {a.private ? " (private)" : ""}
                  </option>
                ))}
            </NativeSelect>
          ) : (
            <>
              <Input className="w-64" placeholder="owner/repo" value={name} onChange={(e) => setName(e.target.value)} />
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const list = await call(listAccessibleReposAction());
                  if (list) setAccessible(list);
                }}
              >
                Browse
              </Button>
            </>
          )}
          <Button size="sm" disabled={!name || busy === "connect"} onClick={() => connect(name)}>
            {busy === "connect" ? "Connecting…" : "Connect"}
          </Button>
        </div>
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          GitHub isn&apos;t configured. Set <code className="font-mono">GITHUB_TOKEN</code> (a fine-grained PAT with read access to
          Contents, Pull requests, Checks, Commit statuses and Metadata on the repos you want) and restart.
        </p>
      )}

      {repos.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {repos.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <a href={r.htmlUrl} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                  {r.fullName}
                </a>
                <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      r.syncStatus === "ok" && "text-emerald-400",
                      r.syncStatus === "error" && "text-red-400",
                      r.syncStatus === "syncing" && "text-amber-400",
                    )}
                  >
                    sync: {r.syncStatus}
                  </span>
                  <span>last sync {r.lastSyncedAt ? formatDistanceToNow(r.lastSyncedAt, { addSuffix: true }) : "never"}</span>
                  <span>last webhook {r.lastWebhookAt ? formatDistanceToNow(r.lastWebhookAt, { addSuffix: true }) : "never"}</span>
                  <span>default {r.defaultBranch}</span>
                </div>
                {r.syncError && <p className="mt-1 text-xs text-red-400">{r.syncError}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!configured || busy === r.id}
                onClick={async () => {
                  setBusy(r.id);
                  await call(syncRepositoryAction(r.id), `Synced ${r.fullName}`);
                  setBusy(null);
                }}
              >
                <RefreshCw className={cn(busy === r.id && "animate-spin")} /> Sync now
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Disconnect ${r.fullName}`}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Disconnect ${r.fullName}?`,
                      description: "Removes its synced branches, commits, PRs and all ticket links to it. Tickets themselves are kept.",
                      confirmLabel: "Disconnect",
                      destructive: true,
                    })
                  )
                    call(disconnectRepositoryAction(r.id), "Disconnected");
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </div>
  );
}
