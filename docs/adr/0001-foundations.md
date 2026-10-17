# 0001 — Foundations: data layer, auth, AI provider

Date: 2026-10-17 · Status: accepted

**PGlite locally, Neon in production, one Drizzle schema.** No Docker anywhere (requirement). PGlite
is real Postgres in-process, so dev and tests run the same SQL and migrations as Neon. Cost: two
drivers behind `getDb()`, typed as the Neon flavour. If they ever diverge in behaviour (e.g.
transactions), test against a Neon branch.

**Hand-rolled GitHub OAuth for one allowlisted user.** Auth.js v5 was still beta on Next 16; the
need is tiny (one user, one provider, JWT cookie via `jose`). Fails closed in production when
unconfigured. Revisit only if a second user ever appears (it shouldn't — not a SaaS).

**Anthropic SDK only, no multi-provider layer.** The spec asked for a configurable provider; the
configurable part is model + effort. A provider abstraction would be speculative surface area.
Adding one later means swapping `src/server/ai/client.ts` + the tool runner call.

**Suggestions, never automation.** GitHub events and the AI both write to review queues
(`status_suggestions`, `ai_proposals`); only the user changes ticket state. Keeps "merged ≠ done"
and "AI proposes, human disposes" structural rather than a matter of prompt discipline.
