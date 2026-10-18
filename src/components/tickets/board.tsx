"use client";

import Link from "next/link";
import { useState } from "react";
import {
  closestCorners,
  type CollisionDetection,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { moveTicketAction } from "@/actions/tickets";
import { useApp } from "@/components/app/app-context";
import { call } from "@/lib/action-client";
import { cn } from "@/lib/utils";
import type { TicketSummary } from "@/server/services/tickets";
import { accentClass, Dot, LabelChip, PriorityPill, TicketFlags, TypeIcon } from "./badges";

type Columns = Record<string, TicketSummary[]>;

// Drop where the pointer is. closestCorners alone loses empty columns: they stretch to the board's
// height, so their corners are always farther away than some card's in a full column.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCorners(args);
};

function group(tickets: TicketSummary[], statusIds: string[]): Columns {
  const cols: Columns = Object.fromEntries(statusIds.map((id) => [id, []]));
  for (const t of tickets) (cols[t.status.id] ??= []).push(t);
  for (const id of Object.keys(cols)) cols[id].sort((a, b) => a.position - b.position);
  return cols;
}

export function Board({ tickets, projectId }: { tickets: TicketSummary[]; projectId?: string }) {
  const { statuses, openQuickCreate } = useApp();
  const [cols, setCols] = useState(() => group(tickets, statuses.map((s) => s.id)));
  const [activeId, setActiveId] = useState<string | null>(null);
  // Re-group when the server sends fresh tickets (after refresh), without an effect.
  const [source, setSource] = useState(tickets);
  if (source !== tickets) {
    setSource(tickets);
    setCols(group(tickets, statuses.map((s) => s.id)));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnOf = (id: string) => (id in cols ? id : Object.keys(cols).find((c) => cols[c].some((t) => t.id === id)));
  const active = activeId ? Object.values(cols).flat().find((t) => t.id === activeId) : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  // Move the card between columns while hovering so the drop target previews correctly.
  function onDragOver(e: DragOverEvent) {
    const from = columnOf(String(e.active.id));
    const to = e.over ? columnOf(String(e.over.id)) : undefined;
    if (!from || !to || from === to) return;
    setCols((c) => {
      const card = c[from].find((t) => t.id === e.active.id)!;
      const overIndex = c[to].findIndex((t) => t.id === e.over!.id);
      const next = [...c[to]];
      next.splice(overIndex < 0 ? next.length : overIndex, 0, card);
      return { ...c, [from]: c[from].filter((t) => t.id !== e.active.id), [to]: next };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const col = columnOf(id);
    if (!col || !e.over) return;
    const list = [...cols[col]];
    const oldIndex = list.findIndex((t) => t.id === id);
    const overIndex = list.findIndex((t) => t.id === e.over!.id);
    const newIndex = overIndex < 0 ? oldIndex : overIndex;
    const [card] = list.splice(oldIndex, 1);
    list.splice(newIndex, 0, card);
    // Fractional position between neighbours — one row updated per move.
    const before = list[newIndex - 1]?.position;
    const after = list[newIndex + 1]?.position;
    const position =
      before == null && after == null ? 1 : before == null ? after! - 1 : after == null ? before + 1 : (before + after) / 2;
    const original = tickets.find((t) => t.id === id)!;
    setCols((c) => ({ ...c, [col]: list.map((t) => (t.id === id ? { ...t, position } : t)) }));
    if (original.status.id === col && original.position === position) return;
    const res = await call(moveTicketAction(id, col, position));
    if (!res) setCols(group(tickets, statuses.map((s) => s.id)));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setCols(group(tickets, statuses.map((s) => s.id)));
      }}
    >
      <div className="flex min-h-[60vh] gap-3 overflow-x-auto pb-4">
        {statuses.map((s) => (
          <Column
            key={s.id}
            id={s.id}
            title={s.name}
            color={s.color}
            tickets={cols[s.id] ?? []}
            onAdd={() => openQuickCreate({ statusId: s.id, projectId })}
          />
        ))}
      </div>
      <DragOverlay>{active ? <Card t={active} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}

function Column({
  id,
  title,
  color,
  tickets,
  onAdd,
}: {
  id: string;
  title: string;
  color: string;
  tickets: TicketSummary[];
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const points = tickets.reduce((n, t) => n + (t.estimate ?? 0), 0);
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-muted/20">
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <Dot color={color} />
        <span className="font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          {tickets.length}
          {points > 0 && ` · ${points} pts`}
        </span>
        <button onClick={onAdd} className="ml-auto text-muted-foreground hover:text-foreground" aria-label={`Add ticket to ${title}`}>
          <Plus className="size-4" />
        </button>
      </div>
      <SortableContext id={id} items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn("flex min-h-24 flex-1 flex-col gap-2 p-2", isOver && "bg-muted/30")}>
          {tickets.map((t) => (
            <SortableCard key={t.id} t={t} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableCard({ t }: { t: TicketSummary }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-30")}
      {...attributes}
      {...listeners}
    >
      <Card t={t} />
    </div>
  );
}

function Card({ t, overlay }: { t: TicketSummary; overlay?: boolean }) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-md border border-l-2 bg-card p-2.5 text-sm shadow-sm",
        accentClass(t),
        overlay && "rotate-1 shadow-lg",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TypeIcon type={t.type} />
        <span className="font-mono">{t.key}</span>
        {t.subtaskCount > 0 && <span className="ml-auto">{t.subtaskDone}/{t.subtaskCount}</span>}
      </div>
      <Link href={`/tickets/${t.key}`} className="line-clamp-3 block leading-snug hover:underline" onClick={(e) => overlay && e.preventDefault()}>
        {t.title}
      </Link>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityPill priority={t.priority} />
        <TicketFlags ticket={t} />
        {t.estimate != null && <span className="text-[11px] text-muted-foreground">{t.estimate} pts</span>}
        {t.labels.map((l) => (
          <LabelChip key={l.id} label={l} />
        ))}
      </div>
    </div>
  );
}
