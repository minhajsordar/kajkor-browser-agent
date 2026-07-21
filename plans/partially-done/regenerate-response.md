# Regenerate response — retry the last round when the result isn't good

**Status:** built (2026-07-21) — backend verified (10-case :4010 run), renderer
compiles clean, live UI click-through unverified. Decisions locked with the user.

## Why

A round's answer/result is sometimes unsatisfying (e.g. a launch-status question
that got the canned "can't verify" reply, or a weak research answer). Today the
only recourse is to retype the same message. A one-click **Regenerate** on the
last response re-runs that round.

## Decisions (user, 2026-07-21)

1. **Replace in place.** Regenerate removes the last round's response (and its
   activity) and re-runs the same instruction as the SAME round — not a second
   attempt appended below.
2. **Answers only — never a round that acted.** A round that fired side effects
   (click / type / post / use_skill / launch / host command) must NOT be
   re-runnable: re-running would repeat the action (double-post). The button is
   hidden on such rounds, AND the backend refuses them (defense in depth).
   Read-only rounds (a chat answer, a launch-status answer, a tab list, a
   read-only research round) are regenerable — repeating them is harmless.

## Approach

**"Acted" detection (shared shape, front + back).** A round acted if any of its
events is a launch (`meta.launch`), a host command (`meta.host`), or a
side-effect phase — `Phase n/m: (click|type|press_key|generate_text|use_skill|
run_skill|ask_user)` (the same SIDE_EFFECT set `executeLoop` already uses for its
double-post guard). Everything else is regenerable.

**Backend — `POST /tasks/:id/regenerate`.** `R = task.round`. Guard: `R>=1` and
round R did not act. Take round R's user message, then **remove the whole round**
(`$pull chat/events where round==R`), rewind `round` to `R-1`, clear plan state,
and call the existing `runChatTurn(task, thatMessage, …)` — which re-creates round
R from scratch (re-pushes the user turn, re-routes). Reuses all of runChatTurn, so
the regenerated round goes through the same routing (a tab question now becomes a
`list_tabs` round, an answer re-answers, etc.).

Rejected: refactoring runChatTurn to re-run a round without the increment — more
surgery, and "remove the round + rewind + re-run" reuses the whole pipeline as-is.

**Desktop.** A **replay/refresh** icon on the last round, next to 👍/👎, shown only
when the round is the last one, has a reply, is not running, and did NOT act.
`sessions.regenerate()` → `POST /tasks/:id/regenerate` → `refreshCurrent`.

## Hard parts

- **Double-action safety** is the whole reason for "answers only". The gate is in
  BOTH places; the backend is authoritative (the UI could be stale).
- **Round bookkeeping.** `$pull { round: R }` is precise because every turn/event
  is stamped with its round (round 0 = the goal, never regenerated). Rewinding
  `round` to `R-1` lets `runChatTurn` rebuild round R with its own logic.

## Built (2026-07-21)

- Backend `POST /tasks/:id/regenerate` (server.js): 409 if busy, 400 if `round<1`
  or the round acted (`roundActed` — meta.launch/host, side-effect phases, launch/
  host proposals) or no user message; else `$pull` round R, rewind `round`, re-run
  `runChatTurn`.
- `sessions.regenerate()` + a refresh icon on the last round in `ChatThread.vue`,
  shown only when `!r.acted && r.replies.length` (rounds carry `r.acted` via the
  same `roundActed`).
- Verified: 10-case :4010 run — replace-in-place (round stays, one user + one
  assistant), round 0 preserved, acted launch round refused, round-0-only refused.

## Left

- Live click-through in the app. Backend verified on :4010.
- Later (not now): regenerate an OLDER round (invalidates later rounds — out of
  scope); a version switcher (< 1/2 >) keeping both attempts.
