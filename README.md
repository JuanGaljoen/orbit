# Orbit

Personal, AI-first ticketing and engineering workspace: projects, objectives, milestones and
tickets; a Kanban board and roadmap; GitHub integration; an assistant that answers from real data
and proposes work for you to review. Replaces Jira for personal work. Single user, not a SaaS.

Stack: Next.js 16 (App Router) · TypeScript · Drizzle ORM on Neon Postgres (PGlite locally) ·
GitHub OAuth (single allowlisted user) · Anthropic SDK · Tailwind v4 + shadcn/ui · Vercel.

## Run locally (no Docker, no setup)

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

With no `DATABASE_URL`, Orbit uses embedded Postgres (PGlite) in `.data/pglite`, migrated
automatically on first request. With no OAuth configured, dev mode skips login. GitHub and AI
features show how to enable them and the rest of the app works without them.

To develop against real Postgres, create a Neon **dev branch** and set `DATABASE_URL` in
`.env.local`, then `pnpm db:migrate`.

## Environment variables

Put these in `.env.local` (local) or the Vercel project settings (production). Only the auth
group is required in production — without it Orbit refuses all access (fails closed).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | prod | Neon Postgres connection string. Unset or `pglite:<dir>` → embedded PGlite. |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | prod | GitHub OAuth app (Settings → Developer settings → OAuth Apps). Callback URL: `<APP_URL>/api/auth/callback`. |
| `AUTH_GITHUB_ALLOWED_LOGIN` | prod | The one GitHub username allowed to sign in. |
| `AUTH_SECRET` | prod | Session signing key, ≥32 chars (`openssl rand -base64 48`). |
| `APP_URL` | prod | Public base URL, no trailing slash (OAuth redirects, webhook instructions). |
| `GITHUB_TOKEN` | optional | Fine-grained PAT, **read-only**: Metadata, Contents, Pull requests, Checks, Commit statuses — on the repos Orbit should see. |
| `GITHUB_WEBHOOK_SECRET` | optional | Shared secret for repository webhooks (`openssl rand -hex 32`). |
| `ANTHROPIC_API_KEY` | optional | Enables the assistant. Model and effort are set in Settings. |
| `ORBIT_API_TOKEN` | optional | Bearer token (≥24 chars) for `/api/v1` (Claude Code, scripts). Unset = API disabled. |
| `ORBIT_TIMEZONE` | optional | IANA zone for "today"/due/overdue, e.g. `Africa/Johannesburg`. Default `UTC`. |

Credentials only ever live in the environment — the database stores no secrets.

## Deploy (Vercel + Neon)

1. Create a Neon project (or add Neon from the Vercel Marketplace, which sets `DATABASE_URL`).
2. Create a GitHub OAuth app with callback `https://<your-domain>/api/auth/callback`.
3. Import the repo into Vercel, set the env vars above.
4. Build command: `pnpm vercel-build` (runs `pnpm db:migrate` then `next build`, so schema
   changes deploy with the code).
5. Optional: for each repo, add a webhook → `https://<your-domain>/api/github/webhook`, content type
   `application/json`, your `GITHUB_WEBHOOK_SECRET`, events: *Pull requests, Pushes, Branch or tag
   creation, Branch or tag deletion, Check runs, Check suites, Statuses*. Without webhooks, use
   **Sync now** on the GitHub page.

## Workflow

1. **Projects** → *New project* (key like `ORB` gives ticket IDs `ORB-1`, `ORB-2`, …).
2. **Objectives** → define the outcome; link projects to it. Add **milestones** with target dates
   on the project's *Milestones* tab.
3. Create tickets anywhere with **C**; add subtasks, blockers, labels, estimates, acceptance criteria.
4. Work them on the **Board** (drag between columns) or the **Tickets** list (filter, sort, bulk edit).
5. **GitHub** → connect a repo, link it to the project (project → *Settings*).
6. Put the ticket key in branch names, PR titles/bodies or commit messages — Orbit links them and
   *suggests* status changes. A merged PR never completes a ticket on its own.
7. **Roadmap** shows milestones over time with progress and dependencies.
8. **Assistant** answers status questions from live data and drafts tickets as proposals.
9. Review proposals (edit, remove items) → *Apply*.
10. **Dashboard** / **Insights** → decide what to work on next (every recommendation shows why).

Keyboard: `⌘K` palette · `/` search · `C` new ticket · `G` then `D/T/B/P/O/R/I/A/G/S` to navigate ·
`?` help · `⌘↵` save forms.

## How the numbers are computed

- **Progress** counts *leaf* tickets only: a ticket with subtasks is represented by its subtasks,
  so nothing is double-counted. Archived tickets are excluded. Estimate-weighted progress uses only
  estimated leaves and reports how many are unestimated — nothing is imputed.
- **Progress over time** (burn-up) is rebuilt from the activity log's status transitions.
- **Blocked** = has a blocker that isn't in a *done*-category status.
- **Recommendations** are a transparent score (in review/progress, priority, due date, how much work
  it unblocks, milestone at risk, failing CI); each one lists its reasons. Blocked tickets are excluded.
- **Milestone risk** is rule-based and stated as facts (overdue, due soon with most work open, blocked
  tickets, incomplete dependencies). No forecasting.
- **Planned / tracked / implementation-supported**: leaf tickets in scope / marked done / done *and*
  linked to a merged PR or commit.

## Claude Code

- Every ticket has an **Implementation brief** button: a markdown brief with description, acceptance
  criteria, dependencies, repo context and linked code.
- `/api/v1` gives the same programmatically — see [docs/api.md](docs/api.md). Writes are limited to
  comments and proposals (queued for your review), so repository and ticket changes stay in your hands.

## Development

```bash
pnpm test           # vitest — services against in-memory Postgres
pnpm test:e2e       # playwright — the full workflow in a browser
pnpm lint && pnpm typecheck
pnpm db:generate    # after editing src/db/schema.ts → new migration in drizzle/
pnpm import:tickets export.json   # bulk import keeping keys + dates (format: src/server/services/import.ts)
```

Architecture: all domain logic lives in `src/server/services/*` behind validated inputs. Server
actions (`src/actions`), the REST API (`src/app/api/v1`) and the assistant's tools
(`src/server/ai/tools.ts`) are thin callers of the same services.
