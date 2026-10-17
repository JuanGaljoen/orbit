# ORBIT-0 — Orbit v1: personal AI-first ticketing & engineering workspace
Classification: feature (greenfield). Replaces Jira for personal work.

## Decisions (from Understand)
- Deployed on **Vercel**; no Docker anywhere.
- **Neon Postgres** in prod via `@neondatabase/serverless`; **PGlite** (in-process Postgres) for
  local dev when `DATABASE_URL` is unset/`pglite:`, and for tests. Same Drizzle schema + migrations.
- **Login with GitHub OAuth**, allowlisted to one username (`AUTH_GITHUB_ALLOWED_LOGIN`). Hand-rolled
  (~100 lines, `jose` signed cookie) — Auth.js v5 is still beta. Fails closed in production if
  unconfigured; bypassed only in `NODE_ENV=development` with no OAuth config.
- **Repo access via fine-grained PAT** (`GITHUB_TOKEN`), one shared `GITHUB_WEBHOOK_SECRET`.
- Built straight through.

## Success criteria (the bar Verify checks)
- [x] 1. Create a project (key e.g. `ORB`, name, description, status, target date; edit/archive/delete).
- [x] 2. Define an objective and a milestone (target dates; milestone dependencies).
- [x] 3. Create tickets (`ORB-12` keys, all 6 types, priority, labels, due, estimate, AC, tech notes,
      markdown) with subtasks and blocker dependencies; comments + activity history.
- [x] 4. Manage tickets on a drag-and-drop Kanban; list view with search/filter/sort + bulk ops
      (bulk + destructive ops confirm). Blocked / overdue / high-priority visually distinct.
- [x] 5. Connect a GitHub repo to a project; manual sync; webhook endpoint verifies signature and is
      idempotent on delivery id; sync status + errors visible.
- [x] 6. Ticket keys in branch names / PR titles / PR bodies / commit messages auto-link; manual
      links too; linked activity shown on tickets and projects. PR/CI events produce *suggested*
      status changes — never auto-complete on merge.
- [x] 7. Roadmap timeline of milestones (+ tickets) with dependencies, overdue/upcoming, progress
      by count and estimate-weighted, no parent/subtask double-counting, progress-over-time series.
- [x] 8. *(tools + streaming route verified; live model answers NOT exercised — no ANTHROPIC_API_KEY locally)* AI assistant answers status questions using tool-retrieved real data, links tickets/PRs,
      separates facts from assumptions. Works only when an AI key is configured.
- [x] 9. AI proposes tickets/projects/milestones from text/objectives (inspecting existing tickets,
      flagging duplicates); proposals are reviewed/edited before apply.
- [x] 10. Dashboard (all from real data) + intelligence (stale, blocked bottlenecks, discrepancies,
      recommended next tasks with reasons) to decide what to work on next.
- [x] 11. Claude Code: copyable implementation brief per ticket; token-authed REST API
      (`/api/v1/...`) documented; service layer shaped so an MCP server is a thin wrapper.
- [x] 12. Global search, ⌘K command palette, keyboard shortcuts, quick-create (`c`).
- [x] 13. Settings: AI provider/model, GitHub, repos, statuses, priorities, labels, preferences,
      integration health.
- [x] 14. Usable with no AI/GitHub credentials; no mock data; README documents setup + env vars.

## Approach
Next.js 16 App Router (TS) · Tailwind v4 + shadcn/ui · Drizzle · zod · Anthropic SDK tool runner
(model/effort in Settings, key in env; Anthropic is the only provider) · dnd-kit · vitest · Playwright.

**Layering — one deep seam.** `src/server/services/*` holds all domain logic, takes validated input
(zod), returns plain data. Server actions (UI), `/api/v1` (Claude Code / future MCP) and AI tools are
all thin callers of the same services. Nothing else touches the DB.

**Data model** (`src/db/schema.ts`): objectives · projects(key, ticket_seq, objective_id) ·
milestones · milestone_deps · statuses(category: backlog|todo|in_progress|in_review|done, configurable)
· priorities(rank, configurable) · labels · tickets(project_id, number, parent_id, milestone_id,
status_id, priority_id, estimate, …, archived_at, completed_at) · ticket_labels · ticket_deps
(ticket blocked_by ticket) · comments · activity (append-only event log; drives history + progress
over time) · repositories · project_repos · gh_branches · gh_commits · gh_pull_requests (incl.
checks state) · ticket_links (branch|commit|pr|file, source auto|manual) · webhook_deliveries
(unique delivery id) · ai_proposals (pending|applied|discarded, editable payload) · settings (kv).

**Contracts**
- Ticket key = `${project.key}-${number}`; number allocated by atomic `UPDATE projects SET
  ticket_seq = ticket_seq + 1 RETURNING`.
- Ticket-key recognition: `/\b([A-Z][A-Z0-9]{1,9})-(\d+)\b/g`, matched only against known
  project keys (case-insensitive in branch names, e.g. `orb-12-fix-x`).
- **Blocked** = has a blocker ticket whose status category ≠ done.
- **Progress** counts *leaf* tickets only (a parent with subtasks contributes its subtasks, not
  itself). Count mode: done/total. Estimate mode: Σ estimate(done)/Σ estimate(all), tickets without
  an estimate reported separately, never imputed. Archived excluded.
- **Status suggestions** from GitHub: PR opened/draft→ suggest In Progress; PR ready for review →
  In Review; PR merged → suggest In Review/Done *as a suggestion only*; CI failing on linked PR →
  flag. Suggestions are shown with evidence and applied only by the user.
- Webhook: HMAC-SHA256 over raw body vs `X-Hub-Signature-256` (timing-safe); insert
  `X-GitHub-Delivery` into webhook_deliveries first — conflict ⇒ 200 no-op.
- AI: read tools (search tickets, project status, milestone risk, GitHub activity, intelligence
  report) + proposal tools that only *write ai_proposals*. Applying a proposal is a user action.

## Tests (seams: services via PGlite, pure functions directly)
- ticket numbering + keys; subtasks; dependencies (no self/cycle); blocked derivation
- progress: count vs estimate, leaf-only (no double-count), archived excluded
- ticket-key extraction from branch/PR/commit text
- webhook signature verify + duplicate delivery idempotency; PR event → links + suggestion
- intelligence: stale in-progress, discrepancy (merged PR but ticket Todo), recommendations ordering
- proposal apply creates entities; discard doesn't
- e2e smoke (Playwright) over the 10-step completion workflow

## Risks
1. Scope — huge surface; keep each UI page lean and service-backed, no speculative options.
2. Next 16 / AI SDK 7 / zod 4 APIs newer than habit — read bundled docs before using.
3. Serverless + PGlite/Neon driver differences (transactions) — single `db` module, transactions
   only through the Neon `Pool` driver which supports them.

## Checkpoints
- [x] CP1 — scaffold, schema, migrations, db client, auth, app shell/sidebar
- [x] CP2 — projects, objectives, milestones, tickets services + UI (list, detail, board, quick-create)
- [x] CP3 — progress, roadmap, dashboard, activity, search + command palette
- [x] CP4 — GitHub: repos, sync, webhooks, linking, suggestions
- [x] CP5 — AI: provider settings, assistant, proposals, intelligence
- [x] CP6 — Claude Code brief, `/api/v1`, settings/health, README, e2e workflow

## Verification (2026-10-17)
- `pnpm typecheck`, `pnpm lint`, `pnpm build` clean.
- vitest: 37 tests (tickets, progress, GitHub ingest/webhooks, intelligence, proposals, AI tools).
- Playwright: 10/10 — the full completion workflow, incl. a real read-only GitHub connect + sync of
  JuanGaljoen/orbit and signed/duplicate/forged webhook deliveries.
- Not verified: live Claude responses (no API key here); Neon + Vercel deploy (not yet created);
  real GitHub OAuth login (needs the OAuth app).
