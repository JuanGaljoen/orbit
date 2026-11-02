# ORB-3 — Set a project's board colour
Classification: feature (improvement). Orbit ticket: ORB-3.

## Decisions
- `projects.color` is a **nullable** hex string. Null means "no choice made": the board keeps the
  hash-derived tint from `boardTint(key)`. Existing projects are unchanged until a colour is picked.
- Validated in the projects service (the one seam) as `#rrggbb`, lower-cased. `null` clears it.
  The server action and REST callers are untouched, since both already pass through `updateProject`.
- `boardTint` stays a class-name fallback. A new `boardSwatch(project)` returns an inline
  `style` background when a colour is stored, otherwise the fallback class. The two board pages use it.
- Picker lives in the project settings **Details** form: a native `<input type="color">` plus a
  "Use automatic colour" button that sends `null`. No new component library.
- No new REST field in this ticket beyond what `updateProject` already accepts.

## Success criteria (the bar Verify checks)
- [x] 1. Migration adds nullable `projects.color`.
- [x] 2. `updateProject(id, { color })` stores a valid hex (normalised to lower case), clears on `null`, and throws `InvalidError` for anything else (`red`, `#fff`, `#12345g`).
- [x] 3. Project settings has a colour picker and a way to clear it.
- [x] 4. `/board` tiles and the `/board/KEY` header dot use the stored colour, falling back to the hash tint when null.
- [x] 5. `pnpm typecheck`, `lint`, `test` pass.

## Checkpoints
- [x] CP1 — schema + migration + service validation, with tests (criteria 1, 2)
- [x] CP2 — settings picker + board pages use the colour (criteria 3, 4)
