"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp } from "./app-context";
import { NAV } from "./nav";

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** ⌘K palette · c new ticket · g+key navigation · ? help. */
export function Shortcuts() {
  const router = useRouter();
  const { setPaletteOpen, paletteOpen, openQuickCreate } = useApp();
  const [help, setHelp] = useState(false);
  const chord = useRef<number>(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      if (document.querySelector("[role=dialog]")) return;

      if (Date.now() - chord.current < 1000) {
        chord.current = 0;
        const target = NAV.find((n) => n.shortcut === e.key.toLowerCase());
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (e.key === "g") chord.current = Date.now();
      else if (e.key === "c") {
        e.preventDefault();
        openQuickCreate();
      } else if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "?") setHelp(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, setPaletteOpen, paletteOpen, openQuickCreate]);

  return (
    <Dialog open={help} onOpenChange={setHelp}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          <Key k="⌘ K" /> <dd>Command palette / search</dd>
          <Key k="/" /> <dd>Search</dd>
          <Key k="C" /> <dd>New ticket</dd>
          {NAV.map((n) => (
            <div key={n.href} className="contents">
              <Key k={`G ${n.shortcut.toUpperCase()}`} /> <dd>{n.label}</dd>
            </div>
          ))}
          <Key k="⌘ ↵" /> <dd>Save form</dd>
          <Key k="?" /> <dd>This help</dd>
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function Key({ k }: { k: string }) {
  return <dt className="font-mono text-xs text-muted-foreground">{k}</dt>;
}
