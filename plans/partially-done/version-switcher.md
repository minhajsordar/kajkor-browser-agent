# Version switcher — keep both attempts of a round, flip with `< 1/2 >`

**Status:** built (2026-07-22) — backend verified (18-case :4010 run), renderer
compiles clean (279 modules), live click-through unverified. Supersedes the
"Run again = append below" model from `plans/done/regenerate-response.md`.

## Why

"Run again" today re-sends the last instruction as a NEW turn, so a regenerated
answer appears as a *second* prompt+response below the first. The user wants the
ChatGPT-style behaviour instead: regenerate **in place**, keep every attempt, and
switch between them with a `< 1/2 >` control on the round. Reasons: the transcript
stays clean (one slot per question), and you can compare attempts and keep the one
you like instead of scrolling past dead ones.

## Decisions (user, 2026-07-22)

1. **In-place versions REPLACE append-below.** Regenerating the last round keeps
   both attempts in the SAME slot; a `< n/m >` control flips between them. The
   current `sessions.regenerate()` (re-send via `sendChat`) is removed.
2. **Persist on the backend.** Variants live on the task doc in Mongo and survive
   reload; the backend is authoritative. (Rejected client-only: the switcher would
   vanish on refresh and couldn't be trusted after a browse round finished async.)

## The core problem — browse rounds finish ASYNCHRONOUSLY

An **answer / list_tabs / host-propose** round is synchronous: `runChatTurn`
produces the response before it returns, so the round is complete and snapshottable
immediately. A **browse** round is NOT — `runChatTurn` only kicks off planning;
the extension executes phases over 30s polls and keeps appending events to round R
for minutes. So "snapshot the new attempt when regenerate returns" would freeze an
empty/half-done round.

**Resolution — the newest attempt is always the LIVE flat arrays; older attempts
are frozen archives.** We never copy a live round into a fixed variant. Instead:

- `task.chat` / `task.events` (the existing flat, round-stamped arrays) always hold
  the **current (newest) attempt** of every round — untouched by this feature, so
  `executeLoop`, feedback, compaction, and the extension keep working unchanged.
- `task.variants[R]` holds the FROZEN previous attempts of round R:
  ```
  task.variants = {
    "<R>": {
      archived: [ { chat:[…roundR msgs…], events:[…roundR events…], at, acted:bool }, … ],
      viewIndex: <int>   // which attempt is currently SHOWN (persisted selection)
    }
  }
  ```
  Total versions = `archived.length + 1`. Index `archived.length` = the live one.

## Approach

### Backend — `POST /tasks/:id/regenerate` (re-introduced, versioned)

`R = task.round`. Any last round (R ≥ 0) regenerates; no "acted" gate (a manual
click is a deliberate "do it again" — matches the done plan's decision 2).

1. **Freeze** the current round R: push `{ chat: roundR-chat, events: roundR-events,
   at, acted }` onto `task.variants[R].archived`.
2. **Wipe** round R from the flat arrays (`$pull chat/events where round==R`),
   rewind `task.round` to `R-1`, clear plan state (queue / currentInstruction /
   plan / counters — same reset the old endpoint used; round 0 also clears collected
   data, restarting the task).
3. **Re-run** `runChatTurn(task, instructionForRoundR, …)` — rebuilds round R fresh
   into the flat arrays (round increments back to R). Reuses the whole routing
   pipeline (answer re-answers, browse re-plans, launch re-proposes, …).
4. Set `variants[R].viewIndex = archived.length` (show the new live attempt).

`instructionForRoundR` = `task.goal` for R==0, else round R's user message.

### Backend — `POST /tasks/:id/round/:r/view { index }` (switch selection)

Guard: `r` is the last round; `0 ≤ index ≤ archived.length`. Sets
`variants[r].viewIndex = index`. **No flat-array mutation** — switching is a view
concern, so it never fights a live-updating browse round. Returns the task.

### Renderer — the switcher, in place

- `GET /tasks/:id` already returns the whole doc → `variants` rides along.
- `ChatThread.vue`: for the LAST round, if `variants[R]` exists and
  `viewIndex < archived.length`, render `archived[viewIndex].chat/events` INSTEAD
  of the live flat round-R content. Otherwise render the live flat content.
- A `‹ 2/3 ›` control on the last round (next to 👍/👎): prev/next call
  `sessions.setRoundView(R, index)` → `POST …/round/:r/view` → `refreshCurrent`.
- The ↺ icon now calls the versioned `regenerate()` → `POST …/regenerate` →
  `refreshCurrent`; tooltip stays "Run again". `sessions.regenerate()` loses its
  `sendChat` implementation.

## Hard parts / open questions

- **Feedback while viewing an archived attempt.** 👍/👎 target "round R" via the
  flat arrays = the LIVE attempt, not the shown archive. v1: **disable 👍/👎 when an
  archived (non-live) index is selected** (only rate what's live). Revisit if the
  user wants per-attempt feedback.
- **Round 0 regenerate restarts the whole task** (clears collected data + counters),
  so a round-0 archive is a full prior run. Heavy but consistent with the done plan.
- **Switching a non-last round** stays out of scope (switcher shows on last round
  only), so `task.round` never needs to move on a view switch.
- **Re-running a round that acted may re-post** — the user's explicit intent for a
  manual regenerate (automatic double-post guards are untouched).

## Phases

1. Backend: `variants` shape + `POST /tasks/:id/regenerate` (freeze→wipe→rerun).
2. Backend: `POST /tasks/:id/round/:r/view`. Whitelist any new PATCHable field.
3. Renderer: `sessions.regenerate()` rewrite + `setRoundView`; `ChatThread.vue`
   switcher + archived-render + feedback gate.
4. Verify: `node --check`; `:4010` backend run (answer round: regen twice, assert
   2 archived + live; switch view; confirm flat arrays untouched by a view switch).
   Then live click-through in the app.

## Built (2026-07-22)

- **Backend** (`server.js`): `POST /tasks/:id/regenerate` (freeze current round →
  `variants[R].archived`, wipe round R from flat arrays, rewind `round` to R−1 so
  runChatTurn rebuilds it, set `viewIndex` to the new live attempt). Round 0 also
  clears collected/extracted/counters (restart). Busy-guarded (409). And
  `POST /tasks/:id/round/:r/view {index}` — view-only, moves `viewIndex`, no flat
  mutation, range-guarded. `variants` rides along on `GET /tasks/:id` (whole doc).
- **Renderer**: `sessions.regenerate()` rewritten to POST the endpoint (was
  `sendChat`); new `sessions.setRoundView()`. `ChatThread.vue` `applyVariants()`
  overlays an archived attempt's chat/events for the last round when its
  `viewIndex` is not the live one; a `‹ n/m ›` control (next to ↺) flips
  versions; 👍/👎 disabled while viewing an archived (non-live) attempt.
- **Verified**: 18-case `:4010` run (freeze/wipe/rerun, 2 archived + live,
  view-switch leaves flat arrays untouched, out-of-range + busy guards);
  `electron-vite build` transforms 279 modules clean.
- **Mongo note**: `$set variants.R.viewIndex` + `$push variants.R.archived` in one
  update works (sibling sub-paths — no path-conflict error), even when `variants`
  doesn't exist yet.

## Left

- Live click-through in the app (backend + build verified).
- Later (not now): per-attempt feedback (today 👍/👎 only rate the live attempt);
  switching a NON-last round (UI shows the switcher on the last round only).
