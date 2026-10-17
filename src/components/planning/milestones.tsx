"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  addMilestoneDepAction,
  completeMilestoneAction,
  createMilestoneAction,
  deleteMilestoneAction,
  removeMilestoneDepAction,
  updateMilestoneAction,
} from "@/actions/planning";
import { useConfirm } from "@/components/confirm";
import { pct, ProgressBar } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { call } from "@/lib/action-client";
import { cn } from "@/lib/utils";
import type { Progress } from "@/server/services/progress";

export type MilestoneView = {
  id: string;
  name: string;
  description: string;
  startDate: string | null;
  targetDate: string | null;
  completedAt: Date | null;
  dependsOn: string[];
  progress: Progress;
  overdue: boolean;
};

type FormValues = { name: string; description: string; startDate: string | null; targetDate: string | null };

export function MilestoneManager({ projectId, milestones }: { projectId: string; milestones: MilestoneView[] }) {
  const [editing, setEditing] = useState<MilestoneView | "new" | null>(null);
  const [confirm, dialog] = useConfirm();

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> New milestone
        </Button>
      </div>
      {milestones.length === 0 && (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No milestones yet. Milestones group tickets toward a dated goal and drive the roadmap.
        </p>
      )}
      {milestones.map((m) => (
        <div key={m.id} className={cn("space-y-2 rounded-lg border p-3", m.overdue && "border-amber-500/40")}>
          <div className="flex flex-wrap items-center gap-2">
            <button
              aria-label={m.completedAt ? "Reopen milestone" : "Mark milestone complete"}
              onClick={async () => {
                const open = m.progress.total - m.progress.done;
                if (
                  !m.completedAt &&
                  open > 0 &&
                  !(await confirm({
                    title: `Mark "${m.name}" complete?`,
                    description: `${open} ticket(s) in it are not done. Completion is your call — Orbit never infers it.`,
                    confirmLabel: "Mark complete",
                  }))
                )
                  return;
                call(completeMilestoneAction(m.id, !m.completedAt));
              }}
            >
              {m.completedAt ? <CheckCircle2 className="size-4 text-emerald-400" /> : <Circle className="size-4 text-muted-foreground" />}
            </button>
            <span className="font-medium">{m.name}</span>
            {m.overdue && <span className="rounded bg-amber-500/15 px-1.5 py-px text-[11px] text-amber-400">Overdue</span>}
            <span className="text-xs text-muted-foreground">
              {m.startDate && `${m.startDate} → `}
              {m.targetDate ?? "no target date"}
            </span>
            <span className="ml-auto flex gap-1">
              <Button size="icon-xs" variant="ghost" aria-label="Edit milestone" onClick={() => setEditing(m)}>
                <Pencil />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Delete milestone"
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Delete milestone "${m.name}"?`,
                      description: "Its tickets are kept and simply lose the milestone.",
                      confirmLabel: "Delete",
                      destructive: true,
                    })
                  )
                    call(deleteMilestoneAction(m.id), "Milestone deleted");
                }}
              >
                <Trash2 />
              </Button>
            </span>
          </div>
          {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
          <ProgressBar value={m.progress.countPercent} />
          <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>
              {m.progress.done}/{m.progress.total} tickets · {pct(m.progress.countPercent)}
            </span>
            <span>
              {m.progress.estimatePercent != null
                ? `${m.progress.estimateDone}/${m.progress.estimateTotal} pts · ${pct(m.progress.estimatePercent)}`
                : "no estimates"}
              {m.progress.unestimated > 0 && m.progress.estimatePercent != null && ` (${m.progress.unestimated} unestimated)`}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Depends on:</span>
            {m.dependsOn.map((d) => {
              const dep = milestones.find((x) => x.id === d);
              return (
                <span key={d} className="inline-flex items-center gap-1 rounded border px-1.5 py-px">
                  {dep?.name ?? "other project"}
                  <button aria-label="Remove dependency" onClick={() => call(removeMilestoneDepAction(m.id, d))}>
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <NativeSelect
              className="h-6 w-auto text-xs"
              value=""
              onChange={(e) => e.target.value && call(addMilestoneDepAction(m.id, e.target.value))}
            >
              <option value="">+ add</option>
              {milestones
                .filter((x) => x.id !== m.id && !m.dependsOn.includes(x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </NativeSelect>
          </div>
        </div>
      ))}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New milestone" : "Edit milestone"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <MilestoneForm
              initial={editing === "new" ? undefined : editing}
              onSubmit={async (v) => {
                const res =
                  editing === "new"
                    ? await call(createMilestoneAction({ projectId, ...v }), "Milestone created")
                    : await call(updateMilestoneAction(editing.id, v), "Milestone saved");
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

function MilestoneForm({ initial, onSubmit }: { initial?: FormValues; onSubmit: (v: FormValues) => Promise<void> }) {
  const [v, setV] = useState<FormValues>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    startDate: initial?.startDate ?? null,
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
        <Label htmlFor="m-name">Name</Label>
        <Input id="m-name" autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="m-desc">Description</Label>
        <Textarea id="m-desc" rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Start</span>
          <Input type="date" value={v.startDate ?? ""} onChange={(e) => setV({ ...v, startDate: e.target.value || null })} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Target</span>
          <Input type="date" value={v.targetDate ?? ""} onChange={(e) => setV({ ...v, targetDate: e.target.value || null })} />
        </label>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!v.name.trim()}>
          Save
        </Button>
      </div>
    </form>
  );
}
