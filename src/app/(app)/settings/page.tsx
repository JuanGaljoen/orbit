import Link from "next/link";
import { PageBody, PageHeader, Section } from "@/components/page";
import { AiSettingsForm, PreferencesForm } from "@/components/settings/settings-forms";
import { LabelEditor, PriorityEditor, StatusEditor } from "@/components/settings/vocab-editor";
import { cn } from "@/lib/utils";
import { isPglite } from "@/db";
import { requireUser } from "@/server/auth";
import { authMode } from "@/server/auth/session";
import { aiConfigured } from "@/server/ai/client";
import { integrationHealth } from "@/server/services/github";
import { AI_MODELS, getSetting } from "@/server/services/settings";

export const metadata = { title: "Settings" };

function Health({ ok, label, detail }: { ok: boolean | "warn"; label: string; detail: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", ok === true ? "bg-emerald-500" : ok === "warn" ? "bg-amber-500" : "bg-red-500")} />
      <span>
        <span className="font-medium">{label}</span> <span className="text-muted-foreground">— {detail}</span>
      </span>
    </li>
  );
}

export default async function SettingsPage() {
  await requireUser();
  const [ai, prefs, health] = await Promise.all([getSetting("ai"), getSetting("preferences"), integrationHealth()]);
  const mode = authMode();
  const repoErrors = health.repos.filter((r) => r.syncStatus === "error");

  return (
    <>
      <PageHeader title="Settings" description="Credentials live in environment variables, never in the database." />
      <PageBody className="max-w-4xl space-y-10">
        <Section title="Integration health">
          <ul className="space-y-2 rounded-lg border p-4">
            <Health
              ok={mode === "github" ? true : mode === "open" ? "warn" : false}
              label="Authentication"
              detail={
                mode === "github"
                  ? `GitHub sign-in, restricted to ${process.env.AUTH_GITHUB_ALLOWED_LOGIN}`
                  : mode === "open"
                    ? "Open (development only, OAuth not configured). Never deploy like this — production refuses all access."
                    : "Misconfigured — production without OAuth refuses all access"
              }
            />
            <Health ok={isPglite() ? "warn" : true} label="Database" detail={isPglite() ? "Embedded PGlite (local development)" : "Postgres (DATABASE_URL)"} />
            <Health ok={health.githubConfigured} label="GitHub API" detail={health.githubConfigured ? "GITHUB_TOKEN set" : "GITHUB_TOKEN not set — repositories can't be connected or synced"} />
            <Health
              ok={health.webhookConfigured ? (health.failedDeliveries.length ? "warn" : true) : "warn"}
              label="GitHub webhooks"
              detail={
                health.webhookConfigured
                  ? health.failedDeliveries.length
                    ? `${health.failedDeliveries.length} failed deliveries — see the GitHub page`
                    : "Secret set"
                  : "GITHUB_WEBHOOK_SECRET not set — use manual sync"
              }
            />
            <Health
              ok={repoErrors.length ? false : true}
              label="Repository sync"
              detail={
                repoErrors.length ? (
                  <>
                    {repoErrors.map((r) => `${r.fullName}: ${r.syncError}`).join("; ")} (<Link href="/github" className="underline">GitHub</Link>)
                  </>
                ) : (
                  `${health.repos.length} repositor${health.repos.length === 1 ? "y" : "ies"} connected, no errors`
                )
              }
            />
            <Health ok={aiConfigured() ? true : "warn"} label="AI" detail={aiConfigured() ? "ANTHROPIC_API_KEY set" : "ANTHROPIC_API_KEY not set — assistant disabled"} />
            <Health
              ok={(process.env.ORBIT_API_TOKEN?.length ?? 0) >= 24 ? true : "warn"}
              label="API for Claude Code"
              detail={
                (process.env.ORBIT_API_TOKEN?.length ?? 0) >= 24 ? (
                  <>
                    ORBIT_API_TOKEN set — see <a href="/api/v1" className="underline">/api/v1</a> and docs/api.md
                  </>
                ) : (
                  "ORBIT_API_TOKEN not set (min 24 chars) — /api/v1 is disabled"
                )
              }
            />
          </ul>
        </Section>

        <Section title="AI assistant">
          <AiSettingsForm initial={ai} models={AI_MODELS} />
        </Section>

        <Section title="Preferences">
          <PreferencesForm initial={prefs} />
        </Section>

        <Section title="Statuses">
          <StatusEditor />
        </Section>

        <div className="grid gap-10 md:grid-cols-2">
          <Section title="Priorities">
            <PriorityEditor />
          </Section>
          <Section title="Labels">
            <LabelEditor />
          </Section>
        </div>

        <Section title="GitHub repositories">
          <p className="text-sm text-muted-foreground">
            Connect and sync repositories on the <Link href="/github" className="underline">GitHub</Link> page; link them to projects in each
            project&apos;s settings tab.
          </p>
        </Section>
      </PageBody>
    </>
  );
}
