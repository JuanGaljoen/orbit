"use client";

import { useState } from "react";
import type { SeriesPoint } from "@/server/services/progress";

// Dark-mode categorical slots 1 & 2 from the validated reference palette (dataviz skill).
const DONE = "#3987e5";
const SCOPE = "#d95926";

// Wide viewBox so text keeps roughly its CSS size at typical page widths.
const W = 1100;
const H = 200;
const PAD = { top: 12, right: 40, bottom: 22, left: 30 };

/** Burn-up: scope vs done over time, from the activity log. Hover shows both values for a day. */
export function Burnup({ series }: { series: SeriesPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length < 2) return <p className="text-xs text-muted-foreground">Not enough history yet.</p>;

  const max = Math.max(1, ...series.map((p) => p.scope));
  const x = (i: number) => PAD.left + (i / (series.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const path = (key: "scope" | "done") => series.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[key])}`).join("");
  const last = series.at(-1)!;
  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const h = hover != null ? series[hover] : null;

  return (
    <figure className="space-y-2">
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded" style={{ background: SCOPE }} /> Scope (leaf tickets)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded" style={{ background: DONE }} /> Done
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full max-w-[1100px] touch-none"
          role="img"
          aria-label={`Burn-up: ${last.done} of ${last.scope} done as of ${last.date}`}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (series.length - 1));
            setHover(Math.max(0, Math.min(series.length - 1, i)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">
                {t}
              </text>
            </g>
          ))}
          <text x={PAD.left} y={H - 4} className="fill-muted-foreground text-[10px]">
            {series[0].date}
          </text>
          <text x={W - PAD.right} y={H - 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
            {last.date}
          </text>
          <path d={path("scope")} fill="none" stroke={SCOPE} strokeWidth={2} strokeLinejoin="round" />
          <path d={path("done")} fill="none" stroke={DONE} strokeWidth={2} strokeLinejoin="round" />
          <text x={x(series.length - 1) + 6} y={y(last.scope) + 3} className="fill-foreground text-[10px]">
            {last.scope}
          </text>
          <text x={x(series.length - 1) + 6} y={y(last.done) + 3} className="fill-foreground text-[10px]">
            {last.done}
          </text>
          {hover != null && h && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--muted-foreground)" strokeWidth={1} />
              <circle cx={x(hover)} cy={y(h.scope)} r={4} fill={SCOPE} stroke="var(--background)" strokeWidth={2} />
              <circle cx={x(hover)} cy={y(h.done)} r={4} fill={DONE} stroke="var(--background)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {h && hover != null && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border bg-popover px-2 py-1 text-xs shadow"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > series.length / 2 ? "translateX(-110%)" : "translateX(10%)" }}
          >
            <div className="text-muted-foreground">{h.date}</div>
            <div>
              <strong>{h.done}</strong> done
            </div>
            <div>
              <strong>{h.scope}</strong> in scope
            </div>
          </div>
        )}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Table</summary>
        <table className="mt-1">
          <thead>
            <tr>
              <th className="pr-4 text-left font-medium">Date</th>
              <th className="pr-4 text-right font-medium">Scope</th>
              <th className="text-right font-medium">Done</th>
            </tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.date}>
                <td className="pr-4">{p.date}</td>
                <td className="pr-4 text-right">{p.scope}</td>
                <td className="text-right">{p.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
