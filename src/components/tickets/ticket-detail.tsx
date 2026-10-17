"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  addCommentAction,
  addDependencyAction,
  archiveTicketAction,
  deleteCommentAction,
  deleteTicketAction,
  removeDependencyAction,
  updateCommentAction,
  updateTicketAction,
} from "@/actions/tickets";
import { useApp } from "@/components/app/app-context";
import { useConfirm } from "@/components/confirm";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_TYPES } from "@/db/schema";
import { call } from "@/lib/action-client";
import { cn } from "@/lib/utils";
import type { TicketDetail as Detail, TicketSummary } from "@/server/services/tickets";
import { Dot, LabelChip, StatusPill, TicketFlags, TYPE_META, TypeIcon } from "./badges";
import { TicketPicker } from "./ticket-picker";

export function TicketDetail({ ticket, aside }: { ticket: Detail; aside?: React.ReactNode }) {
  const app = useApp();
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const update = (patch: Parameters<typeof updateTicketAction>[1]) => call(updateTicketAction(ticket.id, patch));
  const milestones = app.milestones.filter((m) => m.projectId === ticket.projectId);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-6">
        <TitleEditor ticket={ticket} onSave={(title) => update({ title })} />

        {ticket.parent && (
          <p className="text-sm text-muted-foreground">
            Subtask of{" "}
            <Link href={`/tickets/${ticket.parent.key}`} className="text-foreground hover:underline">
              {ticket.parent.key} {ticket.parent.title}
            </Link>
          </p>
        )}

        <TextBlock label="Description" value={ticket.description} onSave={(description) => update({ description })} />
        <TextBlock
          label="Acceptance criteria"
          value={ticket.acceptanceCriteria}
          onSave={(acceptanceCriteria) => update({ acceptanceCriteria })}
        />
        <TextBlock
          label="Technical notes"
          value={ticket.technicalNotes}
          onSave={(technicalNotes) => update({ technicalNotes })}
        />

        {!ticket.parentId && <Subtasks ticket={ticket} />}
        <Dependencies ticket={ticket} />
        {aside}
        <Comments ticket={ticket} />
        <History ticket={ticket} />
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="space-y-3 rounded-lg border p-3 text-sm">
          <Prop label="Status">
            <NativeSelect value={ticket.status.id} onChange={(e) => update({ statusId: e.target.value })}>
              {app.statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </Prop>
          <Prop label="Priority">
            <NativeSelect value={ticket.priority.id} onChange={(e) => update({ priorityId: e.target.value })}>
              {app.priorities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </Prop>
          <Prop label="Type">
            <NativeSelect
              value={ticket.type}
              onChange={(e) => update({ type: e.target.value as (typeof TICKET_TYPES)[number] })}
            >
              {TICKET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].label}
                </option>
              ))}
            </NativeSelect>
          </Prop>
          <Prop label="Milestone">
            <NativeSelect
              value={ticket.milestoneId ?? ""}
              onChange={(e) => update({ milestoneId: e.target.value || null })}
            >
              <option value="">None</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </NativeSelect>
          </Prop>
          <div className="grid grid-cols-2 gap-2">
            <Prop label="Due">
              <Input
                type="date"
                defaultValue={ticket.dueDate ?? ""}
                onBlur={(e) => e.target.value !== (ticket.dueDate ?? "") && update({ dueDate: e.target.value || null })}
              />
            </Prop>
            <Prop label="Estimate">
              <Input
                type="number"
                min={0}
                step={0.5}
                defaultValue={ticket.estimate ?? ""}
                onBlur={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  if (v !== ticket.estimate) update({ estimate: v });
                }}
              />
            </Prop>
          </div>
          <Prop label="Labels">
            <div className="flex flex-wrap gap-1">
              {app.labels.map((l) => {
                const on = ticket.labels.some((x) => x.id === l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      update({
                        labelIds: on
                          ? ticket.labels.filter((x) => x.id !== l.id).map((x) => x.id)
                          : [...ticket.labels.map((x) => x.id), l.id],
                      })
                    }
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px]",
                      on ? "border-foreground/40 bg-muted" : "text-muted-foreground opacity-60 hover:opacity-100",
                    )}
                  >
                    <Dot color={l.color} className="size-1.5" /> {l.name}
                  </button>
                );
              })}
              {app.labels.length === 0 && <span className="text-xs text-muted-foreground">No labels yet (Settings)</span>}
            </div>
          </Prop>
        </div>

        <div className="space-y-1 px-1 text-xs text-muted-foreground">
          <p>Created {formatDistanceToNow(ticket.createdAt, { addSuffix: true })}</p>
          <p>Updated {formatDistanceToNow(ticket.updatedAt, { addSuffix: true })}</p>
          {ticket.completedAt && <p>Completed {formatDistanceToNow(ticket.completedAt, { addSuffix: true })}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              call(archiveTicketAction(ticket.id, !ticket.archivedAt), ticket.archivedAt ? "Restored" : "Archived")
            }
          >
            {ticket.archivedAt ? <ArchiveRestore /> : <Archive />}
            {ticket.archivedAt ? "Restore" : "Archive"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={async () => {
              const ok = await confirm({
                title: `Delete ${ticket.key}?`,
                description: "Deletes the ticket with its comments, links and dependencies. Subtasks are kept as standalone tickets. Cannot be undone.",
                confirmLabel: "Delete",
                destructive: true,
              });
              if (ok && (await call(deleteTicketAction(ticket.id), `Deleted ${ticket.key}`)) !== null)
                router.push("/tickets");
            }}
          >
            <Trash2 /> Delete
          </Button>
        </div>
      </aside>
      {confirmDialog}
    </div>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function TitleEditor({ ticket, onSave }: { ticket: Detail; onSave: (t: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(ticket.title);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <TypeIcon type={ticket.type} />
        <span className="font-mono">{ticket.key}</span>
        <StatusPill status={ticket.status} />
        <TicketFlags ticket={ticket} />
        {ticket.archivedAt && <span className="rounded bg-muted px-1.5 py-px">Archived</span>}
        {ticket.labels.map((l) => (
          <LabelChip key={l.id} label={l} />
        ))}
      </div>
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim() && title !== ticket.title) onSave(title.trim());
            setEditing(false);
          }}
        >
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} className="h-10 text-xl font-semibold" />
        </form>
      ) : (
        <h1 className="cursor-text text-xl font-semibold tracking-tight" onClick={() => setEditing(true)}>
          {ticket.title}
        </h1>
      )}
    </div>
  );
}

function TextBlock({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => Promise<unknown> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
        {!editing && (
          <Button size="icon-xs" variant="ghost" onClick={() => { setDraft(value); setEditing(true); }} aria-label={`Edit ${label}`}>
            <Pencil />
          </Button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            rows={Math.max(4, draft.split("\n").length + 1)}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                await onSave(draft);
                setEditing(false);
              }
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={async () => { await onSave(draft); setEditing(false); }}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : value.trim() ? (
        <Markdown>{value}</Markdown>
      ) : (
        <button className="text-sm text-muted-foreground/70 hover:text-muted-foreground" onClick={() => setEditing(true)}>
          Add {label.toLowerCase()}…
        </button>
      )}
    </section>
  );
}

function MiniRow({ t, onRemove }: { t: TicketSummary; onRemove?: () => void }) {
  return (
    <li className="group flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/30">
      <TypeIcon type={t.type} />
      <span className="font-mono text-xs text-muted-foreground">{t.key}</span>
      <Link href={`/tickets/${t.key}`} className={cn("truncate hover:underline", t.status.category === "done" && "text-muted-foreground line-through")}>
        {t.title}
      </Link>
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <TicketFlags ticket={t} />
        <StatusPill status={t.status} />
        {onRemove && (
          <button onClick={onRemove} className="opacity-0 group-hover:opacity-100" aria-label={`Remove ${t.key}`}>
            <X className="size-3.5 text-muted-foreground" />
          </button>
        )}
      </span>
    </li>
  );
}

function Subtasks({ ticket }: { ticket: Detail }) {
  const { openQuickCreate } = useApp();
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Subtasks {ticket.subtaskCount > 0 && `· ${ticket.subtaskDone}/${ticket.subtaskCount}`}
        </h2>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => openQuickCreate({ projectId: ticket.projectId, parentId: ticket.id, milestoneId: ticket.milestoneId ?? undefined })}
        >
          <Plus /> Add
        </Button>
      </div>
      {ticket.subtasks.length > 0 && (
        <ul>
          {ticket.subtasks.map((s) => (
            <MiniRow key={s.id} t={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Dependencies({ ticket }: { ticket: Detail }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Blocked by</h2>
        <Button size="xs" variant="ghost" onClick={() => setAdding((a) => !a)}>
          <Plus /> Add blocker
        </Button>
      </div>
      {adding && (
        <TicketPicker
          exclude={[ticket.id, ...ticket.blockers.map((b) => b.id)]}
          onPick={async (t) => {
            if ((await call(addDependencyAction(ticket.id, t.id), `${t.key} now blocks ${ticket.key}`)) !== null)
              setAdding(false);
          }}
        />
      )}
      {ticket.blockers.length > 0 ? (
        <ul>
          {ticket.blockers.map((b) => (
            <MiniRow key={b.id} t={b} onRemove={() => call(removeDependencyAction(ticket.id, b.id))} />
          ))}
        </ul>
      ) : (
        !adding && <p className="text-xs text-muted-foreground/70">Nothing blocks this ticket.</p>
      )}
      {ticket.blocking.length > 0 && (
        <>
          <h3 className="pt-2 text-sm font-medium text-muted-foreground">Blocking</h3>
          <ul>
            {ticket.blocking.map((b) => (
              <MiniRow key={b.id} t={b} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Comments({ ticket }: { ticket: Detail }) {
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [confirm, dialog] = useConfirm();

  async function submit() {
    if (!body.trim()) return;
    if ((await call(addCommentAction(ticket.id, body))) !== null) setBody("");
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Comments</h2>
      {ticket.comments.map((c) => (
        <div key={c.id} className="group rounded-lg border p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{c.author === "user" ? "You" : c.author === "ai" ? "Assistant" : "System"}</span>
            <span>{formatDistanceToNow(c.createdAt, { addSuffix: true })}</span>
            <span className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100">
              <Button size="icon-xs" variant="ghost" aria-label="Edit comment" onClick={() => { setEditing(c.id); setDraft(c.body); }}>
                <Pencil />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Delete comment"
                onClick={async () => {
                  if (await confirm({ title: "Delete this comment?", confirmLabel: "Delete", destructive: true }))
                    call(deleteCommentAction(c.id));
                }}
              >
                <Trash2 />
              </Button>
            </span>
          </div>
          {editing === c.id ? (
            <div className="space-y-2">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
              <div className="flex gap-2">
                <Button size="xs" onClick={async () => { if ((await call(updateCommentAction(c.id, draft))) !== null) setEditing(null); }}>
                  Save
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Markdown>{c.body}</Markdown>
          )}
        </div>
      ))}
      <div className="space-y-2">
        <Textarea
          placeholder="Write a comment (markdown)… ⌘↵ to send"
          value={body}
          rows={3}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <Button size="sm" onClick={submit} disabled={!body.trim()}>
          Comment
        </Button>
      </div>
      {dialog}
    </section>
  );
}

function History({ ticket }: { ticket: Detail }) {
  if (!ticket.history.length) return null;
  return (
    <section className="space-y-1.5">
      <h2 className="text-sm font-medium text-muted-foreground">Activity</h2>
      <ol className="space-y-1 border-l pl-3 text-xs text-muted-foreground">
        {ticket.history.map((h) => (
          <li key={h.id} className="flex gap-2">
            <span className="text-foreground/80">{h.summary}</span>
            <span className="shrink-0">· {h.actor !== "user" ? `${h.actor} · ` : ""}{formatDistanceToNow(h.createdAt, { addSuffix: true })}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
