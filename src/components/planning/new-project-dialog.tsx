"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { createProjectAction } from "@/actions/planning";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { call } from "@/lib/action-client";
import { ProjectForm } from "./project-form";

/**
 * Opened via the button or `?new=1` (command palette). `tileClassName` renders the trigger as a
 * board-gallery tile instead of a button; `goTo` picks where a new project lands.
 */
export function NewProjectDialog({
  objectives,
  tileClassName,
  goTo = "project",
}: {
  objectives: { id: string; title: string }[];
  tileClassName?: string;
  goTo?: "project" | "board";
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const open = params.get("new") === "1";
  const setOpen = (o: boolean) => router.replace(o ? `${pathname}?new=1` : pathname);

  return (
    <>
      {tileClassName ? (
        <button type="button" onClick={() => setOpen(true)} className={tileClassName}>
          <Plus className="size-4" />
          Create new board
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> New project
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <ProjectForm
            objectives={objectives}
            onCancel={() => setOpen(false)}
            onSubmit={async (v) => {
              const p = await call(createProjectAction(v), "Project created");
              if (p) router.push(goTo === "board" ? `/board/${p.key}` : `/projects/${p.key}`);
              return !!p;
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
