"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createObjectiveAction, deleteObjectiveAction, updateObjectiveAction } from "@/actions/planning";
import { useConfirm } from "@/components/confirm";
import { Markdown } from "@/components/markdown";
import { pct, ProgressBar } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { OBJECTIVE_STATUSES } from "@/db/schema";
import { call } from "@/lib/action-client";

type Objective = {
  id: string;
  title: string;
  description: string;
  status: (typeof OBJECTIVE_STATUSES)[number];
  targetDate: string | null;
  projects: { key: string; name: string; done: number; total: number; percent: number | null }[];
  done: number;
  total: number;
};

export function Objectives({ objectives }: { objectives: Objective[] }) {
  const [editing, setEditing] = useState<Objective | "new" | null>(null);
  const [confirm, dialog] = useConfirm();
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> New objective
        </Button>
      </div>
      {objectives.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Objectives are the outcomes you&apos;re working toward. Projects roll up into them. Ask the assistant to break one down into projects,
          milestones and tickets.
        </p>
      )}
      {objectives.map((o) => {
        const percent = o.total ? o.done / o.total : null;
        return (
          <div id={o.id} key={o.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{o.title}</span>
              <span className="rounded bg-muted px-1.5 py-px text-[11px] capitalize text-muted-foreground">{o.status}</span>
              {o.targetDate && <span className="text-xs text-muted-foreground">target {o.targetDate}</span>}
              <span className="ml-auto flex gap-1">
                <Button size="icon-xs" variant="ghost" aria-label="Edit objective" onClick={() => setEditing(o)}>
                  <Pencil />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Delete objective"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Delete "${o.title}"?`,
                        description: "Projects under it are kept and simply lose the objective.",
                        confirmLabel: "Delete",
                        destructive: true,
                      })
                    )
                      call(deleteObjectiveAction(o.id), "Objective deleted");
                  }}
                >
                  <Trash2 />
                </Button>
              </span>
            </div>
            <Markdown className="text-muted-foreground">{o.description}</Markdown>
            <ProgressBar value={percent} />
            <p className="text-xs text-muted-foreground">
              {o.done}/{o.total} tickets done across {o.projects.length} project(s) · {pct(percent)}
            </p>
            {o.projects.length > 0 && (
              <ul className="space-y-1 text-sm">
                {o.projects.map((p) => (
                  <li key={p.key} className="flex gap-2">
                    <Link href={`/projects/${p.key}`} className="hover:underline">
                      <span className="font-mono text-xs text-muted-foreground">{p.key}</span> {p.name}
                    </Link>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {p.done}/{p.total} · {pct(p.percent)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New objective" : "Edit objective"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ObjectiveForm
              initial={editing === "new" ? undefined : editing}
              onSubmit={async (v) => {
                const res =
                  editing === "new"
                    ? await call(createObjectiveAction(v), "Objective created")
                    : await call(updateObjectiveAction(editing.id, v), "Objective saved");
                if (res) setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {dialog}
    </div>
  );
}

function ObjectiveForm({
  initial,
  onSubmit,
}: {
  initial?: Pick<Objective, "title" | "description" | "status" | "targetDate">;
  onSubmit: (v: Pick<Objective, "title" | "description" | "status" | "targetDate">) => void;
}) {
  const [v, setV] = useState({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    status: initial?.status ?? ("active" as Objective["status"]),
    targetDate: initial?.targetDate ?? null,
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="o-title">Title</Label>
        <Input id="o-title" autoFocus value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="o-desc">Description</Label>
        <Textarea id="o-desc" rows={4} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <NativeSelect value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as Objective["status"] })}>
            {OBJECTIVE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label>Target date</Label>
          <Input type="date" value={v.targetDate ?? ""} onChange={(e) => setV({ ...v, targetDate: e.target.value || null })} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!v.title.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}
