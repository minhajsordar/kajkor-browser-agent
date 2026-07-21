# Feedback learning — the agent learns from user corrections

**Status:** DONE — all four phases built + tested, and the feedback review-list
page (the last nice-to-have) is now built too. **Drafted:** 2026-07-19 ·
**Phase 1:** 2026-07-20 · **Phases 2 + 3 + 4:** 2026-07-21 · **Review page:**
2026-07-21.

**Open question RESOLVED (2026-07-21): SITE-SCOPED by default.** The feedback
dialog already defaults to "This site only", so a lesson inherits the host it
came from unless the user widened it to a task-type or Everywhere. Keeps a
Facebook quirk out of a research plan; the user can still choose global.

## Build progress

- **Phase 1 done** (`backend/server.js` + desktop): a `feedback` collection;
  `POST /tasks/:id/feedback` captures a correction on a **specific round**
  (user's call — a session has many rounds, only one went wrong) with context
  scoped to THAT round: its `instruction`, its `messages` (last 6 turns), its
  `events` (that round only), plus the session goal/host/plan tools and a scope
  (host/skill/tool/task-type/global, unknown → global). Optional `messageAt`
  pins the exact assistant message. `GET /feedback` (filter host/status) and
  `DELETE /feedback/:id`. Items start `status: 'open'` — phase 2 acts on those.
  Desktop: a per-round 👍/👎 pair in the transcript, **left-aligned** (NOT a
  session-level button — fixed after the first cut). 👎 opens `FeedbackDialog.vue`
  (what went wrong / what should have happened / scope) →
  `sessions.submitFeedback(round, messageAt, …)` posting `kind:'down'`. 👍 is a
  one-click like → `sessions.likeRound(round, messageAt)` posting `kind:'up'`
  (no form — a positive example needs no "what went wrong"; the icon fills and a
  toast confirms). Both round-builders (`roundsByIndex`/`roundsByTime`) carry a
  `round` number. Backend `kind`: `up` (no `whatWrong` required, stored as a
  positive example with the same round context) | `down` | `note`.
  18 integration cases pass; renderer typecheck clean. **No behaviour change yet
  — this only collects examples** (both wins and corrections), exactly as the
  plan intends before the risky tiers.
- **Phase 2 done** (`backend/feedback-triage.js` + `server.js` + desktop): a
  correction becomes an approval-gated proposal.
  - **Pure module `backend/feedback-triage.js`** (no DB/model — unit-testable):
    `TRIAGE_FORMAT` (grammar), `buildTriageMessages`, and `proposalFromAnalysis`
    which VALIDATES the model's triage against the real candidates and returns a
    proposal in the exact `POST /propose` shape, or `{error}`. Split out because
    `require`-ing server.js boots Mongo + listens (the desktop embeds it), so the
    logic had to leave server.js to be testable. 20 unit cases.
  - **`POST /feedback/:id/analyze`**: gathers the host's skills+elements
    (`feedbackCandidates`, capped/compact — names+ids, never HTML), resolves the
    model (`resolveModel`, handles `auto`), runs the triage, and on an actionable
    result PUSHES the proposal onto the feedback's task — same `proposals[]` +
    `applyProposal` approval path as a live recovery. Marks the feedback
    `triaged` (+ `proposalId`). `POST /feedback/:id/dismiss` for the review page.
    9 endpoint-guard cases (like→400, no-candidates short-circuit, 404s, dismiss).
  - **Honest scope:** three fix kinds — `skill.reorder` (permutation-checked: a
    reorder may NOT drop/add a step — the key data-loss guard), `skill.edit`
    (clarify `details`), and `element.repoint` **only when the correction names a
    concrete selector** (a text-only pass can't invent a selector for a page it
    never saw). Anything else → `none`, stays for review. Prefer none over a guess.
  - **Desktop:** sending a 👎 correction now calls `analyzeFeedback` right after;
    a fix proposal (if any) appears in the transcript's existing proposal banner,
    with a toast ("Suggested a fix — review it below" / "saved for review").
- **Phase 3 done** (`backend/lessons.js` + `server.js` + desktop): non-data
  corrections become **scoped lessons injected into prompts**.
  - **Pure module `backend/lessons.js`** (unit-testable, 16 cases): `lessonMatches`
    (host/task-type/tool/global), `selectLessons` (matching + newest-first +
    HARD caps: ≤5 lessons, ~600 chars — an over-budget lesson simply does not
    load), `formatLessons`, and `supersededIds` (Jaccard ≥0.3 within the same
    scope, so a refinement REPLACES rather than accumulates).
  - **Triage `lesson` kind** (feedback-triage.js): the model distills a one-line
    rule; the SCOPE comes from the user's dialog choice, NOT the model
    (`lessonScopeFrom`, defaults site). Site-scope with no host → rejected.
  - **`lesson.create` proposal** (added to `PROPOSAL_KINDS`): a lesson is written
    only via the SAME approval gate as data fixes. `applyProposal` inserts the
    lesson and supersedes near-duplicates in its scope. The `analyze` endpoint no
    longer short-circuits on "no candidates" — a lesson needs none.
  - **Injection**: `injectLessons(ctx)` loads matching active lessons, bumps an
    `injectedCount` (phase-4 groundwork), returns a capped block. Wired into the
    **planner** (host + global) and **synthesize** (research task-type + global).
    `generate_text`/`/ai/generate` is NOT wired (it gets no host from the
    extension) — the planner covers post-length via `generate_text.words` anyway.
  - **Desktop**: a "Learned lessons" pane in Settings lists active lessons (scope
    + use count) with delete — a bad lesson injects into every matching prompt,
    so removing one must be one click. `GET /lessons`, `DELETE /lessons/:id`.
- **Phase 4 done** (`server.js` + `lessons.js` + `feedback-triage.js` + desktop):
  - **Effectiveness tracking.** `injectLessons` now returns the injected ids;
    `planTask` stamps `task.pendingLesson = {round, lessonIds}` and `synthesize`
    merges into it. When a round hits a terminal status, the PATCH `/tasks/:id`
    hook calls `attributeLessonOutcome` → `lessons.attributionFor(task)` (PURE:
    done→`successCount`, error→`failCount`, stopped→clear only), then $unsets the
    stamp so a repeated terminal PATCH can't double-count. Settings shows "N% ok"
    and flags a lesson below 50% in red.
  - **Natural-language capture.** `feedbackTriage.isCorrectionMessage` (PURE,
    STRICT, no LLM — the plan's own caution: classifiers misfired twice here) only
    fires on a PAST-referring correction ("that was wrong", "you should have…"),
    never a fresh command ("go to twitter instead"). In `runChatTurn`, before
    `routeChat` and guarded by "the previous round actually ran", a match records
    feedback (source `nl`) on the previous round and runs the SAME
    `runFeedbackAnalysis` as a 👎 — so a typed correction can become a proposal
    too, instead of being re-planned as a browser task (which would re-post).
  - **Refactor:** the feedback endpoint and analyze endpoint were split into
    reusable `buildFeedbackDoc`/`recordFeedback` and `runFeedbackAnalysis` so the
    button path and the NL path share one tested pipeline.
- **Review page done (2026-07-21):** `desktop-app` gains a **Feedback** tab
  (`pages/FeedbackView.vue` + `stores/feedback.js` + route + App.vue tab). Lists
  every captured item newest-first with status/host filters; per-item **Analyze**
  (→ `runFeedbackAnalysis`, posts an approval-gated proposal into that session —
  hidden once `triaged`), **Dismiss** (keeps the record, flips status), and
  **Delete**. Reuses the existing `GET /feedback?host&status`,
  `POST /feedback/:id/analyze|dismiss`, `DELETE /feedback/:id` — no backend
  change. Likes (`kind:'up'`) show as "Marked correct" with no Analyze (nothing
  to fix). Everything in this plan is now built.

Let the user correct the agent and have those corrections durably change
behaviour — not just be acknowledged in chat.

---

## Why

Every failure this session followed the same pattern: the agent did something
wrong, the user explained what was wrong, and a human (Claude) edited code to
fix it. Nothing the user said changed the system by itself.

Concrete cases that should have been learnable:

- clicked "Actions for this post by…" instead of the composer's Post button
- typed a post into a feed **comment box** instead of the composer
- the taught Facebook skill has its steps in the wrong order (submits before
  typing) — visible to the user, but only fixable by hand
- read only 1 source when researching, because a count was misparsed

## The core question: where can feedback actually land?

Feedback only matters if it durably changes behaviour. There are exactly three
destinations, with very different properties:

| Destination | Example | Durability | Ongoing cost |
|---|---|---|---|
| **Data** (elements, skills) | "wrong Post button", "steps out of order" | permanent, exact | none |
| **Prompt guidance** (lessons) | "keep posts under 100 words" | soft — the model may ignore it | tokens on every call |
| **Code / policy** | "never ask approval before posting" | absolute | needs a developer |

The common failure of "AI learns from feedback" features is dumping everything
into the middle bucket. With a local 7B model there is roughly a **1–2k token**
guidance budget before planning quality degrades, and vague lessons ("be more
careful") change nothing while consuming that budget forever.

## Approach: two tiers, structured-first

### Tier 1 — feedback that becomes DATA (preferred)

When feedback maps to a concrete fix, convert it and write it to the database.
Highest value, zero ongoing prompt cost, exactly repeatable, and inspectable in
the Skills/Elements pages.

| Feedback | Becomes |
|---|---|
| "you clicked the wrong Post button" | `element.repoint` — heals every skill using it |
| "the FB skill steps are in the wrong order" | `skill.update` reordering the element refs |
| "this element is stale" | `element.repoint` with a fresh selector |

Reuses the **existing proposal system** (`POST /tasks/:id/propose`,
`applyProposal`) — so every write still waits for explicit approval.

### Tier 2 — feedback that becomes SCOPED GUIDANCE

Genuine preferences that cannot be encoded as data:

| Feedback | Scope |
|---|---|
| "keep Facebook posts under 100 words" | `generate_text` + facebook.com |
| "when researching, read at least 5 sources" | planner + research tasks |
| "prefer my taught skill over guessing clicks" | planner + host |

**Scoping is the critical decision.** A flat list injected into every prompt is
what makes these systems rot. Each lesson carries a scope (host / skill / tool /
task-type) and only matching lessons load — Facebook lessons never pollute a
research plan.

## Capture

**Primary: explicit.** A 👎 / "Teach" control on a round in the transcript,
opening a small form: what went wrong, what should have happened. It is captured
WITH the round's context (goal, plan, events, what was clicked) — that context is
what makes the feedback actionable later.

**Later: natural language** ("no, that was wrong — you should have used my
skill"). Deliberately deferred: intent classifiers have misfired twice in this
project (the introspection regex missed "that skill"; the planner routed a
question into a posting task). Prove storage and retrieval first.

## The genuinely hard parts

- **Conflict and staleness.** Feedback contradicts itself over time ("shorter
  posts" → later "add more detail"). Lessons are versioned per scope, newest
  wins, and a new lesson **supersedes** rather than accumulates — old versions
  kept visible for history.
- **Retrieval budget.** Hard cap: top 5 lessons per scope, ~600 chars total,
  most recent first. If it does not fit, it does not load. Three lessons applied
  reliably beat twelve applied unreliably.
- **Did it help?** Each lesson records how often it was injected and whether
  those rounds succeeded. Cheap, and the only way to spot lessons that hurt.

## Phases

1. **Capture + storage** — the control, the form, a `feedback` collection with
   scope, and a page to review/delete. No behaviour change yet; starts
   collecting real examples.
2. **Tier 1: feedback → proposals** — an LLM pass turns "wrong button / wrong
   order" into an `element.repoint` or `skill.update` proposal, approval-gated
   as today. **DONE** (2026-07-21) — see the Phase 2 build note above.
3. **Tier 2: scoped lessons in prompts** — inject matching lessons into planner
   / synthesize / generate_text, with the caps above. **DONE** (2026-07-21) —
   planner + synthesize wired; see the Phase 3 build note above.
4. **Effectiveness tracking + NL capture** — only once 1–3 are proven. **DONE**
   (2026-07-21) — see the Phase 4 build note above.

**Recommended start: phases 1 + 2.** Tier 1 gives durable wins with no prompt
cost and reuses the approval gate. Phase 3 carries most of the risk and will be
far better designed against a dozen real feedback items than against
hypotheticals.

## Open question — RESOLVED 2026-07-21: site-scoped by default

Decided: a Tier 2 lesson is **site-scoped by default** (recommended option). The
feedback dialog defaults to "This site only"; the lesson inherits that host. The
user can still widen a lesson to a task-type or Everywhere per correction. This
keeps prompts lean and stops a Facebook quirk leaking into research tasks, while
leaving global rules ("always be concise") a one-click choice.

## What to avoid, and why

- **Fine-tuning a local model** — wrong tool at this scale, and it destroys the
  inspectability that makes Tier 1 valuable.
- **Storing raw transcripts as "memory" retrieved by embedding similarity** —
  it retrieves *narrative*, not *rules*. With a 7B model that mostly adds noise.
