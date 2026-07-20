# Instruction Skills — skills written as prose, not taught as selectors

**Status:** DONE — all five phases built and tested (2026-07-19). Prose
instructions run end-to-end as ordinary tasks, a run that worked can be saved as
a skill, and a saved skill feeds its instructions + element hints back into
planning. 64 automated cases pass (7 finder, 18 descriptor/diagnosis, 22
save-request classification, 17 end-to-end against a real backend + Mongo).

**Verified on live Facebook**, not just fixtures: the full compose → Next →
Post → close flow ran from prose alone.

Kept here because it explains why element-teaching is no longer the primary
path. Open questions below are still open — they are follow-up decisions, not
unfinished work.

- **Done:** `findByDescriptor` / `resolveDescriptor` / `ascend` / `matchingElements`
  / `nearestTexts` / `describeMiss` in `extension/content.js`, with the
  `diagnosis` payload, alternates in `value`, and the `FIND_DESCRIPTOR` message
  + `globalThis.__baFind` console probe. 7/7 cases pass against Facebook-shaped
  markup (harness is scratchpad-only, jsdom, not committed).
- **Phase 2 done:** `click` / `hover` / `type` / `wait` take a `descriptor`
  param (`resolveTarget` in content.js — no descriptor means the old path, byte
  for byte). Misses carry `diagnosis` through `failureWithDiagnosis` into the
  event log and the `rethink` body, rendered by `describeDiagnosis` (server.js).
  `cleanDescriptor` validates descriptors from the model on BOTH paths —
  `normalizePlan` and `cleanParams`. Planner prompt documents the vocabulary.
  18 unit cases + 7 finder cases pass.
- **Phases 3–5 done:** `POST /tasks/:id/resolution` records each descriptor that
  resolved; `POST /tasks/:id/save-as-skill` promotes a **done** run into a
  `kind: 'instruction'` skill (prose + `hints[]`, no elements, no selectors),
  merging into an existing skill of the same name+host so hints improve rather
  than duplicate. `isSaveSkillRequest` + a `save_skill` class in `routeChat`
  stop "save this as a skill" being planned as a browser task.
  `planningSystemPrompt` presents an instruction skill as prose + reusable
  descriptors; `answerIntrospection` prints its instructions.
- **Deferred, on purpose:** skipping the 1/2/4/8s backoff when a miss is clearly
  structural (`scopeEmpty`) rather than a late render. Costs ~15s per genuine
  miss. Not worth the risk of cutting a legitimately-slow dialog short until
  there is evidence it matters.
- **Validated on live Facebook** (2026-07-19): composer entry `depth 2`, composer
  field `depth 0`, dialog Next button **`depth 5`** (`div[aria-label="Next"]`),
  and a deliberate miss on "Post" returned `nearest` listing the dialog's real
  controls. The finder works on real React markup.
- **`ASCENT_CAP = 8` has less headroom than assumed** — a real button was 5 hops
  above its text. Left at 8 (see PROJECT_MEMORY for why raising it is not free),
  but this is now a measured constraint, not a guess.

## Why

Teaching a skill today means picking elements in the learn overlay and storing
CSS selectors on `elements` docs. On React sites that is unreliable at the
source: class names are generated, `data-testid` is often absent, ids change per
render, and the structural fallback in `selectorFor()` (`div`, `span`) matches
thousands of nodes. The user's words: *"selecting elements and teaching skills
become nightmare … it may not hold the correct unique selector."*

The concrete failures already recorded in `PROJECT_MEMORY.md` are all the same
shape — the selector was not the problem the agent actually had:

- "Illegal invocation" — a taught element resolved to a wrapper DIV, not the
  editable node. A human instruction would have said *"the contenteditable div"*.
- `findField` typed into a feed **comment box** — no hint was carried, so it took
  the first editable in DOM order.
- Clicking "Post" hit *"Actions for this post by …"* — a text match with no
  notion of *"the button whose text is **only** Post"*.

Each was fixed with another heuristic. The heuristics are good, but they are
guessing at an intent the user could simply have stated. A human describing this
flow does not name selectors — they say:

> navigate to facebook, find the element containing "What's on your mind", that
> opens a popup, find the `contenteditable="true"` div, put the post text there,
> find the "Next" button with only "Next" inside, that goes to the "Post
> settings" step, find the "Post" button with only "Post" text, click it, wait 3
> seconds, close the tab.

That description is **more durable than any selector on that page**, because the
visible text is the part React re-renders identically. This plan makes that
description a first-class skill kind.

## Approach

**Run first, save second.** The prose is not authored into a skill up front — it
is given as an ordinary task goal and executed immediately. Only when the user
has watched it work does they say *"save this flow as a skill"*, and the run that
already succeeded becomes the skill. (User's call, 2026-07-19.)

This is the right way round for a reason worth writing down: a skill saved from
prose is a **guess** about a page, and it is only discovered to be wrong on the
next run — against a live account, where the failure mode is a wrong click or a
double post. A skill promoted from a trace is a **record** of descriptors that
resolved on the real DOM, on that page, minutes ago. It also means there is no
authoring UI to build before anything is usable: phase 1 is already the product.

### A skill is guidance, not a recording

**The saved skill does NOT skip planning.** (User's call, 2026-07-19.) Running
one still plans, still uses the model. What the skill supplies is *knowledge of
where things are* — the descriptors that were proven to resolve on this page, so
the finder has a short list of good candidates instead of searching the whole
DOM blind.

Replaying a fixed step list was the tempting version and it is wrong for the
same reason taught selectors are wrong: it assumes the page is what it was. A
stepped dialog that gains a screen, a button that moves, a variant A/B test —
any of these breaks a recording, and breaks it *silently*, mid-flow, after
side effects have fired. Guidance degrades instead: a hint that no longer
resolves costs a search, not a wrong click.

So double-post safety cannot come from determinism. It comes from where it
already does — `WANTS_APPROVAL`, the `DRAFT_STILL_OPEN` publish verification,
and the never-retry-after-a-side-effect rule. Those stay load-bearing.

A third skill `kind: 'instruction'`, alongside `action` (single element) and
`collection`. It stores:

- `instructions` — the user's prose, verbatim, the source of truth.
- `hints[]` — descriptors that resolved in the successful run, each with what it
  matched and at which point in the flow. Guidance for the finder, not a script.
- `provenance` — `{ taskId, at }` of the run it came from, so a skill that later
  misbehaves can be read against the run that proved it.
- **no `elements` refs, no `selectors`.**

### The finder DSL — the load-bearing part

Every step locates its target by a *descriptor*, not a selector:

```jsonc
{ "op": "click",
  "find": { "by": "exactText", "value": "Next", "tag": "button", "scope": "dialog" },
  "waitFor": true }
```

`by` covers exactly what people say out loud:

| `by`         | prose it comes from                        |
|--------------|--------------------------------------------|
| `text`       | "element which includes text X"            |
| `exactText`  | "button with **only** 'Next' text inside"  |
| `attr`       | "contenteditable=\"true\" div"             |
| `placeholder`| "the box that says 'Write something…'"     |
| `label`      | "the field labelled X"                     |
| `role`       | "the dialog / the menu item"               |
| `css`        | escape hatch, when the user knows one      |

`tag` narrows, `scope` (`page` | `dialog` | `within:<step id>`) constrains — the
existing `+50 in dialog` bonus in `scoreMatch()` becomes an explicit filter when
the user said the popup is open, instead of a guess.

**`value` accepts an array of alternates**, tried in order:
`{ "by": "exactText", "value": ["Next", "পরবর্তী"] }`. Text matching is
language-bound in a way selectors are not — a Facebook UI rendering in Bengali
matches nothing and the skill is simply dead. Copy changes and A/B tests do the
same thing more quietly. Alternates are nearly free in the schema now and
awkward to retrofit once hints and the planner prompt assume a string, so the
field is plural from day one even if only one value is ever filled.

`ops`: `navigate`, `click`, `type`, `press`, `read`, `wait`, `waitFor`,
`scroll`, `close_tab`. Page ops run in `content.js`; `navigate` / `close_tab` /
tab ops stay in `background.js` — the user's example spans both, so the runner
must too.

### Leaf-to-root resolution — search up from the text, not down from the root

The finder works **bottom-up**: start at the text nodes that match, then ascend
to the element that can actually be acted on. (User's design, 2026-07-19.)

Everything today searches top-down — `querySelectorAll('a,button,[role=button],…')`
walks from the root and then scores whatever it collected. That is backwards for
text-described targets, and it is the direct cause of two logged failures:
clicking "Post" matched *"Actions for this post by …"* (an ancestor whose text
merely *contains* the word), and a taught composer step resolved to a wrapper
DIV instead of the editable node ("Illegal invocation").

Bottom-up inverts both. "Button with only 'Next' inside" is precisely *a text
node whose content is `Next`* — the leaf is unambiguous. The ambiguity is only
ever about **how far up to go**, and that is a short walk with a clear stop
condition:

```js
// 1. collect leaves — TreeWalker(SHOW_TEXT), match value, skip hidden/script
// 2. from each leaf, ascend parentElement, at most ~8 levels
// 3. stop at the first ancestor that is actionable for this op:
//    click → button,[role=button],a,[onclick],[role=menuitem],[tabindex]
//    type  → input,textarea,[contenteditable=true]
// 4. score: nearest actionable ancestor wins; tie-break on the existing
//    scoreMatch() signals (short label, in-dialog, real control)
```

The depth cap is what stops the ascent from reaching `<body>` and clicking the
page. The "nearest wins" rule is what makes *"only 'Next' text inside"* mean
what the user means — the tight button, not the panel containing it.

**On "binary search tree":** the idea is right, the name isn't, and it matters
because whoever implements this will act on the word. The DOM is an n-ary tree
and is not sorted on the thing being searched, so binary search does not apply —
there is no halving step and no ordering to exploit. What is described here is a
**leaf-to-root ascent** over matched text nodes. That is the operation worth
building; it is fast for the reason binary search is fast (it visits a path, not
the tree), just by a different mechanism. `TreeWalker` over text nodes is one
linear pass, and each ascent is ≤8 hops.

This also cheapens the whole search: text nodes are a far smaller set than "all
elements", and the match is an equality/substring test rather than a scored
sweep of every control on a Facebook page.

### A miss must report its work, then re-analyze the DOM

Two halves, and the second one **already exists** — do not rebuild it.

**Half 1: the finder explains itself.** `no element for Next` is useless: you
cannot tell whether the text differs, the ascent stopped on the wrong node, or
the dialog had not rendered. With a selector you at least knew exactly what was
looked for; a text finder that reports nothing is *worse* to debug than the
selectors this plan replaces. So every miss returns a structured `diagnosis`:

```jsonc
{ "searched": { "by": "exactText", "value": "Next", "scope": "dialog" },
  "leavesMatched": 0,          // text nodes that matched at all
  "nearest": ["Next step", "Continue", "Done"],  // closest text on the page
  "ascentRejected": [],        // leaves found but no actionable ancestor within cap
  "scopeEmpty": true,          // asked for a dialog; no dialog was open
  "retries": 4 }
```

Each field maps to a different real cause: `leavesMatched: 0` + `nearest` means
the copy changed (or the UI is not in English — see the localization question).
`ascentRejected` non-empty means the text was there but the **depth cap or the
actionable predicate is wrong** — the single most likely bug in this design, and
this field is what makes it visible instead of mysterious. `scopeEmpty` means the
previous step did not actually open what it claimed to.

This goes to the user in the event log *and* into half 2 as input.

**Half 2: re-analyze and decide — via the existing `rethink`.** `PAGE_SNAPSHOT`
and `POST /tasks/:id/rethink` are already the think→act→observe→think loop:
failure-gated, given the goal, what ran, the failure and a live page snapshot,
returning `replace` / `skip` / `abort`, capped at `MAX_RETHINKS = 3`. The work
here is not new machinery, it is **better input** — today rethink sees a bare
error string, and is expected to guess. Feed it the `diagnosis` and it stops
guessing: `nearest: ["Next step"]` alongside the snapshot is the difference
between inventing a selector and picking the button that is actually there.

Three constraints carried over from `PROJECT_MEMORY`, all learned the hard way:

- **Publish steps are still never rethought on an ambiguous outcome.** Asked to
  recover from "unclear whether the post was published", the model invented a
  composer URL and tried again. A richer diagnosis does not change this: retry a
  publish step only on POSITIVE evidence nothing happened (`leavesMatched: 0`,
  still in the composer). Otherwise abort. **Do not delegate double-post safety
  to the model** — not even a well-informed one.
- **`MAX_RETHINKS = 3` stays.** A finder that reports well makes each attempt
  better, not unlimited.
- **`cleanParams` still applies.** The model returned `{selector:"Post"}` once —
  a label in the CSS field. Descriptors must be validated against the `by` enum
  on the way back in, same as any other model output.

### Where the model still sits

Every run plans, with the skill's `instructions` and `hints[]` as context:

1. **Plan** — the model reads the goal plus the skill and emits phases, as it
   does now. A skill makes this *better informed*, never skipped.
2. **Resolve** — each phase's target is found leaf-to-root, preferring a `hint`
   that still resolves, falling back to a fresh search when it does not.
3. **Record** — what resolved, and what it matched, goes on the task.
4. **Promote** — `POST /tasks/:id/save-as-skill` turns a completed run's record
   into a skill, or **merges** into the existing one: a hint that resolved again
   gains confidence, one that stopped resolving is replaced by what worked
   instead. So the skill gets better every run rather than going stale.

Rejected alternative: **a saved skill replays its steps with no model at all.**
Faster and perfectly repeatable — and brittle in exactly the way taught
selectors are, because it assumes the page has not changed. It also fails
*silently mid-flow*, after side effects, which is the worst place to fail.
Guidance that no longer resolves costs a search; a recording that no longer
matches costs a wrong click.

Rejected alternative: **an LLM call per step at run time.** A 7B is 10–30s per
decision and this flow is eight steps — minutes of deliberation for a page whose
text is right there. Planning once per run, then resolving deterministically, is
the middle position this plan takes.

Failure-gated `rethink` stays exactly as it is — it is already the right
mechanism for "the page is not what we expected".

### Retry and safety (CLAUDE.md invariants — do not break)

- Every descriptor resolves through `withBackoff(find)`. This is the whole
  reason "then it will open a popup form" needs no explicit wait — a step whose
  target is not there yet retries 1/2/4/8s. `waitFor: true` extends to the 30s
  `wait` budget for genuinely slow transitions.
- Miss errors must read `no element for …` / `not found`, so `executeLoop`'s
  `TRANSIENT` regex retries the phase.
- **Never retry after a side effect.** A step that already clicked/typed is
  never re-run — the runner tracks the last committed step index.
- Steps whose op is a click on a publish word inherit the existing
  `DRAFT_STILL_OPEN` verification. A compiled skill is not a reason to trust a
  click.

### Values flow in as placeholders

`type` steps carry `{{post_text}}`-style placeholders filled from the phase
params or an earlier `generate_text` — same source resolution `run_skill`
already uses. Keeps one skill reusable across posts.

## Hard parts

*(Two of these were already hit during phase 1 — see the notes inline.)*

0. **Found in phase 1, worth not re-breaking.** (a) Split sibling text needs
   climbing to an ANCESTOR — testing the leaf's own element finds nothing,
   because `<span>Post</span><span>settings</span>` puts the combined text one
   level up. (b) `nearestTexts` must NOT filter by similarity: when the copy
   changes to something unrelated, nothing resembles the target and a filtered
   list comes back empty — discarding the only useful diagnostic.
1. **Where the ascent stops.** The whole design rests on it. Stop too early and
   the click lands on a `span` and nothing happens — the classic "found it but
   it did nothing". Stop too late and you click a panel, or `<body>`. Depth cap
   plus a per-op actionable predicate is the proposal; the cap value wants
   testing against a real Facebook composer, not picking from theory.
   **Second-guess this one first** if a run finds the right text and still does
   nothing.
2. **Text split across nodes.** React routinely renders a label as several text
   nodes (`Post` + zero-width spans, or an icon between words), so a `SHOW_TEXT`
   walker looking for `"Post settings"` can miss it entirely. Mitigation: match
   against the parent element's normalized `textContent` once the leaf's own
   text is a *prefix* of the target. Cheap, and it is the common case.
3. **Hints that resolve to the wrong thing.** A stale hint that still matches
   *something* is more dangerous than one that matches nothing — it produces a
   confident wrong click. Hints must be re-verified against the descriptor (does
   this node still have the text we recorded?), never trusted on position alone.
4. **Planner quality on a 7B.** The model must emit descriptor phases with a
   fixed `by` vocabulary. Small models do this acceptably only with a tight
   schema and examples. Validate against the enums server-side and re-ask once
   on a violation (same pattern as `/ai/codegen`).
5. **Scope tracking.** "then it will navigate to next 'Post settings' step" is a
   scope change, not an action. The planner should emit `waitFor` on a text
   marker ("Post settings") so the next step cannot fire on the previous screen.
6. **Planner integration.** `planningSystemPrompt` must present instruction
   skills as `run_skill`, and `insertSkillNavigations()` must keep working —
   though an instruction skill usually contains its own `navigate`, so the
   inserted hop needs deduping against step 1.
7. **"Perfectly" is the user's judgement, not the agent's.** `PROJECT_MEMORY`
   records the agent reporting "Task complete" on a run that reused the wrong
   tab, scrolled for an instant and never closed anything. So promotion is
   offered but never automatic, and the offer must show **what the run actually
   did**, step by step with what each step matched — not a success banner. If
   the user says save after a run that half-worked, that is their call; the
   trace is what they are approving.

## Phases

1. **The finder, alone — including its diagnosis.** `findByDescriptor()` in
   `content.js`: `TreeWalker` leaf collection → ascent → actionable predicate →
   scoring, behind `withBackoff`, returning either a node **or a populated
   `diagnosis`**. The diagnosis is not a phase-6 nicety: `ascentRejected` is how
   you find out the depth cap is wrong, and you need it while testing the ascent,
   not after. Alternates (`value: []`) land here too. No skills, no planner, no
   LLM — exercise it from the console against a real Facebook composer with the
   six descriptors from the user's example. **If the ascent is wrong, nothing
   built on top of it can work**, so it ships and gets tested by itself.
2. **Descriptor phases + recovery wiring.** Teach `click`/`type`/`wait` to accept
   a descriptor alongside today's `selector`/`text` params, resolving through the
   new finder. Backwards compatible: existing phases keep their current path.
   Carry the `diagnosis` up through `background.js` into the event log and into
   the `rethink` payload — the recovery loop itself is already built, this is
   plumbing plus a prompt change telling the model what the new fields mean.
   Re-check the publish-step guard still holds with a diagnosis present.
   At the end of this phase the user's prose runs end-to-end as an ordinary task
   — the thing they actually asked for. Everything after is about keeping it.
3. **Record + promote.** Store per-phase resolution outcomes on the task; add
   `POST /tasks/:id/save-as-skill` creating `kind: 'instruction'` with
   `instructions` + `hints[]`, and merging into an existing skill on re-save.
   Route it through the approval-gated `applyProposal()` — already the only path
   that writes skills on the agent's behalf, an invariant worth not breaking.
4. **Recognise the ask.** "save this flow as a skill" must not be planned as a
   browser task. `isIntrospection()` is the wrong gate (it is read-only); this
   needs its own intent check plus a `routeChat` class. `PROJECT_MEMORY` records
   two separate incidents of a meta-request being executed as a browser task —
   once it ran the Facebook posting skill against the live account. Two gates,
   same as introspection got.
5. **Feed hints back into planning.** `planningSystemPrompt` presents an
   instruction skill's prose + hints; `answerIntrospection` prints
   `instructions`; `repairPlan` dedups the navigate hop.

## Open questions — need the user's decision

- **Does this replace element-teaching, or sit beside it?** The learn overlay,
  `elements` docs and skills-v2 refs are a lot of surface to keep alive for a
  mechanism you have described as a nightmare. Recommendation: keep v2 working
  (existing skills must not break), build no new features on it, and revisit
  deletion once an instruction skill has posted to Facebook successfully.
- **Who fills in the alternates?** The schema takes them from day one, but
  nothing populates a second language. Options: the user writes both; the model
  proposes one when a run fails with `leavesMatched: 0` and the page is not in
  English; or the finder matches on the page's `lang` attribute and asks. Not
  urgent unless you actually browse Facebook in Bengali — worth answering, since
  it changes whether alternates are a real feature or dead schema.
- **Do hints ever expire on their own?** A hint that fails to resolve twice in a
  row is probably dead weight that costs a search every run. Dropping it
  automatically is a write to the agent's own memory, which by existing
  convention needs approval. Suggestion: keep them, mark them stale, surface it
  on the skills page rather than deciding silently. Decide when phase 3 lands.
- **Which UI for reviewing a run before saving?** `PROJECT_MEMORY` records the
  desktop-app pivot — extension is executor-only — so the step-by-step review
  belongs in `desktop-app/`. Confirm before phase 3.
