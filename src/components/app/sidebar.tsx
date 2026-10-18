"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { boardTint } from "@/lib/board-tint";
import { cn } from "@/lib/utils";
import { useApp } from "./app-context";
import { NAV } from "./nav";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { projects, openQuickCreate, setPaletteOpen } = useApp();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center gap-2 px-2 pt-1 font-semibold">
        <span className="inline-block size-2.5 rounded-full bg-sky-400" /> Orbit
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" className="flex-1 justify-start" onClick={() => openQuickCreate()}>
          <Plus /> New ticket <kbd className="ml-auto font-mono text-[10px] opacity-60">C</kbd>
        </Button>
        <Button size="icon-sm" variant="outline" onClick={() => setPaletteOpen(true)} aria-label="Search (⌘K)">
          <Search />
        </Button>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
              active(n.href) && "bg-muted text-foreground",
            )}
          >
            <n.icon className="size-4" />
            {n.label}
          </Link>
        ))}
      </nav>
      {projects.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
            Projects
          </div>
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/board/${p.key}`}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                (pathname === `/board/${p.key}` || pathname.startsWith(`/projects/${p.key}`)) && "bg-muted text-foreground",
              )}
            >
              <span className={cn("size-2 shrink-0 rounded-sm", boardTint(p.key))} />
              <span className="w-10 shrink-0 font-mono text-[11px]">{p.key}</span>
              <span className="truncate">{p.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ footer }: { footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="min-h-0 flex-1">
          <NavLinks />
        </div>
        <div className="border-t p-3">{footer}</div>
      </aside>
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:hidden">
        <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)} aria-label="Open navigation">
          <Menu />
        </Button>
        <span className="font-semibold">Orbit</span>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <NavLinks onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
