# Browser Agent (kajkor-browser-agent)

Chrome MV3 extension + Node/Express backend (`backend/server.js`, fixed port
**34730**) + remote MongoDB (shared). Tasks are plan-and-execute: a local Ollama
model plans JSON phases, the extension runs each phase as a deterministic
browser tool. A chat-first Electron desktop app (`desktop-app/`) is the main UI;
it reuses this backend in dev and embeds it (same port 34730) when packaged.

## Layout
- `backend/server.js` — API: tasks + planning, schemas, skills (v2 = element refs), elements, prompts, Ollama proxy
- `extension/background.js` — task orchestrator; tool implementations (names MUST match `TOOL_CATALOG` in server.js)
- `extension/content.js` — in-page tools (scroll / collect / scan / click / type / skill runtime)
- `extension/learn.js` — learning overlay (1 · Introduce elements → 2 · Compose skills)
- `extension/popup|dashboard|skills` — UI pages
- `docs/skill-redesign-plan.md` — elements/skills-v2 design and status

## Conventions — do not break

### RETRY RULE (applies to every current AND future tool)
Elements on stepped forms/dialogs render late; a first-miss is NOT a failure.
- **content.js:** any code that locates a page element MUST resolve it through
  `withBackoff(find)` (exponential backoff 1s, 2s, 4s, 8s — 4 retries). Never
  call `findTarget` / `findField` / `resolveOne` bare in a new tool.
- **background.js:** `executeLoop` retries a failed phase with the same backoff
  when the error matches its `TRANSIENT` regex. When adding a tool, phrase its
  "nothing happened yet" errors to match (include "not found" / "no element" /
  "no field" / "did not open") so retries apply automatically.
- Only retry when nothing has been acted on yet (a lookup miss). NEVER retry
  after a side effect fired (click/type already happened) — that double-posts.

### Other invariants
- Task fields the extension PATCHes must be whitelisted in `PATCHABLE`
  (server.js) or updates are silently dropped (symptom: task repeats phases
  and re-does actions).
- v2 skills store element REFERENCES; selectors live on `elements` docs.
  The extension always fetches skills with `?resolve=1` (hydrates to the
  legacy runtime shape). Repointing an element heals every skill using it.
- Route patterns: bare host ≡ `/*` (any path on host), `/` = root page only,
  `[slug]` = one path segment, `*` = anything.
- Typing into contenteditables goes through `insertIntoLexical` (clear → one
  method → verify). Never insert AND dispatch a synthetic input event — Lexical
  processes both and duplicates the text.
- Re-running a task reuses its stored plan (`POST /tasks/:id/rerun`); only an
  extra instruction triggers replanning. Auto-created schemas are reused by
  name so repeated runs accumulate into one collection.

## Testing
- The user runs the backend on port 34730 — do NOT restart or kill it. For API
  tests boot a second instance (`PORT=4010 node backend/server.js`), clean up
  any test documents (Mongo is the real shared DB), and SHUT THE INSTANCE DOWN
  when done.
- `node --check <file>` every changed JS file before finishing.
