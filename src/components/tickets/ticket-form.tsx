"use client";

import { useMemo, useState } from "react";
import { createLabelAction } from "@/actions/vocab";
import { useApp } from "@/components/app/app-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { TICKET_TYPES, type TicketType } from "@/db/schema";
import { call } from "@/lib/action-client";
import { cn } from "@/lib/utils";
import { Dot, TYPE_META } from "./badges";

export type TicketFormValues = {
  projectId: string;
  title: string;
  type: TicketType;
  statusId: string;
  priorityId: string;
  milestoneId: string | null;
  parentId: string | null;
  labelIds: string[];
  dueDate: string | null;
  estimate: number | null;
  description: string;
  acceptanceCriteria: string;
  technicalNotes: string;
};

export function useTicketDefaults(partial: Partial<TicketFormValues> = {}): TicketFormValues {
  const { projects, statuses, priorities } = useApp();
  return {
    projectId: partial.projectId ?? projects[0]?.id ?? "",
    title: "",
    type: "task",
    statusId: partial.statusId ?? statuses.find((s) => s.category === "todo")?.id ?? statuses[0]?.id ?? "",
    priorityId: partial.priorityId ?? priorities.find((p) => p.name === "Medium")?.id ?? priorities.at(-1)?.id ?? "",
    milestoneId: null,
    parentId: null,
    labelIds: [],
    dueDate: null,
    estimate: null,
    description: "",
    acceptanceCriteria: "",
    technicalNotes: "",
    ...partial,
  };
}

export function TicketForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  lockProject,
  parentKey,
}: {
  initial: TicketFormValues;
  submitLabel: string;
  onSubmit: (values: TicketFormValues) => Promise<boolean>;
  onCancel?: () => void;
  lockProject?: boolean;
  parentKey?: string;
}) {
  const app = useApp();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [labels, setLabels] = useState(app.labels);
  const set = <K extends keyof TicketFormValues>(k: K, value: TicketFormValues[K]) =>
    setV((prev) => ({ ...prev, [k]: value }));
  const milestones = useMemo(
    () => app.milestones.filter((m) => m.projectId === v.projectId && (!m.completedAt || m.id === v.milestoneId)),
    [app.milestones, v.projectId, v.milestoneId],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title.trim() || busy) return;
    setBusy(true);
    const ok = await onSubmit(v);
    setBusy(false);
    if (ok && !initial.title) setV({ ...initial, projectId: v.projectId });
  }

  async function addLabel() {
    const name = newLabel.trim();
    if (!name) return;
    const label = await call(createLabelAction({ name }));
    if (label) {
      setLabels((ls) => (ls.some((l) => l.id === label.id) ? ls : [...ls, label]));
      set("labelIds", [...new Set([...v.labelIds, label.id])]);
      setNewLabel("");
    }
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
      }}
      className="space-y-4"
    >
      <Input
        autoFocus
        placeholder="Ticket title"
        value={v.title}
        onChange={(e) => set("title", e.target.value)}
        className="h-10 text-base"
        aria-label="Title"
      />
      {parentKey && <p className="text-xs text-muted-foreground">Subtask of {parentKey}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Project">
          <NativeSelect
            value={v.projectId}
            disabled={lockProject}
            onChange={(e) => setV((p) => ({ ...p, projectId: e.target.value, milestoneId: null, parentId: null }))}
          >
            {app.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.key} — {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Type">
          <NativeSelect value={v.type} onChange={(e) => set("type", e.target.value as TicketType)}>
            {TICKET_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t].label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Status">
          <NativeSelect value={v.statusId} onChange={(e) => set("statusId", e.target.value)}>
            {app.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Priority">
          <NativeSelect value={v.priorityId} onChange={(e) => set("priorityId", e.target.value)}>
            {app.priorities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Milestone">
          <NativeSelect
            value={v.milestoneId ?? ""}
            onChange={(e) => set("milestoneId", e.target.value || null)}
          >
            <option value="">None</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Due">
            <Input type="date" value={v.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value || null)} />
          </Field>
          <Field label="Estimate">
            <Input
              type="number"
              min={0}
              step={0.5}
              placeholder="pts"
              value={v.estimate ?? ""}
              onChange={(e) => set("estimate", e.target.value === "" ? null : Number(e.target.value))}
            />
          </Field>
        </div>
      </div>

      <Field label="Labels">
        <div className="flex flex-wrap items-center gap-1.5">
          {labels.map((l) => {
            const on = v.labelIds.includes(l.id);
            return (
              <button
                type="button"
                key={l.id}
                onClick={() => set("labelIds", on ? v.labelIds.filter((x) => x !== l.id) : [...v.labelIds, l.id])}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  on ? "border-foreground/40 bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50",
                )}
                aria-pressed={on}
              >
                <Dot color={l.color} className="size-1.5" />
                {l.name}
              </button>
            );
          })}
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                addLabel();
              }
            }}
            placeholder="+ new label"
            className="h-6 w-28 text-xs"
            aria-label="New label"
          />
        </div>
      </Field>

      <Field label="Description (markdown)">
        <Textarea rows={5} value={v.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Acceptance criteria">
          <Textarea
            rows={4}
            placeholder={"- [ ] Given …, when …, then …"}
            value={v.acceptanceCriteria}
            onChange={(e) => set("acceptanceCriteria", e.target.value)}
          />
        </Field>
        <Field label="Technical notes">
          <Textarea rows={4} value={v.technicalNotes} onChange={(e) => set("technicalNotes", e.target.value)} />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">⌘↵ to save</span>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy || !v.title.trim() || !v.projectId}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
