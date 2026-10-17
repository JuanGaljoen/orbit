"use client";

import Link from "next/link";
import { useState } from "react";
import { archiveTicketAction, bulkDeleteTicketsAction, bulkUpdateTicketsAction } from "@/actions/tickets";
import { useApp } from "@/components/app/app-context";
import { useConfirm } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { call } from "@/lib/action-client";
import { cn } from "@/lib/utils";
import type { TicketSummary } from "@/server/services/tickets";
import { accentClass, LabelChip, PriorityPill, StatusPill, TicketFlags, TypeIcon } from "./badges";

export function TicketTable({
  tickets,
  selectable = true,
  showProject = true,
  archivedView = false,
}: {
  tickets: TicketSummary[];
  selectable?: boolean;
  showProject?: boolean;
  archivedView?: boolean;
}) {
  const app = useApp();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, confirmDialog] = useConfirm();
  const ids = [...selected].filter((id) => tickets.some((t) => t.id === id));
  const allSelected = ids.length > 0 && ids.length === tickets.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function bulk(change: Parameters<typeof bulkUpdateTicketsAction>[0], what: string) {
    const ok = await confirm({ title: `${what} for ${ids.length} ticket(s)?`, confirmLabel: "Apply" });
    if (!ok) return;
    const n = await call(bulkUpdateTicketsAction(change), `Updated ${ids.length} ticket(s)`);
    if (n != null) setSelected(new Set());
  }

  if (!tickets.length) return null;

  return (
    <div className="space-y-2">
      {selectable && ids.length > 0 && (
        <div className="sticky top-12 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm md:top-2">
          <span className="font-medium">{ids.length} selected</span>
          <NativeSelect
            className="h-7 w-auto text-xs"
            value=""
            onChange={(e) => {
              const s = app.statuses.find((x) => x.id === e.target.value);
              if (s) bulk({ ids, statusId: s.id }, `Set status "${s.name}"`);
            }}
          >
            <option value="">Set status…</option>
            {app.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            className="h-7 w-auto text-xs"
            value=""
            onChange={(e) => {
              const p = app.priorities.find((x) => x.id === e.target.value);
              if (p) bulk({ ids, priorityId: p.id }, `Set priority "${p.name}"`);
            }}
          >
            <option value="">Set priority…</option>
            {app.priorities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            className="h-7 w-auto text-xs"
            value=""
            onChange={(e) => {
              const l = app.labels.find((x) => x.id === e.target.value);
              if (l) bulk({ ids, addLabelId: l.id }, `Add label "${l.name}"`);
            }}
          >
            <option value="">Add label…</option>
            {app.labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </NativeSelect>
          <Button
            size="xs"
            variant="outline"
            onClick={() => bulk({ ids, archive: !archivedView }, archivedView ? "Restore" : "Archive")}
          >
            {archivedView ? "Restore" : "Archive"}
          </Button>
          <Button
            size="xs"
            variant="destructive"
            onClick={async () => {
              const ok = await confirm({
                title: `Delete ${ids.length} ticket(s) permanently?`,
                description: "Comments, links and dependencies go with them. This cannot be undone — archive instead if unsure.",
                confirmLabel: "Delete",
                destructive: true,
              });
              if (ok && (await call(bulkDeleteTicketsAction(ids), `Deleted ${ids.length} ticket(s)`)) != null)
                setSelected(new Set());
            }}
          >
            Delete
          </Button>
          <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
            <tr>
              {selectable && (
                <th className="w-8 py-2 pl-3">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(tickets.map((t) => t.id)))}
                  />
                </th>
              )}
              <th className="py-2 pl-3 font-medium">Ticket</th>
              <th className="hidden py-2 font-medium md:table-cell">Status</th>
              <th className="hidden py-2 font-medium sm:table-cell">Priority</th>
              <th className="hidden py-2 font-medium lg:table-cell">Due</th>
              <th className="hidden py-2 pr-3 text-right font-medium lg:table-cell">Est.</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr
                key={t.id}
                className={cn("border-t border-l-2 hover:bg-muted/20", accentClass(t), selected.has(t.id) && "bg-muted/30")}
              >
                {selectable && (
                  <td className="py-2 pl-3 align-top">
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.key}`}
                      checked={selected.has(t.id)}
                      onChange={() => toggle(t.id)}
                    />
                  </td>
                )}
                <td className="py-2 pl-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <TypeIcon type={t.type} />
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {showProject ? t.key : `#${t.number}`}
                    </span>
                    <Link href={`/tickets/${t.key}`} className="truncate hover:underline">
                      {t.title}
                    </Link>
                    {t.subtaskCount > 0 && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {t.subtaskDone}/{t.subtaskCount}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5.5">
                    <TicketFlags ticket={t} />
                    {t.milestoneName && <span className="text-[11px] text-muted-foreground">◆ {t.milestoneName}</span>}
                    {t.labels.map((l) => (
                      <LabelChip key={l.id} label={l} />
                    ))}
                    <span className="md:hidden">
                      <StatusPill status={t.status} />
                    </span>
                    {archivedView && (
                      <Button size="xs" variant="ghost" onClick={() => call(archiveTicketAction(t.id, false), "Restored")}>
                        Restore
                      </Button>
                    )}
                  </div>
                </td>
                <td className="hidden py-2 align-top md:table-cell">
                  <StatusPill status={t.status} />
                </td>
                <td className="hidden py-2 align-top sm:table-cell">
                  <PriorityPill priority={t.priority} />
                </td>
                <td className={cn("hidden py-2 align-top text-xs lg:table-cell", t.overdue ? "text-amber-400" : "text-muted-foreground")}>
                  {t.dueDate ?? "—"}
                </td>
                <td className="hidden py-2 pr-3 text-right align-top text-xs text-muted-foreground lg:table-cell">
                  {t.estimate ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmDialog}
    </div>
  );
}
