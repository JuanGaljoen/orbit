import Link from "next/link";
import { addDays, daysBetween } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type TimelineRow =
  | { kind: "project"; id: string; label: string; href: string }
  | {
      kind: "milestone";
      id: string;
      label: string;
      href: string;
      start: string;
      end: string;
      done: number;
      total: number;
      completed: boolean;
      overdue: boolean;
      dependsOn: string[];
    }
  | {
      kind: "ticket";
      id: string;
      label: string;
      href: string;
      due: string | null;
      done: boolean;
      blocked: boolean;
      overdue: boolean;
      blockedBy: string[];
    };

const ROW = 32;
const LABEL_W = 220;

/**
 * Gantt-style roadmap. Milestone bars span start → target with the done fraction filled; ticket
 * rows show due-date markers. Dependencies are drawn as connectors from the prerequisite's end to
 * the dependent's start. Status always carries a text label, never colour alone.
 */
export function Timeline({ rows, today }: { rows: TimelineRow[]; today: string }) {
  const dated = rows.flatMap((r) => (r.kind === "milestone" ? [r.start, r.end] : r.kind === "ticket" && r.due ? [r.due] : []));
  if (!dated.length) return null;
  const sorted = [...dated, today].sort();
  const from = addDays(sorted[0], -7);
  let to = addDays(sorted.at(-1)!, 14);
  if (daysBetween(from, to) < 90) to = addDays(from, 90);
  const span = daysBetween(from, to);
  const x = (d: string) => (daysBetween(from, d) / span) * 100;

  const months: { label: string; at: number }[] = [];
  for (let d = `${from.slice(0, 7)}-01`; d <= to; ) {
    if (d >= from) months.push({ label: new Date(`${d}T00:00:00Z`).toLocaleString("en", { month: "short", year: "2-digit", timeZone: "UTC" }), at: x(d) });
    const [y, m] = d.split("-").map(Number);
    d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }

  const index = new Map(rows.map((r, i) => [r.id, i]));
  const connectors: { x1: number; y1: number; x2: number; y2: number; key: string }[] = [];
  for (const [i, r] of rows.entries()) {
    const deps = r.kind === "milestone" ? r.dependsOn : r.kind === "ticket" ? r.blockedBy : [];
    for (const depId of deps) {
      const j = index.get(depId);
      if (j == null) continue;
      const dep = rows[j];
      const depEnd = dep.kind === "milestone" ? dep.end : dep.kind === "ticket" ? dep.due : null;
      const start = r.kind === "milestone" ? r.start : r.kind === "ticket" ? r.due : null;
      if (!depEnd || !start) continue;
      connectors.push({ key: `${depId}-${r.id}`, x1: x(depEnd), y1: j * ROW + ROW / 2, x2: x(start), y2: i * ROW + ROW / 2 });
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="min-w-[760px]">
        <div className="flex border-b text-[11px] text-muted-foreground">
          <div className="shrink-0 px-3 py-1.5" style={{ width: LABEL_W }} />
          <div className="relative h-7 flex-1">
            {months.map((m) => (
              <span key={m.label} className="absolute top-1.5 border-l pl-1" style={{ left: `${m.at}%` }}>
                {m.label}
              </span>
            ))}
          </div>
        </div>
        <div className="relative flex">
          <div className="shrink-0" style={{ width: LABEL_W }}>
            {rows.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "flex items-center truncate px-3 text-sm",
                  r.kind === "project" && "font-medium",
                  r.kind === "ticket" && "pl-7 text-xs text-muted-foreground",
                )}
                style={{ height: ROW }}
              >
                <Link href={r.href} className="truncate hover:underline" title={r.label}>
                  {r.label}
                </Link>
              </div>
            ))}
          </div>
          <div className="relative flex-1" style={{ height: rows.length * ROW }}>
            {months.map((m) => (
              <div key={m.label} className="absolute inset-y-0 border-l border-border/50" style={{ left: `${m.at}%` }} />
            ))}
            <div className="absolute inset-y-0 z-10 border-l-2 border-sky-400/70" style={{ left: `${x(today)}%` }} title={`Today ${today}`} />
            <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox={`0 0 100 ${rows.length * ROW}`}>
              {connectors.map((c) => (
                <polyline
                  key={c.key}
                  points={`${c.x1},${c.y1} ${Math.max(c.x1, c.x2) + 0.4},${c.y1} ${Math.max(c.x1, c.x2) + 0.4},${c.y2} ${c.x2},${c.y2}`}
                  fill="none"
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {rows.map((r, i) => {
              const top = i * ROW;
              if (r.kind === "project") return <div key={r.id} className="absolute inset-x-0 border-t" style={{ top }} />;
              if (r.kind === "milestone") {
                const left = x(r.start);
                const width = Math.max(0.8, x(r.end) - left);
                const frac = r.total ? r.done / r.total : 0;
                const state = r.completed ? "completed" : r.overdue ? "overdue" : "open";
                return (
                  <Link
                    key={r.id}
                    href={r.href}
                    className={cn(
                      "absolute flex h-5 items-center overflow-hidden rounded bg-muted ring-1 transition-[filter] hover:brightness-125",
                      r.completed ? "ring-emerald-500/60" : r.overdue ? "ring-amber-500/70" : "ring-border",
                    )}
                    style={{ top: top + 6, left: `${left}%`, width: `${width}%` }}
                    title={`${r.label}: ${r.start} → ${r.end} · ${r.done}/${r.total} done · ${state}`}
                  >
                    <span className="absolute inset-y-0 left-0 rounded-l bg-sky-500/60" style={{ width: `${frac * 100}%` }} />
                    <span className="relative truncate px-1.5 text-[11px] text-foreground">
                      {r.done}/{r.total}
                      {r.completed ? " · completed" : r.overdue ? " · overdue" : ""}
                    </span>
                  </Link>
                );
              }
              if (!r.due) return null;
              return (
                <Link
                  key={r.id}
                  href={r.href}
                  className={cn(
                    "absolute size-2.5 -translate-x-1/2 rotate-45 ring-2 ring-background",
                    r.done ? "bg-emerald-500" : r.blocked ? "bg-red-500" : r.overdue ? "bg-amber-500" : "bg-sky-400",
                  )}
                  style={{ top: top + ROW / 2 - 5, left: `${x(r.due)}%` }}
                  title={`${r.label} · due ${r.due}${r.done ? " · done" : r.blocked ? " · blocked" : r.overdue ? " · overdue" : ""}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
