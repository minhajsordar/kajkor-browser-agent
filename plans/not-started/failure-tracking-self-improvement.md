# Failure tracking + a self-improvement loop that closes

**Status:** NOT STARTED — design only. Nothing below is built. Written after a
review pass that fixed the security and observability gaps (see PROJECT_MEMORY
2026-09-18) and found that the *learning* half of this agent records outcomes but
never acts on them.

## Why

The user's ask is a *"perfect AI agent with proper issue tracking + self
improvement"*. The pieces for that already exist and are individually good — but
the loop does not close, and the gap is invisible unless you go looking:

1. **Failures are per-task and then forgotten.** `POST /tasks/:id/error` pushes
   into `task.errors[]`. There is no aggregate, so *"the Post button on
   facebook.com has failed 9 times this week"* is unanswerable without opening
   nine task documents by hand. PROJECT_MEMORY is full of entries that were only
   found because the user happened to read one event log
   (`clicked Add to your post` → the 2026-07-19 fixed-position `offsetParent`
   bug). That is the discovery mechanism today: luck plus a human reading logs.
2. **Lesson effectiveness is counted and never read.** `attributeLessonOutcome`
   increments `successCount` / `failCount` on every lesson injected into a round
   (`lessons.attributionFor`, wired at server.js ~3439). Nothing consumes those
   counters. `selectLessons` ranks by `createdAt` only — so a lesson with 1
   success and 12 failures keeps being injected into prompts forever, and it
   outranks a proven one merely by being newer.
3. **Learning needs a human to start it.** Every improvement path
   (`element.repoint`, `skill.update`, `lesson.create`) begins with the user
   filling in the feedback dialog. A failure the user never reports teaches the
   agent nothing, and the most common failure — an element that silently moved —
   is exactly the one a user shrugs at and retries.

So: the agent has a memory and an approval gate, but no *sense of its own
reliability*. This plan adds that, and deliberately stops short of letting it act
on it unsupervised.

## Approach

### Phase 1 — an `issues` collection (aggregate the failures we already have)

One document per **recurring failure signature**, not per occurrence:

```
{ issueId, signature, host, tool, kind, message,
  count, firstSeenAt, lastSeenAt,
  taskIds: [...last 20],
  status: 'open' | 'fixed' | 'ignored',
  fixedBy: { kind: 'element.repoint', id } | null }
```

`signature` is the load-bearing decision: it has to collapse *the same problem*
without collapsing *different problems*. Proposal:
`host + tool + normalised message`, where normalising strips quoted values, ids,
counts and urls (`no element for "Post"` and `no element for "Share"` are the
same signature; a CSP failure on one site is not the same as one on another).
Computed in a **pure module** (`backend/issues.js`) so it is unit-testable — the
same reason `todos.js` / `lessons.js` / `http-guard.js` are separate files:
`require('./server.js')` boots Mongo and calls `app.listen`.

Written from the ONE place failures already funnel through
(`POST /tasks/:id/error`), so nothing else can create a divergent path — the
lesson of "one-entry-point routing is a bug this repo has shipped twice" applies
in reverse here: this time make sure there is genuinely only one entry point.

Read side: `GET /issues?host&status`, and an **Issues** tab in the desktop app
next to Feedback. That alone changes the debugging story from "read nine event
logs" to "sort by count".

### Phase 2 — reliability-weighted lesson selection

Make `selectLessons` consider the counters that already exist:

- Drop a lesson whose `failCount >= 3` and `failCount > successCount * 2` —
  it is actively hurting. Mark it `active: false` with a reason, do not delete
  (the user must be able to see what was retired and why).
- Rank survivors by a simple ratio, then recency — never recency alone.

Pure, in `lessons.js`, and therefore covered by the suite that now runs
(`npm test`). No new data is needed: this is reading what phase 4 of
feedback-learning has been writing all along.

### Phase 3 — the agent proposes fixes for its OWN top issues

When an issue crosses a threshold (say `count >= 3`, `status: 'open'`), the agent
may raise ONE approval-gated proposal for it — reusing `PROPOSAL_KINDS` and
`applyProposal` exactly as it does today. Never a write, never a silent repoint.
The card says *"this failed 5 times on facebook.com; repoint the element to X?"*

Hard limits, enforced in code and not in the prompt:

- **One open proposal per issue.** Otherwise a flapping selector fills the
  transcript with cards, which trains the user to click Approve without reading —
  the failure mode that makes an approval gate worthless.
- **A declined proposal marks the issue `ignored`,** and it never re-proposes for
  that signature. A gate the user has to re-decline is a nag.
- **No proposal may widen scope** — the rule already written down for the unbuilt
  `decide` step: it may fix a selector or edit a skill, never add a template,
  raise a cap, or flip `draft` → `auto`.

### Phase 4 (only if 1–3 prove out) — a reliability read-out

`GET /health/agent`: per host, tasks run / done / errored, open issues, retired
lessons. This is what makes "is it getting better?" a question with an answer
instead of a feeling.

## Alternatives rejected

- **Let the model summarise failures into lessons automatically.** Rejected: a
  7B writing its own rules from its own failures, with no human in the loop, is a
  drift machine — and this repo has already paid twice for trusting a small model
  with a classification decision (`feedback-triage.isCorrectionMessage` and the
  `browse` mis-route that re-ran a posting flow on a live account). Aggregation
  must be deterministic; the model may only *fill in* a proposal.
- **Auto-repoint an element when a click fails.** Rejected: the 2026-07-19 bug
  was the finder matching the WRONG element ("Add to your post" instead of
  "Post") and reporting success. An auto-repoint in that situation would have
  written the wrong selector into the shared knowledge base and broken every
  skill using it. Repointing heals every dependent skill — which is exactly why
  it must stay behind approval.
- **A generic APM / error-tracking dependency.** Rejected: the useful signature
  here is domain-specific (host + tool + normalised finder message), the data
  already lives in Mongo, and adding a service to a local-first tool that drives
  the user's logged-in accounts means shipping their page context off-machine.
- **Retry harder instead.** Already done and already at its limit — the
  `withBackoff` / `TRANSIENT` retry rule handles *not rendered yet*. Everything
  this plan is about is the class of failure where retrying is guaranteed to fail
  identically (the `have === 0` "not repeating" guard exists for exactly that).

## The hard parts

1. **Signature normalisation** is the whole design. Too coarse and every failure
   on a site becomes one issue; too fine and nothing ever reaches `count >= 3`.
   This needs a corpus: run it read-only over existing `task.errors[]` first and
   look at the grouping before any proposal logic is written.
2. **A failure is not always a bug.** The user declining a confirmation, or
   stopping a task, is a clean stop — `executeLoop` already distinguishes those
   and this must not count them. `lessons.attributionFor` already models exactly
   this three-way (success / failure / neither); follow it.
3. **Proposal fatigue** is the real risk to the safety model, not a technical
   one. See the limits in phase 3.
4. **Issues can be fixed by something else entirely** (a code fix, a site
   redesign). An issue must be able to go quiet on its own: if a signature has
   not recurred in N days, mark it `fixed` rather than leaving it open forever.

## Open questions for the user

1. **Should the agent raise issue-fix proposals unprompted**, or only when you
   open the Issues tab and press *Analyze* (which is how Feedback works today)?
   Unprompted closes the loop without you noticing failures; prompted keeps the
   transcript clean. Recommendation: start prompted, exactly like Feedback.
2. **Retire a harmful lesson silently, or ask first?** Recommendation: retire
   automatically (it is reversible and the alternative is a known-bad rule going
   into prompts), but always show it in the UI as retired-with-reason.
3. **Is a failure count per host enough**, or do you want it per *project* too?
   Per-project matters if the same site is used for different work.
