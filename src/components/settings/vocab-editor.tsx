"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  createLabelAction,
  createPriorityAction,
  createStatusAction,
  deleteLabelAction,
  deletePriorityAction,
  deleteStatusAction,
  reorderStatusesAction,
  updateLabelAction,
  updatePriorityAction,
  updateStatusAction,
} from "@/actions/vocab";
import { useApp } from "@/components/app/app-context";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { STATUS_CATEGORIES, type StatusCategory } from "@/db/schema";
import { call } from "@/lib/action-client";

const CATEGORY_LABEL: Record<StatusCategory, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
};

function ColorInput({ value, onCommit }: { value: string; onCommit: (c: string) => void }) {
  return (
    <input
      type="color"
      defaultValue={value}
      onBlur={(e) => e.target.value !== value && onCommit(e.target.value)}
      className="h-7 w-8 shrink-0 cursor-pointer rounded border bg-transparent"
      aria-label="Colour"
    />
  );
}

function NameInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  return (
    <Input
      defaultValue={value}
      className="h-7"
      onBlur={(e) => e.target.value.trim() && e.target.value !== value && onCommit(e.target.value.trim())}
    />
  );
}

export function StatusEditor() {
  const { statuses } = useApp();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StatusCategory>("todo");
  const [confirm, dialog] = useConfirm();
  const move = (i: number, d: -1 | 1) => {
    const ids = statuses.map((s) => s.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    call(reorderStatusesAction(ids));
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Each status maps to a category, which drives progress, blocking and GitHub suggestions. Board columns follow this order.
      </p>
      {statuses.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <ColorInput value={s.color} onCommit={(color) => call(updateStatusAction(s.id, { color }))} />
          <NameInput value={s.name} onCommit={(n) => call(updateStatusAction(s.id, { name: n }))} />
          <NativeSelect
            className="h-7 w-36 text-xs"
            value={s.category}
            onChange={(e) => call(updateStatusAction(s.id, { category: e.target.value as StatusCategory }))}
          >
            {STATUS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </NativeSelect>
          <Button size="icon-xs" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
            <ArrowUp />
          </Button>
          <Button size="icon-xs" variant="ghost" disabled={i === statuses.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
            <ArrowDown />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Delete ${s.name}`}
            onClick={async () => {
              if (await confirm({ title: `Delete status "${s.name}"?`, description: "Only possible when no ticket uses it.", confirmLabel: "Delete", destructive: true }))
                call(deleteStatusAction(s.id), "Status deleted");
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <form
        className="flex items-center gap-2 pt-1"
        onSubmit={async (e) => {
          e.preventDefault();
          if ((await call(createStatusAction({ name, category }), "Status added")) !== null) setName("");
        }}
      >
        <Input className="h-7" placeholder="New status" value={name} onChange={(e) => setName(e.target.value)} />
        <NativeSelect className="h-7 w-36 text-xs" value={category} onChange={(e) => setCategory(e.target.value as StatusCategory)}>
          {STATUS_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </NativeSelect>
        <Button size="sm" type="submit" disabled={!name.trim()}>
          Add
        </Button>
      </form>
      {dialog}
    </div>
  );
}

export function PriorityEditor() {
  const { priorities } = useApp();
  const [name, setName] = useState("");
  const [confirm, dialog] = useConfirm();
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Rank 0 is most urgent. Ranks 0–1 count as high priority (highlighted, weighted in recommendations).</p>
      {priorities.map((p) => (
        <div key={p.id} className="flex items-center gap-2">
          <ColorInput value={p.color} onCommit={(color) => call(updatePriorityAction(p.id, { color }))} />
          <NameInput value={p.name} onCommit={(n) => call(updatePriorityAction(p.id, { name: n }))} />
          <Input
            type="number"
            min={0}
            defaultValue={p.rank}
            className="h-7 w-20"
            aria-label="Rank"
            onBlur={(e) => Number(e.target.value) !== p.rank && call(updatePriorityAction(p.id, { rank: Number(e.target.value) }))}
          />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Delete ${p.name}`}
            onClick={async () => {
              if (await confirm({ title: `Delete priority "${p.name}"?`, description: "Only possible when no ticket uses it.", confirmLabel: "Delete", destructive: true }))
                call(deletePriorityAction(p.id), "Priority deleted");
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <form
        className="flex items-center gap-2 pt-1"
        onSubmit={async (e) => {
          e.preventDefault();
          const rank = (priorities.at(-1)?.rank ?? -1) + 1;
          if ((await call(createPriorityAction({ name, rank }), "Priority added")) !== null) setName("");
        }}
      >
        <Input className="h-7" placeholder="New priority" value={name} onChange={(e) => setName(e.target.value)} />
        <Button size="sm" type="submit" disabled={!name.trim()}>
          Add
        </Button>
      </form>
      {dialog}
    </div>
  );
}

export function LabelEditor() {
  const { labels } = useApp();
  const [name, setName] = useState("");
  const [confirm, dialog] = useConfirm();
  return (
    <div className="space-y-2">
      {labels.length === 0 && <p className="text-xs text-muted-foreground">No labels yet.</p>}
      {labels.map((l) => (
        <div key={l.id} className="flex items-center gap-2">
          <ColorInput value={l.color} onCommit={(color) => call(updateLabelAction(l.id, { color }))} />
          <NameInput value={l.name} onCommit={(n) => call(updateLabelAction(l.id, { name: n }))} />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Delete ${l.name}`}
            onClick={async () => {
              if (await confirm({ title: `Delete label "${l.name}"?`, description: "It's removed from every ticket.", confirmLabel: "Delete", destructive: true }))
                call(deleteLabelAction(l.id), "Label deleted");
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <form
        className="flex items-center gap-2 pt-1"
        onSubmit={async (e) => {
          e.preventDefault();
          if ((await call(createLabelAction({ name }), "Label added")) !== null) setName("");
        }}
      >
        <Input className="h-7" placeholder="New label" value={name} onChange={(e) => setName(e.target.value)} />
        <Button size="sm" type="submit" disabled={!name.trim()}>
          Add
        </Button>
      </form>
      {dialog}
    </div>
  );
}
