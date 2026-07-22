# Regenerate response — retry the last round when the result isn't good

**Status:** built (2026-07-21) — backend verified (10-case :4010 run), renderer
compiles clean, live UI click-through unverified. Decisions locked with the user.

## Why

A round's answer/result is sometimes unsatisfying (e.g. a launch-status question
that got the canned "can't verify" reply, or a weak research answer). Today the
only recourse is to retype the same message. A one-click **Regenerate** on the
last response re-runs that round.

## Decisions (user, 2026-07-21)

1. **Append a new response below (revised).** First built as "replace in place",
   but on testing the in-place swap looked like nothing happened (a re-run of a
   canned answer updates silently). The user asked for it to "work like if I give
   a new prompt" → **Run again now re-sends the last instruction as a NEW turn**
   (via the normal `sendChat`), so a fresh prompt+response appears below and
   launch/host/browse are handled identically. No backend endpoint — it's a
   client convenience. (The old `POST /tasks/:id/regenerate` replace endpoint was
   removed.)
2. **EVERYTHING is regenerable (revised 2026-07-21).** Originally "answers only"
   (no round that acted), to avoid a re-post. The user reversed it — *"Everything
   can rerun/regenerate. I need this feature."* — so the button shows on every
   last round and the backend re-runs it regardless of side effects. A regenerate
   click is an explicit "do it again"; if the round posted, re-running may post
   again, which is the user's intent. (The double-post guards elsewhere protect
   AUTOMATIC retries — this is a deliberate manual action.) The old `roundActed`
   gate was removed from both the endpoint and the UI.
3. **Round 0 (the whole task) regenerates too.** The original bug: a stopped/failed
   initial task showed "nothing to regenerate" because the endpoint required
   `round≥1`. Round 0's instruction is the GOAL; regenerating it restarts the task
   (clears collected data + counters) and re-runs the goal through the same
   routing (re-plans a browse task, re-answers an answer, re-launches, …).

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

## Built (2026-07-21, final)

- **"Run again" = re-send the last instruction as a new turn.** `sessions.regenerate()`
  computes the last round's instruction (`task.goal` for round 0, else the round's
  user message) and calls `sendChat(text)` — so it appends a visible prompt+response
  and reuses all of sendChat's mode handling (queue if busy, auto-run a launch,
  surface a host proposal, re-plan a browse round). No backend endpoint.
- A refresh icon on the LAST round in `ChatThread.vue` (tooltip **"Run again"**,
  toast "Running again…"); any round, any kind.
- **Label**: "Run again", not "Regenerate" (user — this re-RUNS, incl. re-launching).
- **Bug fixed en route:** `lastLaunchLabel` matched the "…launch-status question…"
  obs event and produced a garbled app name on a re-run; it now requires the
  "keyword: label" colon, and the obs event was renamed so it can't be mistaken
  for a launch.

## Left

- Live click-through in the app. Backend verified on :4010.
- Later (not now): regenerate an OLDER round (invalidates later rounds — out of
  scope); a version switcher (< 1/2 >) keeping both attempts.
