# Orbit — working notes

Personal ticketing/engineering workspace replacing Jira. Single user, deployed on Vercel + Neon.
Specs for work in flight live in `specs/<KEY>.md` (the spec is the source of truth; once Orbit is
running, tickets live in Orbit itself).

@AGENTS.md

## Shape

- **One seam:** all domain logic is in `src/server/services/*` (validated with zod, throw
  `NotFoundError | ConflictError | InvalidError`). Server actions (`src/actions`, via `run()`), the
  REST API (`src/app/api/v1`, via `apiHandler()`) and the AI tools (`src/server/ai/tools.ts`) are
  thin callers. Never query the DB from a page or component.
- **DB:** `getDb()` → Neon Pool when `DATABASE_URL` is Postgres, else embedded PGlite (dev/tests,
  self-migrating). Schema in `src/db/schema.ts`; after edits run `pnpm db:generate`. Prod migrates
  on deploy (`pnpm vercel-build`).
- **Auth:** `requireUser()` in every page/action (the proxy is only the first gate). Production
  without OAuth env refuses everything; dev without it is open.
- **Next 16:** `cacheComponents` is deliberately off; mutations call `refresh()` via `run()`.
  Read `node_modules/next/dist/docs/` before using unfamiliar Next APIs.

## Rules that must not drift

- **GitHub never completes a ticket.** Webhooks/sync create *suggestions* (`status_suggestions`);
  only the user applies them. A merged PR suggests Done "verify acceptance criteria".
- **The in-app assistant never writes directly.** Its only write is `propose_changes` →
  `ai_proposals`, applied by the user after review. The token API (`/api/v1`, the user's own agents)
  has full ticket write by explicit choice — every change logged with actor `api` — but no hard delete.
- **No invented numbers.** Progress = leaf tickets only (parents represented by subtasks), archived
  excluded, unestimated reported not imputed. Risk and recommendations are rule-based with reasons.
- **Secrets only in env**, never in the `settings` table.
- Destructive, bulk and consequential actions go through `useConfirm()`.

## Vocabulary

- **Status category** — `backlog | todo | in_progress | in_review | done`. Statuses are
  user-configurable; logic always keys off the category, never the status name.
- **Leaf ticket** — a ticket with no (non-archived) subtasks. Nesting is one level deep.
- **Blocked** — has a blocker whose status category isn't `done`.
- **Implementation-supported** — done *and* linked to a merged PR or commit.
- **Board** — a project's Kanban (`/board/KEY`). Boards are projects, not a separate entity —
  "Create new board" creates a project. There is deliberately no combined board; the dashboard is
  the cross-project view.

## Testing

`pnpm test` (vitest, services against in-memory PGlite via `setupTestDb()`), `pnpm test:e2e`
(Playwright, the 10-step workflow; GitHub steps need `GITHUB_TOKEN`), `pnpm lint`, `pnpm typecheck`.
