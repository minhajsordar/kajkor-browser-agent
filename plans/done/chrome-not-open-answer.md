# "Chrome isn't open" → answer honestly instead of hanging

**Status:** DONE (2026-07-22) — backend verified (9-case :4010 run), extension
one-line change, syntax-checked. Needs an extension reload to take effect.

## Why

A tab question ("is chrome open, how many tab open?") routes to a single-phase
`list_tabs` round. The Chrome extension is the ONLY executor and runs only while
Chrome is open, so with Chrome CLOSED nothing ever polls the round — it hangs
forever showing "running · Checking your open Chrome tabs…". The user hit this
live (screenshot: no Chrome open, task stuck "running 0/1 actions"). The question
is circular: it's answered by a tool that can only run when the answer is "yes".

## Approach

**An executor-presence heartbeat.** The extension's always-on `ba-task-poll`
(every 30s) already hits `GET /tasks`; it now sends `GET /tasks?executor=1`. The
backend stamps `lastExecutorSeenAt` ONLY when that flag is present — the desktop
app lists tasks without it, so it never counts as an executor. `executorOnline()`
= last seen within 70s (~2 missed 30s polls of grace).

Rejected: sniffing User-Agent / origin to tell the extension's poll from the
desktop app's (fragile). A dedicated `?executor=1` marker is explicit and is a
one-line extension edit.

**Three touch points:**
1. **POST /tasks** creation tab-question branch — if `!executorOnline()`, create an
   idle `done` session that posts `CHROME_NOT_OPEN_REPLY` (no list_tabs plan).
2. **runChatTurn** follow-up tab-question branch — same guard; post the reply
   instead of dispatching the round (mirrors the launch-status answer branch).
3. **GET /tasks/:id self-heal** — a still-running quiet single-phase list_tabs
   round with 0 actions while offline is resolved to `done` with the reply. Atomic
   `findOneAndUpdate` pinned to `status:'running'` so the desktop app's 1.5s poll
   can't double-resolve. This ALSO recovers rounds already stuck before the fix
   (e.g. the one in the user's screenshot).

## Hard parts / notes

- **Requires an extension reload.** An un-reloaded extension polls WITHOUT the
  flag → backend reads offline → wrongly answers "not open" even when Chrome is
  open. Unavoidable given the extension is the signal source.
- **70s window vs the 30s poll.** Must exceed one poll interval so a genuinely-open
  Chrome that simply hasn't polled since the last cycle isn't misread as offline.
- **In-memory state.** `lastExecutorSeenAt` resets on backend restart → reads
  offline for ≤30s until the next poll. Deliberate: under-claim presence (a brief
  honest "not open" beats an infinite spinner). Not worth persisting.
- The self-heal writes inside a GET. Acceptable here (idempotent, atomic, no model
  call); mirrors how the PATCH handler already triggers drainQueue as a side effect.

## Verified

9-case `:4010` run: offline creation → mode=answer/done + honest reply + no plan;
self-heal resolves a stuck running list_tabs round; after `?executor=1` a tab
question dispatches list_tabs again (mode=browse/running). `node --check` on
server.js + background.js.

## Left

- Live click-through (reload the extension first). Backend + syntax verified.
