import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSession } from "@/server/auth";
import { authMode } from "@/server/auth/session";

const ERRORS: Record<string, string> = {
  not_allowed: "That GitHub account isn't allowed to sign in to this Orbit.",
  state_mismatch: "Sign-in expired or was tampered with. Try again.",
  token_exchange_failed: "GitHub didn't accept the sign-in. Check AUTH_GITHUB_ID / AUTH_GITHUB_SECRET.",
  oauth_not_configured: "GitHub sign-in isn't configured.",
  misconfigured:
    "Orbit is running in production without auth configured, so it refuses all access. Set AUTH_SECRET, AUTH_GITHUB_ID, AUTH_GITHUB_SECRET and AUTH_GITHUB_ALLOWED_LOGIN.",
};

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;
  const mode = authMode();
  // A stale "misconfigured" from an earlier redirect is noise once auth is actually set up.
  const code = typeof error === "string" && !(error === "misconfigured" && mode !== "misconfigured") ? error : null;
  const message = code ? (ERRORS[code] ?? code) : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="inline-block size-2.5 rounded-full bg-sky-400" /> Orbit
          </div>
          <p className="text-sm text-muted-foreground">Personal ticketing & engineering workspace.</p>
        </div>
        {message && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {message}
          </p>
        )}
        {mode === "github" ? (
          <Button asChild className="w-full">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route needs a full navigation */}
            <a href="/api/auth/login">Sign in with GitHub</a>
          </Button>
        ) : (
          !message && <p className="text-sm text-muted-foreground">{ERRORS.misconfigured}</p>
        )}
      </div>
    </main>
  );
}
