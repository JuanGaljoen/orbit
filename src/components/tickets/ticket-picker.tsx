"use client";

import { useEffect, useState } from "react";
import { findTicketsAction } from "@/actions/tickets";
import { Input } from "@/components/ui/input";
import type { TicketSummary } from "@/server/services/tickets";

/** Type-ahead ticket search. Calls onPick with the chosen ticket. */
export function TicketPicker({
  onPick,
  exclude = [],
  placeholder = "Search tickets by key or title…",
}: {
  onPick: (t: TicketSummary) => void;
  exclude?: string[];
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TicketSummary[]>([]);

  useEffect(() => {
    if (!q.trim()) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await findTicketsAction(q);
      if (!cancelled && res.ok) setResults(res.data.filter((r) => !exclude.includes(r.id)));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, exclude]);

  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="h-7 text-xs" />
      {q.trim() && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted"
                onClick={() => {
                  onPick(r);
                  setQ("");
                  setResults([]);
                }}
              >
                <span className="font-mono text-muted-foreground">{r.key}</span>
                <span className="truncate">{r.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
