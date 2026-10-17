"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Terminal } from "lucide-react";
import { briefAction } from "@/actions/brief";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { call } from "@/lib/action-client";

/** Shows the Claude Code implementation brief for review, then copies it. */
export function BriefButton({ ticketKey }: { ticketKey: string }) {
  const [brief, setBrief] = useState<string | null>(null);

  return (
    <>
      <Button
        size="xs"
        variant="outline"
        onClick={async () => {
          const b = await call(briefAction(ticketKey));
          if (b) setBrief(b);
        }}
      >
        <Terminal /> Implementation brief
      </Button>
      <Dialog open={brief != null} onOpenChange={(o) => !o && setBrief(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Implementation brief — {ticketKey}</DialogTitle>
            <DialogDescription>Paste into Claude Code. Built only from this ticket&apos;s real data.</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{brief}</pre>
          <div className="flex justify-end">
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(brief ?? "");
                toast.success("Brief copied");
              }}
            >
              <Copy /> Copy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
