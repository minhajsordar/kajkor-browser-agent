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
- `PROJECT_MEMORY.md` — what exists, what was decided and why (read first)
- `plans/` — plans for work not yet finished (see below)

## PLANS — write them down before building
Any plan for a feature or a non-trivial change goes in `plans/`, as a markdown
file, BEFORE writing code. The user reads these to decide what to build; a plan
that lives only in a chat reply is lost as soon as the session ends.

- Folders are the plan's state — **move the file** as work progresses:
  - `plans/not-started/` — agreed or proposed, nothing built yet
  - `plans/partially-done/` — started; record what is done vs. left
  - `plans/done/` — finished (keep it: it explains why things are as they are)
- One file per plan, named for the feature: `feedback-learning.md`.
- Start with a `**Status:**` line and a short **Why** — the problem it solves,
  with the concrete failures that motivated it.
- Cover: the approach and the ALTERNATIVES rejected (with reasons), the hard
  parts, phases, and any open question needing the user's decision.
- When a plan is partially built, update the file in the SAME change — a plan
  that no longer matches the code is worse than no plan.
- Keep older `docs/*-plan.md` where they are; new plans go in `plans/`.

## PROJECT MEMORY — read at start, update at end
`PROJECT_MEMORY.md` is this project's long-term memory. Context is lost between
sessions; that file is what survives.

- **Read it before planning any work.** It records capabilities that already
  exist, decisions and their reasons, and gotchas that cost real debugging time.
  Check it before "adding" something — it may already be there.
- **Update it in the SAME change** whenever you add a feature, change
  behaviour, or discover a non-obvious constraint. Not a separate follow-up
  task — an unrecorded change is a change that gets re-litigated or undone.
- Record it when: a capability is added or removed; a decision is made that a
  future reader would otherwise second-guess ("why is it done this way?"); a
  bug's ROOT CAUSE turns out to be surprising; an invariant is discovered.
  Add genuinely load-bearing invariants to "Conventions" below as well.
- Write the **reason**, not just the change — "X, because Y broke when Z".
  Newest entries first, dated. Keep entries short; delete ones that go stale.
- Do NOT log routine work: refactors with no behaviour change, typo fixes, or
  anything already obvious from the code or git history.

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

### FLEX + CLAMPED TEXT ALWAYS NEEDS `min-width: 0` (desktop-app)
A flex child defaults to `min-width: auto`, so it refuses to shrink below its
content. Any flex child that clamps user-supplied text — `.ellipsis`
(`white-space: nowrap`), `-webkit-line-clamp`, or a `.col` holding a goal/label
— MUST set `min-width: 0`, or long text silently widens its ancestor.
Symptom is not always a scrollbar: a centred child (`margin: 0 auto`) inside the
over-wide parent slides off-screen and the pane looks **completely empty**.
Cost real debugging twice (sidebar sideways scroll; blank chat transcript).

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
