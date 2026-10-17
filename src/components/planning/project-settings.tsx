"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { archiveProjectAction, deleteProjectAction, setProjectReposAction, updateProjectAction } from "@/actions/planning";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { call } from "@/lib/action-client";
import type { Project } from "@/server/services/projects";
import { ProjectForm } from "./project-form";

export function ProjectSettings({
  project,
  objectives,
  repos,
  linkedRepoIds,
}: {
  project: Project;
  objectives: { id: string; title: string }[];
  repos: { id: string; fullName: string }[];
  linkedRepoIds: string[];
}) {
  const router = useRouter();
  const [confirmKey, setConfirmKey] = useState("");
  const [linked, setLinked] = useState(new Set(linkedRepoIds));

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Details</h2>
        <ProjectForm
          isEdit
          initial={project}
          objectives={objectives}
          onSubmit={async (v) => {
            const { key: _key, ...rest } = v;
            return !!(await call(updateProjectAction(project.id, rest), "Project saved"));
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">GitHub repositories</h2>
        {repos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No repositories connected yet. Connect them on the <a href="/github" className="underline">GitHub</a> page.
          </p>
        ) : (
          <>
            <div className="space-y-1">
              {repos.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={linked.has(r.id)}
                    onChange={(e) => {
                      const next = new Set(linked);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      setLinked(next);
                    }}
                  />
                  <span className="font-mono text-xs">{r.fullName}</span>
                </label>
              ))}
            </div>
            <Button size="sm" variant="outline" onClick={() => call(setProjectReposAction(project.id, [...linked]), "Repositories updated")}>
              Save repositories
            </Button>
          </>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-destructive/30 p-4">
        <h2 className="text-sm font-medium">Danger zone</h2>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={() => call(archiveProjectAction(project.id, !project.archivedAt), project.archivedAt ? "Restored" : "Archived")}
          >
            {project.archivedAt ? "Restore project" : "Archive project"}
          </Button>
          <span className="text-xs text-muted-foreground">Archived projects are hidden but keep all data.</span>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Deleting removes every ticket, milestone, comment and link in this project. Type <span className="font-mono">{project.key}</span> to confirm.
          </p>
          <div className="flex gap-2">
            <Input value={confirmKey} onChange={(e) => setConfirmKey(e.target.value)} className="h-8 w-32 font-mono" aria-label="Type project key to confirm" />
            <Button
              size="sm"
              variant="destructive"
              disabled={confirmKey !== project.key}
              onClick={async () => {
                if ((await call(deleteProjectAction(project.id), `Deleted ${project.key}`)) !== null) router.push("/projects");
              }}
            >
              Delete project
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
