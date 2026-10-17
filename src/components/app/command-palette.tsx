"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { searchAction } from "@/actions/search";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import type { SearchHit } from "@/server/services/search";
import { useApp } from "./app-context";
import { NAV } from "./nav";

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, openQuickCreate, projects } = useApp();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (!q.trim()) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await searchAction(q);
      if (!cancelled && res.ok) setHits(res.data);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const go = (href: string) => {
    setPaletteOpen(false);
    setQ("");
    router.push(href);
  };

  const visibleHits = q.trim() ? hits : [];
  const groups = (["ticket", "project", "milestone", "objective"] as const)
    .map((kind) => ({ kind, items: visibleHits.filter((h) => h.kind === kind) }))
    .filter((g) => g.items.length);

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen} title="Command palette">
      <Command>
        <CommandInput placeholder="Search tickets, projects, milestones… or jump" value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>{q ? "No matches." : "Type to search."}</CommandEmpty>
          {groups.map((g) => (
            <CommandGroup key={g.kind} heading={`${g.kind[0].toUpperCase()}${g.kind.slice(1)}s`}>
              {g.items.map((h) => (
                <CommandItem key={`${h.kind}-${h.id}`} value={`${h.kind} ${h.title} ${h.subtitle}`} onSelect={() => go(h.href)}>
                  <span className="truncate">{h.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{h.subtitle}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandGroup heading="Actions">
            <CommandItem
              value="action new ticket create"
              onSelect={() => {
                setPaletteOpen(false);
                openQuickCreate();
              }}
            >
              New ticket <CommandShortcut>C</CommandShortcut>
            </CommandItem>
            <CommandItem value="action new project create" onSelect={() => go("/projects?new=1")}>
              New project
            </CommandItem>
            <CommandItem value="action ask assistant ai" onSelect={() => go("/assistant")}>
              Ask the assistant
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Go to">
            {NAV.map((n) => (
              <CommandItem key={n.href} value={`go ${n.label}`} onSelect={() => go(n.href)}>
                <n.icon /> {n.label}
                {n.shortcut && <CommandShortcut>G {n.shortcut.toUpperCase()}</CommandShortcut>}
              </CommandItem>
            ))}
            {projects.map((p) => (
              <CommandItem key={p.id} value={`go project ${p.key} ${p.name}`} onSelect={() => go(`/projects/${p.key}`)}>
                {p.key} — {p.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
