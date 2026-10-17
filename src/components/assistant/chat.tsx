"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, RotateCcw, Wrench } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AssistantEvent } from "@/lib/assistant-events";

type Turn = {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  proposals?: { id: string; title: string }[];
  error?: string;
};

const SUGGESTED = [
  "What should I work on next?",
  "What is blocking my next milestone?",
  "What did I accomplish this week?",
  "Which tickets are stale or overdue?",
  "Which milestones are at risk?",
  "What work has been implemented but not reflected in tickets?",
];

const TOOL_LABEL: Record<string, string> = {
  list_projects: "projects",
  search_tickets: "searched tickets",
  get_ticket: "read ticket",
  project_status: "project status",
  insights: "insights",
  recommend_next: "recommendations",
  accomplishments: "accomplishments",
  github_activity: "GitHub activity",
  list_milestones: "milestones",
  propose_changes: "drafted proposal",
};

const STORAGE_KEY = "orbit.assistant.v1";

export function AssistantChat({ projects, ask }: { projects: { key: string; name: string }[]; ask?: string }) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  // Per-browser convenience only: the conversation survives a reload, never shared or required.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (ask) {
      // A question handed over from elsewhere (e.g. a ticket) starts a fresh conversation.
      router.replace("/assistant");
      void send(ask, []);
      return;
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setTurns(JSON.parse(saved));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-40)));
    } catch {}
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  async function send(text: string, prior: Turn[] = turns) {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    const history = [...prior, { role: "user" as const, content: question }];
    setTurns([...history, { role: "assistant", content: "", tools: [], proposals: [] }]);
    const patch = (fn: (t: Turn) => Turn) => setTurns((ts) => [...ts.slice(0, -1), fn(ts[ts.length - 1])]);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history.filter((t) => t.content.trim()).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        patch((t) => ({ ...t, error: err.error ?? "Request failed" }));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as AssistantEvent;
          if (e.type === "text") patch((t) => ({ ...t, content: t.content + e.text }));
          if (e.type === "tool") patch((t) => ({ ...t, tools: [...(t.tools ?? []), e.name] }));
          if (e.type === "proposal") {
            patch((t) => ({ ...t, proposals: [...(t.proposals ?? []), { id: e.id, title: e.title }] }));
            router.refresh();
          }
          if (e.type === "error") patch((t) => ({ ...t, error: e.message }));
        }
      }
    } catch (err) {
      patch((t) => ({ ...t, error: err instanceof Error ? err.message : "Connection lost" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <div className="flex-1 space-y-5">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ask about your projects, or describe work to plan — I&apos;ll draft tickets for you to review. I only use data I can retrieve
              from Orbit and your connected GitHub repos.
            </p>
            <div className="flex flex-wrap gap-2">
              {[...SUGGESTED, ...projects.slice(0, 3).map((p) => `What is the current state of ${p.key}? What remains before I can ship it?`)].map(
                (s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                    {s}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[85%] rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">
              {t.content}
            </div>
          ) : (
            <div key={i} className="space-y-2">
              {!!t.tools?.length && (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Wrench className="size-3" />
                  {[...new Set(t.tools)].map((x) => (
                    <span key={x} className="rounded bg-muted/60 px-1.5 py-px">
                      {TOOL_LABEL[x] ?? x}
                    </span>
                  ))}
                </div>
              )}
              {t.content ? (
                <Markdown>{t.content}</Markdown>
              ) : (
                busy && i === turns.length - 1 && !t.error && <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              {t.proposals?.map((p) => (
                <Link
                  key={p.id}
                  href={`/assistant?proposal=${p.id}`}
                  className="block rounded-lg border border-sky-500/40 bg-sky-500/5 px-3 py-2 text-sm hover:bg-sky-500/10"
                >
                  Proposal ready for review: <strong>{p.title}</strong> →
                </Link>
              ))}
              {t.error && <p className="text-sm text-red-400">{t.error}</p>}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>
      <form
        className="sticky bottom-0 mt-6 flex items-end gap-2 bg-background py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {turns.length > 0 && (
          <Button type="button" size="icon" variant="ghost" aria-label="New conversation" disabled={busy} onClick={() => setTurns([])}>
            <RotateCcw />
          </Button>
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={2}
          placeholder="Ask a question, or describe an objective to break down into tickets…"
          className="min-h-0 resize-none"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
    </div>
  );
}
