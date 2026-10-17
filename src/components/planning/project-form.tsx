"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_STATUSES } from "@/db/schema";

export type ProjectFormValues = {
  key: string;
  name: string;
  description: string;
  status: (typeof PROJECT_STATUSES)[number];
  targetDate: string | null;
  objectiveId: string | null;
};

export function ProjectForm({
  initial,
  objectives,
  isEdit,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<ProjectFormValues>;
  objectives: { id: string; title: string }[];
  isEdit?: boolean;
  onSubmit: (v: ProjectFormValues) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [v, setV] = useState<ProjectFormValues>({
    key: "",
    name: "",
    description: "",
    status: "active",
    targetDate: null,
    objectiveId: null,
    ...initial,
  });
  const [busy, setBusy] = useState(false);
  const [keyTouched, setKeyTouched] = useState(!!isEdit);

  const suggestKey = (name: string) =>
    name
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w, _, all) => (all.length === 1 ? w.slice(0, 4) : w[0]))
      .join("")
      .replace(/^[0-9]+/, "")
      .slice(0, 6);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSubmit(v);
        setBusy(false);
      }}
    >
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Name</Label>
          <Input
            id="p-name"
            autoFocus
            value={v.name}
            onChange={(e) =>
              setV((p) => ({ ...p, name: e.target.value, key: keyTouched ? p.key : suggestKey(e.target.value) }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-key">Key</Label>
          <Input
            id="p-key"
            value={v.key}
            disabled={isEdit}
            className="font-mono uppercase"
            maxLength={10}
            onChange={(e) => {
              setKeyTouched(true);
              setV((p) => ({ ...p, key: e.target.value.toUpperCase() }));
            }}
          />
        </div>
      </div>
      {!isEdit && <p className="-mt-2 text-xs text-muted-foreground">Ticket IDs look like {v.key || "KEY"}-1. The key can&apos;t change later.</p>}
      <div className="space-y-1.5">
        <Label htmlFor="p-desc">Description</Label>
        <Textarea id="p-desc" rows={4} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <NativeSelect value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as ProjectFormValues["status"] })}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label>Target date</Label>
          <Input type="date" value={v.targetDate ?? ""} onChange={(e) => setV({ ...v, targetDate: e.target.value || null })} />
        </div>
        <div className="space-y-1.5">
          <Label>Objective</Label>
          <NativeSelect value={v.objectiveId ?? ""} onChange={(e) => setV({ ...v, objectiveId: e.target.value || null })}>
            <option value="">None</option>
            {objectives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={busy || !v.name.trim() || !v.key}>
          {isEdit ? "Save" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
