"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createTicketAction } from "@/actions/tickets";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TicketForm, useTicketDefaults } from "@/components/tickets/ticket-form";
import { call } from "@/lib/action-client";
import { useApp } from "./app-context";

export function QuickCreate() {
  const { quickCreate, closeQuickCreate, projects } = useApp();
  const router = useRouter();
  const defaults = useTicketDefaults(
    Object.fromEntries(Object.entries(quickCreate ?? {}).filter(([, v]) => v !== undefined)),
  );

  return (
    <Dialog open={!!quickCreate} onOpenChange={(o) => !o && closeQuickCreate()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
        </DialogHeader>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a project first — tickets belong to a project.</p>
        ) : (
          <TicketForm
            key={JSON.stringify(quickCreate)}
            initial={defaults}
            submitLabel="Create ticket"
            lockProject={!!quickCreate?.parentId}
            onCancel={closeQuickCreate}
            onSubmit={async (v) => {
              const t = await call(createTicketAction(v));
              if (!t) return false;
              toast.success(`Created ${t.key}`, {
                action: { label: "Open", onClick: () => router.push(`/tickets/${t.key}`) },
              });
              closeQuickCreate();
              return true;
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
