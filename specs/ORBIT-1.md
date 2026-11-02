# ORBIT-1 — Replace the Mermaid Architecture tab with the Floorplan screen
Classification: feature (replacement). No Orbit ticket filed (no Orbit-project exists in the tracker); this spec is the record.

## Decisions (from Understand)
- The Architecture tab keeps its name and position; its content becomes the **Floorplan** viewer
  (MIT, Hayden Smith, v0.6.2) in a same-origin `<iframe>`. The iframe is deliberate — the viewer is
  not rebuilt in React.
- **Mermaid is removed outright**: dependency, `MermaidDiagram`, view dropdown, CSS, REST route,
  service functions, schema columns, tests. No fallback, no compatibility endpoint.
- **Data loss is intended:** the migration drops `projects.diagram`, `diagram_commit`,
  `diagram_updated_at`, deleting every stored Mermaid diagram. Old migrations are not edited.
- `project.diagram_updated` stays renderable for old activity rows (`activity.kind` is free text and
  the feed renders the stored summary); nothing new emits it.
- The API accepts **graph JSON only**, never HTML. The viewer HTML is assembled server-side from a
  vendored template and the stored graph.
- Size cap is **4 MB** (not 5): Vercel function request bodies are limited to 4.5 MB, so a larger
  cap could never be reached.
- Viewer runs in its **static mode** (Orbit never sets `window.FLOORPLAN_SERVER`, which only
  Floorplan's own `serve.mjs` injects). Its `/api/*` calls are all guarded by that flag.
- "Ask" through Orbit's own assistant is a **later ticket**, not built here. The Ask bar is hidden.

## Success criteria (the bar Verify checks)
- [x] 1. Migration drops the 3 diagram columns and adds `floorplan` (jsonb), `floorplan_commit`, `floorplan_updated_at`.
- [x] 2. `getProjectFloorplan` / `setProjectFloorplan(key, {commit?, graph}, "api")`: replaces whole graph, logs `project.floorplan_updated`, 422 (InvalidError → route) naming: non-object graph, `schema` not starting `floorplan/graph`, `nodes`/`files`/`links` not arrays, > 4 MB, bad commit.
- [x] 3. `GET/PUT /api/v1/projects/{KEY}/floorplan` via `apiHandler`; PUT 422s on invalid; GET returns `{commit, updatedAt, graph}`.
- [x] 4. `/projects/[key]/floorplan.html` — requires a session, returns viewer HTML with the graph injected (escaped for `<script>`), `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`, no caching; 404 with no graph.
- [x] 5. Viewer assets vendored with LICENSE + copyright; nothing fetched at runtime. Cloud promo removed, Ask bar hidden.
- [x] 6. Architecture tab: full-height iframe, "Drawn from <sha> · updated <ago>", empty state with the PUT command.
- [x] 7. No `mermaid` dependency; no leftover "diagram"/"mermaid" references outside old migrations and the legacy activity kind.
- [x] 8. `pnpm typecheck`, `lint`, `test` pass; e2e PUTs the sample graph and sees the viewer render in the tab.
- [x] 9. Report: what the viewer does without its `/api` routes.

## Design
- `src/vendor/floorplan/` — `LICENSE` (+ `README.md` provenance), `assets/` (viewer.html, graph-query.js, ui/*.js minus `50-cloud.js`, vendor/ elk + fonts + their licences, logo/favicon).
- `scripts/build-floorplan-template.mjs` — pre-assembles those into `src/vendor/floorplan/template.generated.ts` (one string, exactly one `/*__FLOORPLAN_DATA__*/null` and one `__FLOORPLAN_TITLE__` left), mirroring Floorplan's `build.mjs` `page()`, and appends a style hiding `#ask`. Bundled by import — no `fs` at runtime, so Vercel tracing can't miss it.
- `src/server/floorplan/page.ts` — `renderFloorplanPage(graph, title)`: pure; escapes `</script`, U+2028/9; HTML-escapes the title.
- Services: `projects.ts` gains the floorplan pair (same shape as the diagram pair it replaces).

## Out of scope
Ask via Orbit's assistant; editing viewer logic; lorekeep `diagram` skill switch-over (separate repo).

## Outcome
Landed on `feat/floorplan-architecture`. `pnpm typecheck`, `lint`, `test` (52) and the full e2e pass; no `mermaid` dependency.
**The migration `0003` deletes every stored Mermaid diagram (intended).**

What the viewer does without its `/api` routes (Orbit never sets `window.FLOORPLAN_SERVER`, which gates every call):
- `/api/flows`, `/api/health/dismissed`, `/api/plan/undo`, `/api/cancel`, `/api/events`, `/api/cloud/*`: **never called.** Custom flows and dismissed health issues fall back to the browser's `localStorage` (per-browser, not synced).
- `/api/export`: the Export control doesn't mount outside `serve.mjs`/`file:`.
- `/api/ask`: the Ask bar is hidden; with no engine it would only read "Asking is unavailable". Ask via Orbit's assistant is a later ticket.
- e2e clicks every header control and asserts zero page errors and zero failed non-`/api/v1` requests.
Notes: the viewer follows the browser's colour scheme with its own theme toggle, not Orbit's theme. `graph.meta.root` (an absolute local path) is stored as pushed — the skill should null it.
