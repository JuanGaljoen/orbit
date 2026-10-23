# Orbit API (v1)

For Claude Code and scripts. Enabled when `ORBIT_API_TOKEN` (≥24 chars) is set.

```bash
export ORBIT=https://<your-orbit-domain>
export ORBIT_API_TOKEN=...
curl -s -H "Authorization: Bearer $ORBIT_API_TOKEN" $ORBIT/api/v1
```

Errors are JSON `{ "error": "…" }` with 400 (invalid, with the valid values), 401 (bad token), 404, 409 (e.g. a dependency cycle), 503 (API disabled).

## Read

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/projects` | Projects with status, target date, repos and leaf-ticket progress |
| GET | `/api/v1/tickets` | Ticket summaries. Query: `project=KEY`, `status=backlog,todo,in_progress,in_review,done`, `q=text-or-key`, `blocked=1`, `limit` (≤500) |
| GET | `/api/v1/tickets/{KEY-12}` | Full ticket: description, acceptance criteria, technical notes, parent/subtasks, blockers/blocking, GitHub links, comments, history, pending suggestions |
| GET | `/api/v1/tickets/{KEY-12}/brief` | `text/markdown` implementation brief (same as the in-app button) |
| GET | `/api/v1/recommendations?project=KEY` | Ranked next tickets with the reasons for each |

## Write

Full read/write for your own agents (start-ticket, file-ticket, ship …). Every change is recorded
in the ticket's history with actor **api**. The one thing the API cannot do is hard-delete — use
`archived: true` (reversible). Names are matched case-insensitively; an unknown name is a 400 that
lists the valid values.

| Method | Path | Body |
|---|---|---|
| POST | `/api/v1/tickets` | `{ project, title, type?, status?, priority?, description?, acceptanceCriteria?, technicalNotes?, dueDate?, estimate?, labels?: [names], milestone?: name, parent?: KEY, blockedBy?: [KEYs] }` → the full ticket |
| PATCH | `/api/v1/tickets/{KEY-12}` | any of the fields above (except project/blockedBy), plus `archived` → the full ticket. `labels` replaces the set. |
| POST / DELETE | `/api/v1/tickets/{KEY-12}/blockers` | `{ "blockedBy": "KEY-7" }` |
| POST | `/api/v1/tickets/{KEY-12}/comments` | `{ "body": "markdown" }` (shown as *Assistant*) |
| GET | `/api/v1/milestones?project=KEY` | milestones with dates and progress |
| POST | `/api/v1/proposals` | `{ title, summary, items[] }` — bigger plans queued for review in Orbit → Assistant |
| GET / PUT | `/api/v1/projects/{KEY}/diagram` | `{ mermaid, commit? }` — replaces the project's architecture diagram (Mermaid source; `commit` = the SHA it was drawn from). Shown on the project's Architecture tab. GET returns `{ mermaid, commit, updatedAt }` |

- `status` accepts a status name (`"In Progress"`) or a category (`backlog`, `todo`, `in_progress`, `in_review`, `done`).
- `type`: `feature | bug | task | improvement | research | documentation`. `priority`: a configured name (`Urgent`, `High`, `Medium`, `Low` by default).

```bash
# file-ticket
curl -s -X POST $ORBIT/api/v1/tickets -H "Authorization: Bearer $ORBIT_API_TOKEN" -H 'content-type: application/json' \
  -d '{"project":"RNG","title":"Handle HEIC uploads","type":"feature","priority":"Low","acceptanceCriteria":"- [ ] HEIC accepted"}'
# start-ticket
curl -s -X PATCH $ORBIT/api/v1/tickets/RNG-28 -H "Authorization: Bearer $ORBIT_API_TOKEN" -H 'content-type: application/json' -d '{"status":"In Progress"}'
```

Proposal `items` use the same format as the in-app assistant
(`src/server/services/proposals.ts` → `proposalItem`): `create_objective`, `create_project`,
`create_milestone`, `create_ticket`, `update_ticket`, `add_dependency`. Items reference each other
by `ref` (e.g. `"t1"`) or existing keys (`"ORB"`, `"ORB-12"`). References are validated when the
proposal is created.

```bash
curl -s -X POST $ORBIT/api/v1/proposals \
  -H "Authorization: Bearer $ORBIT_API_TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Follow-ups from ORB-12","items":[
        {"type":"create_ticket","ref":"t1","project":"ORB","title":"Handle webhook redelivery",
         "ticketType":"bug","priority":"High","acceptanceCriteria":"- [ ] failed deliveries retry",
         "blockedBy":["ORB-12"]}]}'
```

## Adding an MCP server

The API is a thin layer over `src/server/services/*`; an MCP server is the same shape. Either:

- **Remote (simplest):** a small MCP server that maps tools 1:1 onto the endpoints above with the
  bearer token — `get_ticket`, `search_tickets`, `get_brief`, `recommend_next`, `add_comment`,
  `propose_changes`. Keep it to these: every write still goes through the proposal review queue.
- **In-app:** a route handler using `@modelcontextprotocol/sdk` that registers tools calling the
  services directly, behind the same `apiHandler` token check in `src/server/api.ts`.
