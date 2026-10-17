"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import { applyProposalAction, discardProposalAction, updateProposalAction } from "@/actions/proposals";
import { useApp } from "@/components/app/app-context";
import { useConfirm } from "@/components/confirm";
import { TYPE_META } from "@/components/tickets/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_TYPES } from "@/db/schema";
import { call } from "@/lib/action-client";
import type { ProposalItem, ProposalPayload } from "@/server/services/proposals";

type Similar = Record<number, { key: string; title: string }[]>;

/** Review, edit, trim and apply (or discard) an AI proposal. */
export function ProposalReview({
  proposal,
  similar,
}: {
  proposal: { id: string; title: string; state: string; payload: ProposalPayload; result: unknown };
  similar: Similar;
}) {
  const app = useApp();
  const router = useRouter();
  const [items, setItems] = useState(proposal.payload.items);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, dialog] = useConfirm();
  const pending = proposal.state === "pending";

  const update = (i: number, patch: Partial<ProposalItem>) => {
    setItems((xs) => xs.map((x, j) => (j === i ? ({ ...x, ...patch } as ProposalItem) : x)));
    setDirty(true);
  };
  const remove = (i: number) => {
    setItems((xs) => xs.filter((_, j) => j !== i));
    setDirty(true);
  };

  async function save() {
    return (await call(updateProposalAction(proposal.id, { summary: proposal.payload.summary, items }), "Proposal saved")) !== null;
  }

  async function apply() {
    if (!(await confirm({ title: `Apply ${items.length} change(s)?`, description: "This creates/updates the items exactly as shown.", confirmLabel: "Apply" })))
      return;
    setBusy(true);
    if (dirty && !(await save())) return setBusy(false);
    const applied = await call(applyProposalAction(proposal.id), "Proposal applied");
    setBusy(false);
    if (applied) router.refresh();
  }

  const result = proposal.result as { applied?: string[]; error?: string } | null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium">{proposal.title}</h2>
        <span className="rounded bg-muted px-1.5 py-px text-[11px] text-muted-foreground">{proposal.state}</span>
        <Link href="/assistant" className="ml-auto text-xs text-muted-foreground hover:text-foreground">
          Close
        </Link>
      </div>
      {proposal.payload.summary && <p className="text-sm text-muted-foreground">{proposal.payload.summary}</p>}
      {result?.error && <p className="text-sm text-red-400">Last attempt failed: {result.error}</p>}
      {result?.applied && proposal.state === "applied" && (
        <p className="text-sm text-emerald-400">Applied: {result.applied.join(", ")}</p>
      )}

      <ol className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="space-y-2 rounded-lg border p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="rounded bg-muted px-1.5 py-px font-mono text-[11px]">{item.type.replace("_", " ")}</span>
              {"ref" in item && <span className="font-mono text-[11px] text-muted-foreground">{item.ref}</span>}
              {pending && (
                <button className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Remove item" onClick={() => remove(i)}>
                  <X className="size-4" />
                </button>
              )}
            </div>
            <ItemEditor item={item} disabled={!pending} onChange={(p) => update(i, p)} priorities={app.priorities.map((p) => p.name)} />
            {similar[i]?.length > 0 && (
              <p className="text-xs text-amber-400">
                Possible duplicate of{" "}
                {similar[i].map((s, k) => (
                  <span key={s.key}>
                    {k > 0 && ", "}
                    <Link href={`/tickets/${s.key}`} className="underline">
                      {s.key}
                    </Link>{" "}
                    {s.title}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ol>

      {pending && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={apply} disabled={busy || items.length === 0}>
            {busy ? "Applying…" : `Apply ${items.length} change(s)`}
          </Button>
          {dirty && (
            <Button variant="outline" onClick={async () => (await save()) && setDirty(false)}>
              Save edits
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              if (!(await confirm({ title: "Discard this proposal?", confirmLabel: "Discard", destructive: true }))) return;
              if ((await call(discardProposalAction(proposal.id), "Discarded")) !== null) router.push("/assistant");
            }}
          >
            Discard
          </Button>
        </div>
      )}
      {dialog}
    </div>
  );
}

function ItemEditor({
  item,
  disabled,
  onChange,
  priorities,
}: {
  item: ProposalItem;
  disabled: boolean;
  onChange: (p: Partial<ProposalItem>) => void;
  priorities: string[];
}) {
  const text = (label: string, value: string | null | undefined, key: string, rows = 0) =>
    rows ? (
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Textarea rows={rows} disabled={disabled} value={value ?? ""} onChange={(e) => onChange({ [key]: e.target.value } as Partial<ProposalItem>)} />
      </label>
    ) : (
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Input disabled={disabled} value={value ?? ""} onChange={(e) => onChange({ [key]: e.target.value } as Partial<ProposalItem>)} />
      </label>
    );
  const date = (label: string, value: string | null | undefined, key: string) => (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input type="date" disabled={disabled} value={value ?? ""} onChange={(e) => onChange({ [key]: e.target.value || null } as Partial<ProposalItem>)} />
    </label>
  );

  switch (item.type) {
    case "create_objective":
      return (
        <div className="grid gap-2">
          {text("Title", item.title, "title")}
          {text("Description", item.description, "description", 2)}
          {date("Target", item.targetDate, "targetDate")}
        </div>
      );
    case "create_project":
      return (
        <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
          {text("Key", item.key, "key")}
          {text("Name", item.name, "name")}
          <div className="sm:col-span-2">{text("Description", item.description, "description", 2)}</div>
          {date("Target", item.targetDate, "targetDate")}
        </div>
      );
    case "create_milestone":
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="sm:col-span-3">{text("Name", item.name, "name")}</div>
          <p className="text-xs text-muted-foreground">Project: {item.project}</p>
          {date("Start", item.startDate, "startDate")}
          {date("Target", item.targetDate, "targetDate")}
        </div>
      );
    case "create_ticket":
      return (
        <div className="grid gap-2">
          {text("Title", item.title, "title")}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Type</span>
              <NativeSelect disabled={disabled} value={item.ticketType} onChange={(e) => onChange({ ticketType: e.target.value as (typeof TICKET_TYPES)[number] })}>
                {TICKET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_META[t].label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Priority</span>
              <NativeSelect disabled={disabled} value={item.priority} onChange={(e) => onChange({ priority: e.target.value })}>
                {[...new Set([item.priority, ...priorities])].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Estimate</span>
              <Input
                type="number"
                min={0}
                disabled={disabled}
                value={item.estimate ?? ""}
                onChange={(e) => onChange({ estimate: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </label>
            {date("Due", item.dueDate, "dueDate")}
          </div>
          <p className="text-xs text-muted-foreground">
            Project {item.project}
            {item.milestone && ` · milestone ${item.milestone}`}
            {item.parent && ` · subtask of ${item.parent}`}
            {item.blockedBy.length > 0 && ` · blocked by ${item.blockedBy.join(", ")}`}
            {item.labels.length > 0 && ` · labels ${item.labels.join(", ")}`}
          </p>
          {text("Description", item.description, "description", 3)}
          {text("Acceptance criteria", item.acceptanceCriteria, "acceptanceCriteria", 3)}
          {item.rationale && <p className="text-xs text-muted-foreground">Why: {item.rationale}</p>}
        </div>
      );
    case "update_ticket":
      return (
        <div className="grid gap-2">
          <p className="text-xs text-muted-foreground">
            Update <Link href={`/tickets/${item.key}`} className="underline">{item.key}</Link>
          </p>
          {item.title != null && text("Title", item.title, "title")}
          {item.description != null && text("Description", item.description, "description", 3)}
          {item.acceptanceCriteria != null && text("Acceptance criteria", item.acceptanceCriteria, "acceptanceCriteria", 3)}
          {item.technicalNotes != null && text("Technical notes", item.technicalNotes, "technicalNotes", 3)}
          {item.priority != null && <p className="text-xs">Priority → {item.priority}</p>}
          {item.estimate != null && <p className="text-xs">Estimate → {item.estimate}</p>}
          {item.dueDate != null && <p className="text-xs">Due → {item.dueDate}</p>}
          {item.rationale && <p className="text-xs text-muted-foreground">Why: {item.rationale}</p>}
        </div>
      );
    case "add_dependency":
      return (
        <p className="text-sm">
          {item.blockedBy} blocks {item.ticket}
        </p>
      );
  }
}
