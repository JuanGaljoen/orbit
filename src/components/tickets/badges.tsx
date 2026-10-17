import {
  BookOpen,
  Bug,
  CheckSquare,
  FlaskConical,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { TicketType } from "@/db/schema";
import { cn } from "@/lib/utils";

export const TYPE_META: Record<TicketType, { label: string; icon: LucideIcon; className: string }> = {
  feature: { label: "Feature", icon: Sparkles, className: "text-sky-400" },
  bug: { label: "Bug", icon: Bug, className: "text-red-400" },
  task: { label: "Task", icon: CheckSquare, className: "text-zinc-400" },
  improvement: { label: "Improvement", icon: TrendingUp, className: "text-emerald-400" },
  research: { label: "Research", icon: FlaskConical, className: "text-violet-400" },
  documentation: { label: "Docs", icon: BookOpen, className: "text-amber-400" },
};

export function TypeIcon({ type, className }: { type: TicketType; className?: string }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return <Icon aria-label={meta.label} className={cn("size-3.5 shrink-0", meta.className, className)} />;
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return (
    <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />
  );
}

export function StatusPill({ status }: { status: { name: string; color: string } }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
      <Dot color={status.color} />
      {status.name}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: { name: string; color: string; rank: number } }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-xs",
        priority.rank <= 1 ? "font-medium" : "text-muted-foreground",
      )}
      style={priority.rank <= 1 ? { color: priority.color } : undefined}
    >
      <PriorityBars rank={priority.rank} color={priority.color} />
      {priority.name}
    </span>
  );
}

function PriorityBars({ rank, color }: { rank: number; color: string }) {
  const level = Math.max(1, 4 - Math.min(rank, 3)); // rank 0 → 4 bars
  return (
    <span className="inline-flex items-end gap-px" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-0.5 rounded-sm"
          style={{ height: 3 + i * 2, background: i <= level ? color : "var(--border)" }}
        />
      ))}
    </span>
  );
}

export function LabelChip({ label }: { label: { name: string; color: string } }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px] leading-4 text-muted-foreground"
      style={{ borderColor: `${label.color}66` }}
    >
      <Dot color={label.color} className="size-1.5" />
      {label.name}
    </span>
  );
}

/** Blocked / overdue / high-priority flags — the visually distinct states the spec asks for. */
export function TicketFlags({
  ticket,
}: {
  ticket: { blocked: boolean; overdue: boolean; dueDate: string | null };
}) {
  return (
    <>
      {ticket.blocked && (
        <span className="rounded bg-red-500/15 px-1.5 py-px text-[11px] font-medium text-red-400">Blocked</span>
      )}
      {ticket.overdue && (
        <span className="rounded bg-amber-500/15 px-1.5 py-px text-[11px] font-medium text-amber-400">
          Overdue {ticket.dueDate}
        </span>
      )}
    </>
  );
}

/** Left accent for list rows / cards: red = blocked, amber = overdue, orange = high priority. */
export function accentClass(t: { blocked: boolean; overdue: boolean; highPriority: boolean }) {
  if (t.blocked) return "border-l-red-500";
  if (t.overdue) return "border-l-amber-500";
  if (t.highPriority) return "border-l-orange-500/70";
  return "border-l-transparent";
}
