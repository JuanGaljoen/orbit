import { LogOut } from "lucide-react";
import { AppProvider } from "@/components/app/app-context";
import { CommandPalette } from "@/components/app/command-palette";
import { QuickCreate } from "@/components/app/quick-create";
import { Shortcuts } from "@/components/app/shortcuts";
import { Sidebar } from "@/components/app/sidebar";
import { requireUser } from "@/server/auth";
import { listMilestones } from "@/server/services/milestones";
import { listProjects } from "@/server/services/projects";
import { getSetting } from "@/server/services/settings";
import { listLabels, listPriorities, listStatuses } from "@/server/services/vocab";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireUser();
  const [projects, milestones, statuses, priorities, labels, prefs] = await Promise.all([
    listProjects(),
    listMilestones(),
    listStatuses(),
    listPriorities(),
    listLabels(),
    getSetting("preferences"),
  ]);

  return (
    <AppProvider
      vocab={{
        projects: projects.map(({ id, key, name }) => ({ id, key, name })),
        milestones: milestones.map(({ id, projectId, name, completedAt }) => ({ id, projectId, name, completedAt })),
        statuses,
        priorities,
        labels,
        defaultProjectId: projects.find((p) => p.key === prefs.defaultProjectKey)?.id ?? null,
      }}
    >
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar
          footer={
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {session.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.avatarUrl} alt="" className="size-6 rounded-full" />
              ) : (
                <span className="size-6 rounded-full bg-muted" />
              )}
              <span className="truncate">{session.login}</span>
              {session.login !== "local" && (
                // eslint-disable-next-line @next/next/no-html-link-for-pages -- API route needs a full navigation
                <a href="/api/auth/logout" className="ml-auto hover:text-foreground" aria-label="Sign out">
                  <LogOut className="size-4" />
                </a>
              )}
            </div>
          }
        />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <QuickCreate />
      <CommandPalette />
      <Shortcuts />
    </AppProvider>
  );
}
