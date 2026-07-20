# Feedback learning — the agent learns from user corrections

**Status:** not started · **Drafted:** 2026-07-19

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
   as today.
3. **Tier 2: scoped lessons in prompts** — inject matching lessons into planner
   / synthesize / generate_text, with the caps above.
4. **Effectiveness tracking + NL capture** — only once 1–3 are proven.

**Recommended start: phases 1 + 2.** Tier 1 gives durable wins with no prompt
cost and reuses the approval gate. Phase 3 carries most of the risk and will be
far better designed against a dozen real feedback items than against
hypotheticals.

## Open question (needs the user's call)

Should a Tier 2 lesson apply **globally by default**, or **only to the
site/skill it came from**?

- Site-scoped (recommended): keeps prompts lean, stops a Facebook quirk leaking
  into research tasks.
- Global-by-default with opt-in narrowing: better if most feedback is general
  style ("always be concise").

## What to avoid, and why

- **Fine-tuning a local model** — wrong tool at this scale, and it destroys the
  inspectability that makes Tier 1 valuable.
- **Storing raw transcripts as "memory" retrieved by embedding similarity** —
  it retrieves *narrative*, not *rules*. With a 7B model that mostly adds noise.
