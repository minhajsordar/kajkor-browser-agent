# Daily todos — routines, schedules, manual triggers and sub-agents

**Status:** phases 1–2 **built** (2026-07-28) — backend verified (64 pure + 45
integration cases), renderer builds clean (282 modules), live click-through in
the Electron app still to do. The clock (phase 3) and the agentic layer
(phases 5–6) are NOT started: nothing fires on its own yet, every run is a
button. See "Built" at the end for exactly what exists.

## Why

Today the only way to make this agent do anything is to open a chat and type the
instruction. Anything you do *every day* you therefore type *every day*, and you
have to remember which variants you already did.

That is what a **daily todo list** is for. The list is defined once, it reappears
each morning already filled in, and you work through it — ticking items off,
skipping some, letting others run on their own. This feature is that list.

**This is a GENERAL work engine, not a social-media feature.** An item is "one
instruction the agent runs" and nothing more. The recurring job might be:

- 5 topics × 3 sites of affiliate posts (the example that prompted this),
- check 4 competitor price pages each morning and record the numbers,
- run a research question daily and file the answer into a schema collection,
- a `/run` host command (backup, sync) on a weekday morning,
- open Chrome on a work profile at 09:00 and load the dashboards you always open.

Nothing in the model below names a platform. Where this document says
"posting", read "an item that has side effects".

**A blunt prerequisite (phase 0, not optional).** A scheduler multiplies whatever
reliability the underlying flow already has, and runs it *unattended*. If a flow
works 7 times in 10 by hand, a 15-item day fails ~4 times a day with nobody
watching — and for items that act on a live account, this project's own history
includes a published `<the post text>` placeholder and an agent that liked the
user's own post while trying to publish (PROJECT_MEMORY 2026-07-19). **Only
schedule work that is already proven by hand.** Everything else stays manual.

## Decisions (user, 2026-07-28)

1. **Generic engine, examples are examples.** Item templates are instructions;
   the engine never knows what a "post" is. (User's correction, 2026-07-28 — the
   first draft of this plan was written around social posting.)
2. **Fan-out = inputs × templates.** A routine may carry a list of **inputs**
   (rows of values) and one or more **item templates**; materialising a day is
   the cross-product. The affiliate case is 5 topics × 3 sites = 15 items. A
   plain daily job is 0 inputs × 1 template = 1 item.
3. **Approval is per template:** `mode: 'auto' | 'draft'`. A proven flow may run
   unattended; anything unproven prepares and waits for the human.
   *In phases 1–2 every run is manual anyway, so pressing ▶ **is** the approval;
   `mode` is stored and displayed but only starts gating in phase 3.*
4. **Inputs come from a list the user maintains**, rotated round-robin by
   `lastUsedAt` with a cooldown. Phases 1–2 keep the list **on the routine**;
   sourcing it from a `schemas` collection is phase 4.
5. **Build phases 1–2 first** (list + manual ▶) and hand it over before the clock
   exists. Nothing fires unattended until the user has watched it work.
6. **A missed run stays runnable — it is never auto-skipped.** "Scheduled 09:00,
   computer was off, I turn it on at 14:00 → I press it myself." Lateness gates
   *auto*-running only: past the grace window it stops firing unattended, but the
   item stays `todo` with the ▶ live until the routine's NEXT occurrence
   supersedes it. (`canAutoRun` / `missedButRunnable` in `todos.js`.) A finished
   list can also be reset and run again before the next occurrence.
7. **A fourth trigger: `interval`** — "run this every 1 hour / every 5 hours".
   `schedule.everyMinutes`, floor 5 min. Occurrences are keyed to the minute, not
   the date, so an interval routine has many lists a day. After a machine is off
   for a day it fires **once** on wake and resumes — never a replay of the twelve
   fires it missed, which would be a stampede of real browser work.
8. **Everything is manually runnable, always** — a routine ("Test one" / "Run
   all"), a list, one item, and an item that already finished (`force:true`).
   The user's reason: you have to be able to press it to check it works. This
   matches the "Run again" precedent — a human press is a deliberate "do it
   again"; the double-post guards exist to stop AUTOMATIC repeats.

## The shape (three trigger modes — the user's own list)

One object model covers all three; they differ only in *what fires*.

- **Routine** — the recurring definition: name, project (it inherits the
  project's model / skills / launchable apps), a schedule, item templates, and an
  optional input list.
- **Todo list (a day)** — what a routine produces for one date: a concrete,
  editable checklist. Also creatable ad-hoc with no routine behind it.
- **Todo item** — one instruction the agent runs. State:
  `todo → queued → running → done | failed | skipped`.

| mode | what the schedule does | who starts an item |
|---|---|---|
| `schedule` | materialises the list **and** auto-runs each item at its `runAt` | the clock |
| `schedule-todo` | materialises the list in the morning; items have no `runAt` | the human presses ▶ |
| `manual` | no clock at all; the list exists and is reused | the human presses ▶ (item, or "Run all") |

`schedule-todo` is the mode this feature exists for: "prepare my day, I'll work
it." Mixed lists are allowed — an item can carry its own `runAt` inside an
otherwise manual list, and a scheduled item can always be pressed early.

**Why one item = one instruction (not one task for the whole day):** one failing
item must not take the rest with it, each needs its own retry/skip, and each run
stays a readable transcript. Rejected: pushing the day's instructions into a
single task's `queue` — that field is for prompts typed while a session is busy,
and one bad round would strand the rest.

**An item's kind falls out of its instruction, for free.** `POST /tasks` already
routes on the text: a `/run …` goal becomes a host-command proposal, "open chrome
with my Work profile" becomes a launch, a question becomes an answer, everything
else is browser-planned. So a routine can mix a host command, a launch and a
browse item without the todo engine knowing the difference. The only kind it adds
itself is `decide` (phase 6, backend-only).

## Human-way behaviours that are load-bearing, not polish

- **Spread, never burst.** N items firing at 09:00:00 is a bot signature to any
  site and a thundering herd to the local model. Items get spread over a window
  with per-item jitter, recomputed daily.
- **Catch-up, with an expiry.** Laptop off at 09:00, opened at 10:30 → run it at
  10:30 (it is still *today's* todo). An item more than `graceHours` late
  (default 4) goes `skipped`, and yesterday's list is **never** run today. No
  backlog stampede after a weekend away.
- **Rotation, not random.** Round-robin the input list by `lastUsedAt` so today
  is not yesterday; never reuse inside the cooldown.
- **Skip is a first-class outcome**, not a failure — "not today" is a normal
  thing to do with a list.
- **Failure does not auto-retry.** An item that acted either acted or did not,
  and the agent often cannot tell (the `DRAFT_STILL_OPEN` saga). A failed item
  sits in the list with a Retry button. Matches the RETRY RULE: never retry after
  a side effect.
- **A hard daily cap** per template (default 10), enforced backend-side. A bug in
  the clock then costs at most 10 runs, not 200.

## Two hard constraints this design has to live inside

**1. The clock can only run where the backend runs.** The backend is embedded in
the desktop app when packaged, so *the schedule only ticks while the desktop app
is open* (in dev: while the port-34730 process is up). This is not a server-side
cron and must not be described to the user as one. Consequence: the catch-up
window above is the real mechanism. Later fix (out of scope): launch-on-login for
the Electron app — `desktop-app/src/main` already owns startup and auto-update.

**2. Browser items need the extension, inside Chrome.** A due browser item whose
Chrome is closed cannot run. The machinery exists — `executorOnline()` (the 70s
`?executor=1` heartbeat, PROJECT_MEMORY 2026-07-22). A due browser item with no
executor **waits** in `queued` (it must not create a task that would hang
"running" forever — that was the tab-question bug), and expires to `skipped` at
the `graceHours` boundary with the reason recorded. Host-command, launch and
`decide` items do **not** need an executor and run regardless. Note
`lastExecutorSeenAt` is in-memory: it reads offline for ≤30s after a backend
restart, so the tick loop must not judge "offline" on a single miss after boot.

## Data model (Mongo, alongside `tasks` / `projects`)

```js
// routines
{ routineId, name, projectId,               // inherits model/skills/launchApps
  trigger: 'schedule' | 'schedule-todo' | 'manual',
  schedule: { daysOfWeek:[1..6], materialiseAt:'08:30',
              window:{ from:'09:00', to:'18:00' }, jitterMin: 20 },
  templates: [                              // WHAT to do, once per input row
    { templateId, label:'Facebook post', instruction:'<text with {placeholders}>',
      skillIds:[], mode:'auto'|'draft', capPerDay:10, enabled:true } ],
  inputs: { perDay: 5, cooldownDays: 14,    // WHICH values to do it with
            source:'inline'|'schema'|'none',
            rows:[ { id, values:{ topic:'…', link:'…' }, lastUsedAt } ],
            schemaId, fields:[] },
  active: true, lastMaterialisedDate:'2026-07-28', createdAt, updatedAt }

// todolists  (one per routine per date; also ad-hoc with routineId:null)
{ listId, routineId, projectId, date:'2026-07-28', title,
  items: [ { itemId, templateId, label, instruction, inputId, values,
             mode, runAt|null,
             status:'todo'|'queued'|'running'|'done'|'failed'|'skipped',
             taskId|null, startedAt, finishedAt, note, reason } ],
  createdAt, updatedAt }
```

`date` is the machine's local date, formatted once server-side. **Never compare
`Date` objects across a DST boundary** — compare `YYYY-MM-DD` and `HH:MM`
strings.

**Idempotency is the safety property.** A unique index on `(routineId, date)`
makes double-materialisation impossible, and an item only leaves `todo` through
an atomic `findOneAndUpdate` pinned to `status:'todo'` — the same pattern the
list_tabs self-heal uses so concurrent polls cannot double-resolve. Two ticks, or
a tick racing a manual press, can never start the same item twice.

## Execution — reuse the whole existing pipeline

Running an item is deliberately boring: fill the template with the input row's
values, then `POST /tasks` with the routine's project, so the task inherits model
/ skills / launchable apps exactly as a typed session does. Store the returned
`taskId` on the item; the item's status then mirrors the task's — read on demand,
no new plumbing.

Rejected: a dedicated execution path for scheduled work. Every guard that matters
(placeholder-text refusal, publish verification, lessons injection, feedback,
double-post guards) lives on the normal path. A second path would drift, and it
would be the one that does damage.

Rejected: `POST /tasks/:id/rerun` (reuse the proven plan) as the runner. Tempting
— cheaper, skips replanning — but the *filled values differ every day*, so a
reused plan would carry yesterday's typed text. Revisit only if a template puts
the varying part behind `generate_text`.

## Thinking / analysing / deciding — and sub-agents

A person working a list does not just execute it. They look at what happened
yesterday, decide what is worth doing today, work out the details, do it, and
check it landed. Several of those need judgment; several are separate small jobs.
Two features cover it.

### 1. Decision steps (the thinking)

A **`decide` item** is a first-class item type, ordered before the doing items.
It runs in the backend against the model — **no browser, no executor** — so it
works with Chrome closed, and it writes its conclusions into the day's list.

Reads: yesterday's outcomes (done/failed/skipped + errors), the input pool with
`lastUsedAt`, active lessons for the relevant hosts (`injectLessons` exists), and
recent 👎 feedback. Writes: which input rows to use, the order, per-item `runAt`,
and `skipped` on items not worth running (e.g. this template failed 3 days
running).

**Decisions must be bounded and schema-enforced.** The planner is a local 7B;
open-ended "decide what to do today" produces mush and loops. Every decision is
*multiple choice over options the backend computed*:

- "Pick 5 of these 12 input rows, one line of reasoning each."
- "This item failed 3 days running — `retry` / `skip-today` / `pause-template`?"
- "Variant A or variant B?"

Output goes through Ollama's `format` schema with **enums** — and per
PROJECT_MEMORY 2026-07-20, an enum handed to the model as `format` is
grammar-enforced: it cannot emit an unlisted value, and equally it cannot emit
anything the prompt asks for that the enum omits. Audit prompt and enum together.

**Every decision leaves a visible trail.** The reason is stored on the item and
rendered in the list ("chose *X* — unused for 18 days"), and pushed as a `think`
event. A decision the user cannot see is one they cannot correct — and the 👎 →
lesson pipeline already exists to correct it.

**Decisions are advisory on anything destructive.** A `decide` step may choose,
reorder and skip. It may **not** widen scope: no adding templates, raising a cap,
or flipping `draft` → `auto`. Those are the user's settings, and an agent that
can raise its own limits is one bug from real damage. Same boundary as
`launchApp`'s curated registry and `solve_with_code`'s read-only enforcement —
**enforced in code, not asked for in the prompt** (learned twice here already).

### 2. Sub-agents (the sub-tasks)

One item is often a small pipeline: *research → prepare → act → verify*. Making
that one giant browser plan is how the agent ends up 12 phases deep, mixing a
search engine with a form, and clicking the wrong dialog. Instead each stage is a
**child task**: a normal task with `parentTaskId` set, run sequentially, whose
result feeds the next.

```js
// on the task doc
parentTaskId: '<uuid>|null',
subrole: 'research' | 'prepare' | 'act' | 'verify' | null,
childTaskIds: ['…'],
result: { … }        // what a child hands back to its parent
```

- **Reuse, don't invent.** `research` is the existing research pipeline (search →
  crawl top-N → `synthesize`); `prepare` is `/ai/generate`; `act` is the ordinary
  taught-skill browser task. Nothing new executes — the parent sequences them and
  carries the output forward.
- **Only ONE child may have side effects — the `act` child.** research / prepare
  / verify are read-only by construction. This is the most important rule here: a
  sub-agent that can act is a sub-agent that can double-act.
- **Sequential, concurrency 1.** Never two browser children at once — two tabs
  driving two flows is how the wrong dialog gets clicked. It also keeps the local
  Ollama box from thrashing.
- **A fixed pipeline per template, not a model-chosen graph.** Stages are
  declared (`stages: ['research','prepare','act']`); the model fills content and
  makes the bounded decisions above. A 7B asked to orchestrate its own sub-agents
  will spawn, loop and never converge — and this repo's whole design is
  deterministic tools with model-filled params.
- **Failure is not inherited blindly.** A failed `research` child → the parent
  falls back to the stored input values and carries on. A failed `act` child
  fails the item, full stop, and does **not** re-run: the side effect may already
  have fired.
- **Depth 1.** Children may not spawn children — refuse a `parentTaskId` on a
  task that already has one. Otherwise a runaway tree eats the day's budget and
  the transcript becomes unreadable.

**UI:** the parent session shows children inline as collapsible steps
("🔎 Researched X · ✍️ Prepared · 📤 Acted"), each expanding into its own
transcript. Reuse the existing per-round event rendering; do not invent a second
timeline.

**Rejected — sub-agents as phases inside one task.** Cheaper (no new task docs),
but a phase list is a flat sequence with one `currentPhaseIndex` and one retry
budget; a failed research phase would burn the acting task's retries and the
whole thing would die together.

**Rejected — one long-lived "day agent" process.** Attractive, but it must
survive app restarts, so its state has to live in Mongo anyway — at which point
it *is* the tick loop plus child tasks, with more moving parts and no
supervision point.

## Backend surface

- `GET/POST /routines`, `GET/PATCH/DELETE /routines/:id`,
  `POST /routines/:id/materialise` (build a day's list now).
- `GET /todolists?date&routineId`, `GET /todolists/:id`, `POST /todolists`
  (ad-hoc), `DELETE /todolists/:id`.
- `PATCH /todolists/:id/items/:itemId` (edit instruction, set `runAt`, reset),
  `POST /todolists/:id/items/:itemId/run|skip`,
  `POST /todolists/:id/run` (**sequential** — never parallel).
- Phase 3 adds the **tick loop**: one `setInterval` (30–60s) at boot that
  (a) materialises due routines, (b) runs or expires due items on *today's*
  lists, (c) reconciles `running` items against their tasks.
  Rejected `node-cron`/`agenda`: state in a library's memory dies on restart, and
  a comparison over `HH:MM` strings in Mongo is debuggable at 2am. No new dep.
  Rejected `chrome.alarms` as the clock: MV3 workers die and revive constantly,
  the schedule would be per-browser-profile, and the extension is deliberately
  the executor, not the brain.
  Must be single-instance-safe — tests boot a second backend on :4010 against the
  same shared Mongo. Gate on an env flag (`SCHEDULER=0`) *and* rely on the atomic
  transitions above.

## Desktop app

- A **Todos** tab (`pages/TodosView.vue` + `stores/todos.js`): today's list as a
  checklist — label, filled values, time or "manual", status, ▶ / skip / retry,
  and a link opening that item's session in Chat. A day picker, and "Build
  today's list".
- **Routine editor dialog**: trigger mode, days, times/window, item templates
  (label, instruction, skills, auto/draft, cap), input rows. Follows
  `ProjectSettingsDialog` patterns.
- Every flex child holding an instruction or an input value needs
  `min-width: 0` — this pane is a list of long user-supplied strings, exactly
  what blanked the chat pane twice (CLAUDE.md Conventions).
- Honest status when nothing can run: "Chrome isn't open — 2 items waiting".

## Phases

1. **Model + CRUD + materialise, no execution.** Routines, todo lists, the Todos
   page showing a list. Prove the list appears and is editable.
2. **Manual trigger.** ▶ on an item → `POST /tasks` → status mirroring →
   "Run all" sequentially. This alone replaces the daily typing, and it is the
   whole of the `manual` + `schedule-todo` product.
3. **The clock.** Tick loop, `runAt` spread + jitter, executor-aware waiting,
   catch-up + expiry, caps. The `schedule` mode.
4. **Input sourcing from a schema collection** (the `schemas` + records API
   exists), instead of rows stored on the routine.
5. **Sub-agents.** `parentTaskId` / `subrole` / `result`, depth-1 guard,
   sequential runner, `prepare` stage first (read-only, cheapest to verify), then
   `research`, then inline child rendering.
6. **Decision steps.** The `decide` item type. Ships after 4 (it needs something
   to choose *from*).
7. **Draft-and-approve + notifications.** Per template: prepare, stop, ask in
   chat, act on approval (rides the existing `proposals[]` gate). Plus an
   end-of-day summary.

Phases 1–3 are the product on their own; 5–6 are the agentic layer on top, and
must not start before an item runs reliably end to end.

## Built (2026-07-28) — phases 1–2

- **`backend/todos.js`** — a PURE module (no DB, no network) so materialisation,
  rotation, template filling and the missed-run rules are unit-testable; same
  reason `lessons.js` / `feedback-triage.js` are separate files. 64 unit cases.
  Holds `cleanRoutine` (whitelist), `pickInputRows` (round-robin), `buildList`
  (inputs × templates, row-major, capped), `occurrenceKey`, `intervalDue`,
  `shouldMaterialise`, `canAutoRun` / `missedButRunnable`, `resetItems`,
  `itemStatusFromTask`.
- **`backend/server.js`** — `routines` + `todolists` collections and the API:
  routines CRUD, `POST /routines/:id/materialise`, `POST /routines/:id/run-now`
  (`scope:'first'` = test one item), lists CRUD, per-item
  `run` / `skip` / PATCH, `POST /todolists/:id/run|stop|reset`.
- **`desktop-app` Todos tab** — `stores/todos.js` + `pages/TodosView.vue` +
  route + header tab. Routines list with Build list / Test one / Run all, a
  routine editor dialog (trigger, interval minutes, templates, input rows), and
  the day's checklist with ▶ / replay / skip / edit / "open its session in Chat".
- Verified: 64 pure + 45 integration cases (`:4010`, all test docs deleted);
  `node --check` on both backend files; `electron-vite build` clean (282
  modules). **Live click-through in the Electron app is NOT done.**

### Decisions that only became visible while building

- **An item's model belongs to the RUN, not to the caller.** "Run all" starts
  item 1 from the HTTP request that pressed it, but item 2 starts from whatever
  polls next — and phase 3's tick loop has no request at all. Every item after
  the first died with *"model required"* until the model was stamped on the list
  (`list.model`) and read back in `reconcileList`. Phase 3 depends on this.
- **`GET /todolists/:id` is not a read.** It reconciles items against their tasks
  AND advances a "Run all" chain, which is what makes the chain sequential with
  no clock: nothing starts until the previous item is terminal. The renderer's
  2.5s poll is therefore load-bearing, and it stops as soon as nothing moves.
- **Running an item = `POST /tasks` to our OWN backend over loopback**, not an
  extracted helper. Deliberate: every guard (placeholder refusal, publish
  verification, lessons, project inheritance, launch/host routing) lives on that
  path, and a second creation path would drift from it. Loopback is auth-exempt;
  the caller's token is forwarded in case `AUTH_ENFORCE_LOCAL` is on.
- **A browser item refuses to start with Chrome closed** (`needsExecutor` +
  `executorOnline`) instead of creating a task that would hang "running" forever.
  Host commands, launches and questions are exempt — they need no executor.
- **The claim is the safety property.** `run` moves an item out of `todo` with an
  atomic `findOneAndUpdate` pinned to a startable status, and materialising is
  guarded by a unique index on `(routineId, occurrenceKey)` — so a double-click,
  or two callers racing, cannot start the same work twice.

## Left

- **Live click-through in the Electron app** (backend + build verified only).
- Phase 3 (the clock), 4 (schema-sourced inputs), 5–6 (sub-agents, decide steps),
  7 (draft-and-approve + notifications).
- `mode: 'auto' | 'draft'` is stored and shown but gates nothing yet — phase 3
  reads it. Same for an item's `runAt`, which is a note to yourself today.

## Open questions (still need the user's answer)

1. **Which flows are proven enough to schedule?** Everything else stays `draft` /
   manual.
2. **Timezone** — machine-local assumed; day boundary at local midnight.
   Confirm.
3. **How much authority does the `decide` step get** — choose inputs only, or
   also skip items and pause a failing template? (It may never widen scope, but
   "skip today" is a real judgment call to delegate or not.)
4. **Which sub-agent stages earn their cost?** Each is another local-model round;
   15 items × 3 stages is ~45 rounds a day on the Ollama box. `prepare` clearly
   earns it; is per-item `research` worth the minutes?
