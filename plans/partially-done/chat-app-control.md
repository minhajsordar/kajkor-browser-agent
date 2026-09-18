# Control the app by chatting — todos, schemas, skills, data, projects

**Status:** phase 1 **built** (2026-07-28) — `/todo` and `/routine` create an
approval-gated todo or routine from chat. 38 pure + 36 integration cases pass;
renderer builds clean; live click-through not done. Phases 2–5 (natural
phrasing, reads, run-by-chat, schemas/projects/skills) not started.

## Why

The user wants the chat box to be the control plane: *"I should be able to
control everything — todos, data, schemas, skills — inside the app by chatting."*
Concretely, this message should create a routine:

> Open google chrome if not opened, then navigate to amazon.com, pick a
> best-selling shoe product, get details, post it in facebook, pinterest etc.
> **and add this task as todo.**

**Today that message does something worse than nothing.** `routeChat` classifies
it as `browse`, the planner plans a browser task, and the agent tries to do the
whole thing **right now** — open Chrome, browse Amazon, post to Facebook — while
the trailing clause *"add this task as todo"* is silently dropped, because there
is no tool for it. That is this project's most-repeated failure, already logged
twice in PROJECT_MEMORY: *the planner silently drops instructions it has no tool
for, and the target check then reports success.* Here the dropped clause is the
one that changes the meaning of the whole sentence — save it versus do it.

So this is not only a missing feature. Until it exists, that phrasing is a live
hazard on a posting account.

## What already works (the precedent to copy, not to reinvent)

The repo already routes several meta-intents away from `browse`, each with a
deterministic gate in front of the model:

| intent | gate | result |
|---|---|---|
| host command | `HOST_PREFIX_RX` (`/run …`) | proposal → user confirms → runs |
| launch an app | `detectLaunch` (keyword map, not the model) | launch proposal |
| "how many tabs?" | `isTabQuestion` | deterministic `list_tabs` plan |
| "what skills do I have?" | `isIntrospection` + a `routeChat` class | answered from the DB |
| "save this as a skill" | `isSaveSkillRequest` + a `routeChat` class | writes a skill |
| a 👎 correction | `feedbackTriage.isCorrectionMessage` (PURE, strict) | proposal |

Two lessons are already paid for and must carry over:

1. **A single classifier is not enough.** "Save this as a skill" is gated
   *twice* (regex + a `routeChat` class) because a meta-request mis-routed to
   `browse` has, in real runs, re-executed a posting flow against a live account.
2. **Intent classifiers by a 7B misfire.** `feedbackTriage.isCorrectionMessage`
   was deliberately made pure and strict after two misfires. The model may fill
   in *details*; it should not be the thing that decides *whether this is a
   command about the app*.

Writes also already have a home: `task.proposals[]` + `applyProposal` +
`PROPOSAL_KINDS` (`element.create`, `element.repoint`, `skill.update`,
`skill.delete`, `lesson.create`), rendered as an approve/reject banner in the
transcript. Chat-driven app control is mostly **new proposal kinds**, not new
machinery.

## Approach — three stages, and a card before anything is written

### Stage 1 — a deterministic gate decides IF this is an app command

Two ways in, both testable without a model:

- **Explicit prefix** — `/todo`, `/routine`, `/schema`, `/skill`, `/project`.
  Unambiguous by construction, the same trick as `/run` and `/launch`. This is
  the escape hatch that always works when the detector is unsure.
- **A trailing-intent clause** — a narrow, pure detector (`isAppCommand`) for
  phrasings that name an app object as the OBJECT of a save/create/list/delete
  verb: "…and add this as a todo", "save this as a routine", "make a schema for
  …", "delete the facebook post skill", "what's on my todo list today?".
  Written like `feedbackTriage`: strict, unit-tested, biased to **no**. A missed
  detection costs the user a re-phrase; a false positive silently converts a real
  browse request into a note.

### Stage 2 — the model fills a STRUCTURED payload (schema-enforced)

Only after stage 1 says yes. The message plus the app's vocabulary go to the
model with an Ollama `format` schema whose fields are **enums** where possible
(`kind`, `trigger`, `scope`). Per PROJECT_MEMORY 2026-07-20, an enum handed to
the model as `format` is grammar-enforced — it cannot emit an unlisted value, and
equally cannot emit anything the prompt asks for that the enum omits, so prompt
and enum get audited together.

For the example above the payload is a routine: name, one template per platform
mentioned, `trigger: 'manual'`, and the instruction text taken **verbatim from
the user** — the model chooses the *shape*, never rewrites the user's words.

### Stage 3 — every WRITE is a proposal card; reads answer directly

New `PROPOSAL_KINDS`: `routine.create`, `routine.update`, `todo.add`,
`todolist.run`, `schema.create`, `project.update`. `applyProposal` gains a branch
per kind that calls the same endpoint the UI calls.

**The card is the whole safety story, because the ambiguity is real.** "Do this
and add it as a todo" can mean *run it now and also save it*, or *just save it*.
Nobody can resolve that from the text, and guessing "run it" posts to a live
account. So the card offers the choice explicitly:

```
📋 Save as a routine — “Amazon best-seller → Facebook, Pinterest”
   1 input · 2 templates · manual trigger
   [ Save ]  [ Save and run now ]  [ Edit ]  [ Cancel ]
```

Reads (`what's on my todo list?`, `which schemas exist?`) need no card —
`answerIntrospection` already does exactly this for skills/elements/schemas and
just needs todos/routines added to its inventory.

## Hard parts

- **The dual-intent sentence** above. Resolved by the card, not by cleverness.
  Default the card's primary button to **Save** (the reversible one).
- **"Everything" is a big surface.** Deletes are the dangerous end: a mis-parsed
  "delete the facebook skill" costs taught work. Deletes always require the card
  AND name the exact object being removed; a name that matches nothing is
  reported, never guessed at.
- **A chat-created routine has no inputs.** The example yields a single-item
  routine; the topic rotation (`{topic}`) only appears if the user says so. Fine
  — the Todos editor is where you add inputs. Do not have the model invent them.
- **Reads must not go stale.** `answerIntrospection` builds its inventory at
  answer time; keep that (no caching) so a list is never wrong.
- **This must not become one classifier per feature.** Stage 1 stays a single
  pure module (`backend/app-commands.js`) with one table of object-nouns and
  verb-intents, so adding "projects" later is a table row plus a proposal kind.

## Phases

1. **Todos by chat, explicit only.** `/todo <instruction>` and `/routine …`
   create a `routine.create` / `todo.add` proposal. Card + apply. No NL detector
   yet — this alone makes the feature usable and is nearly risk-free.
2. **The trailing-clause detector** (`isAppCommand`, pure + unit-tested) so the
   user's natural phrasing works, wired in BEFORE `routeChat` like
   `isCorrectionMessage`. Plus the "and run it now" branch on the card.
3. **Reads:** todos/routines added to `answerIntrospection` ("what's on my list
   today?", "which routines do I have?").
4. **Run/trigger by chat:** "run today's list", "run item 3" → `todolist.run`.
5. **Schemas, projects, skills** writes through the same pipeline.

## Built (2026-07-28) — phase 1

- **`backend/app-commands.js`** — PURE, no model: `parseAppCommand` (`/todo`,
  `/todos`, `/routine`, `/routines`, `/repeat`, optional leading `"quoted name"`),
  `stripSaveClause`, `deriveName`, `describeCommand`. 38 unit cases, most of them
  the NEGATIVE ones — an ordinary message, a `/run`, a read question and the
  un-prefixed NL phrasing must all fall through untouched.
- **`server.js`** — `todo.add` + `routine.create` proposal kinds; `applyProposal`
  branches; `pushAppProposal` used by **both** entry points (`POST /tasks` for a
  `/todo` typed into an empty composer, `runChatTurn` for a follow-up) — routing
  that lives at only one entry point is a bug this repo has shipped twice.
  Checked FIRST, before host/launch/browse routing. Plus `selfPost` and
  `chatTodoList` (one "From chat — <date>" list per day, created on first use).
- **Renderer** — the proposal card grows a **Save & run now** button for these
  two kinds only; `decideProposal` takes `options`.
- Verified end-to-end on `:4010` (36 cases), including the hazard message from
  the Why: it now creates an idle session with a pending proposal, `status:'done'`
  and `plan:null` — nothing is planned and nothing runs.

### Decisions made while building

- **A chat-created routine is ALWAYS `trigger:'manual'`** and its template is
  `mode:'draft'`, regardless of what the sentence says. Turning on a schedule is
  a deliberate act in the Todos page. (Open question 1, resolved as proposed.)
- **The instruction is stored verbatim**, minus the trailing save clause. The
  clause is an instruction to US, not to the browser agent — leaving it in would
  tell the agent to go hunting for a todo button on the page. `stripSaveClause`
  is strict and refuses to blank a message that is *only* the clause, so the
  caller reports "say what the todo should do" instead of writing an empty todo.
- **`.` is excluded from the clause's leading separator class**, or the previous
  sentence loses its full stop ("do the thing. also add this as a todo").
- **Both buttons write; only one runs.** Declining writes nothing at all
  (asserted in the suite) — the card is the gate, not a formality.

## Open questions

*(1 and 2 resolved in the build — manual trigger, verbatim instruction.)*

3. Does the user want the `/todo` prefix to REMAIN once phase 2 lands, or should
   natural phrasing become the only path? (Keeping it is recommended: it is the
   escape hatch for when the NL detector says no.)
4. **Phase 2's detector needs a decision on ambiguity.** When the message reads
   like both a command and a browse request and the detector is unsure, does it
   card-and-ask, or fall through to browse? (Card-and-ask is safer; falling
   through is what happens today and is what runs live posts.)
