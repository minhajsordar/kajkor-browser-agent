# Project Memory — kajkor-browser-agent

Running record of what exists, what was decided, and why. Read this before
planning work; **update it whenever you add a feature or change behaviour**
(see the rule in `CLAUDE.md`). Newest entries first.

`CLAUDE.md` holds the invariants you must not break. This file holds the
history and reasoning behind them — the "why" and the "what's already there".

---

## Capabilities

### 2026-07-21 — Desktop UI finish: project inheritance UX, saved-prompt picker, Feedback page
Three code-buildable remainders from the partially-done plans (live GUI
click-through in the Electron app is the only thing left on each). All
renderer-side; NO backend change (every endpoint already existed).
**Compile-verified:** `electron-vite build` transforms all 279 renderer modules
clean, so the Vue is sound — but there is no vue-tsc/eslint-vue here, and a build
does not exercise runtime behaviour, so the actual click-through is still human.
- **Composer inheritance UX** (`plans/.../project-settings.md` phase 3): a caption
  under the new-session composer (`ChatThread.vue` `projectHint`) reads "Model &
  skills from project X" when the composer matches the project's defaults, or
  "Overriding X's defaults this session · Reset to project" once the user changes
  the model/skills. Compares `store.model`/`store.newSessionSkillIds` vs
  `projects.current.settings`; Reset re-runs `projects.applySettings`. Shown only
  for a backend-backed project that sets a model or skills.
- **Saved-prompt picker** in `ProjectSettingsDialog.vue` (finishes project-settings
  phase 2): the dialog now sets `settings.promptId` (a reusable named prompt from
  `/prompts`), not just the inline `systemPrompt`. `promptId` was ALREADY
  whitelisted + used ahead of the inline text at `POST /tasks` — nothing set it.
  The inline field disables and says "not used" while a saved prompt is picked, so
  the precedence (`promptId` > inline) is visible, not silent. Dialog loads
  `/prompts` itself (prompts aren't in the library store).
- **Feedback review page** (feedback-learning's last nice-to-have): a **Feedback**
  tab — `pages/FeedbackView.vue` + `stores/feedback.js` + route + App.vue tab.
  Lists captured feedback newest-first with status/host filters; per-item Analyze
  (posts the approval-gated proposal into that session; hidden once `triaged`),
  Dismiss, Delete. Likes show as "Marked correct" with no Analyze. Reuses
  `GET /feedback?host&status`, `POST /feedback/:id/analyze|dismiss`,
  `DELETE /feedback/:id`.

### 2026-07-19 — "Task complete" on a post that was never published
Event log of a real run: the final publish phase was `click {"text":"Post"}` and
the log reads **`clicked Add to your post`** — the attachment menu, not the Post
button. The task then reported `Task complete: 10/1 actions`.

Two independent causes, both fixed:

- **`findTarget` could not SEE the Post button.** Its visibility test was
  `offsetParent !== null`, which is **null for `position: fixed`** — and the
  Facebook composer dialog is fixed. The real button was filtered out as
  invisible, so the best remaining text match was "Add to your post" (contains
  "post" as a whole word). Now uses `isVisible()` (rect + computed style).
  **This is the same trap noted for the descriptor finder** — the old tools had
  been carrying it all along.
- **The publish verification never ran.** `DRAFT_STILL_OPEN` was gated on
  `task.generatedText`, which is only set by a `generate_text` phase. This post's
  text came from the user via `params.value`, so the guard was skipped and
  nothing checked whether the draft was still sitting in the composer. Now gated
  on `generatedText || lastTypedText`, with `lastTypedText` recorded by the type
  phase (added to `PATCHABLE`).

**The planner also emitted no descriptors at all** for this run (all params were
`text`/`selector`), so none of the new finder machinery was exercised. Check the
backend was restarted after prompt changes before concluding the model ignored
them.

### 2026-07-20 — research rewrite searched for the WHOLE instruction; overview intent ignored
Task `2bc09dbe`, follow-on from the fix below. *create a new tab for google.com
and search "…winner…", answer me from ai overview* got routed to research (good)
but three things were wrong:

1. **The Google query was the entire goal sentence.** `repairPlan` built the URL
   with `encodeURIComponent(goal)` — so it searched Google for *"create a new tab
   for google.com and search '…' answer me from ai overview"*, which returns
   junk. → `searchQueryOf(goal)` extracts the real query: a quoted span wins
   outright; otherwise strip a leading run of mechanics words and a trailing
   report clause. The synthesize question uses it too.
2. **"answer from ai overview" was ignored and it crawled 10 links.** We do NOT
   scrape Google's obfuscated AI-Overview box (brittle); instead an "overview /
   quick / just / featured snippet" intent drops the crawl to the top 3, which
   answers the same question far faster. Honest trade recorded here so nobody
   "fixes" it by adding a fragile AI-Overview selector.
3. **It repeated because 8 links < target 10, re-reading the same 8 pages.** The
   `have === 0` guard from the entry below did not cover partial-but-stalled.
   → `executeLoop` now also stops when a pass makes NO NEW progress
   (`have <= AGENT[taskId].lastHave`), keeping what it gathered. The overview
   count of 3 also makes this specific case complete on pass 1.

Lesson worth holding: each of these mechanics-heavy phrasings ("create a tab,
search X, answer from Y") is handled by a CHAIN of heuristics, and a fix at one
link can expose the next. Read the whole event log before concluding the model
"stopped following commands" — here the model planned fine; the deterministic
rewrite mangled the query.

### 2026-07-21 — "Did it open?" after a launch answers honestly; edit project settings mid-session
Two follow-ups from a real launch session (`708f95ab`, "open chrome with minhaj
profile"): asking **"check is it opened or not?"** got planned as a browser
`click` for element "Minhaj", which the extension couldn't even reach (the freshly
launched profile has no extension) → 15s of retries then *"Receiving end does not
exist"*.
- **Launch-status questions now answer directly.** `runChatTurn` (before
  `routeChat`) checks `sessionHasLaunch(task) && isLaunchStatusQuestion(message)`
  and replies that a detached launch can't be verified from here — instead of
  planning a doomed browser task. `isLaunchStatusQuestion` is narrow (asking-word +
  open/launch/run/work word) and only consulted INSIDE a launch session, so a real
  browse follow-up ("is the page loaded?") doesn't match. This is the browser-side
  of the still-deferred "drive a launched profile" hard part — we answer the
  limitation rather than pretend. Also fixed stale "Approve to open it" chat copy
  (launches auto-run now) → "🚀 Launching X…".
- **Project settings are editable from each sidebar folder.** Every project group
  header in `SessionList.vue` gets a hover-revealed **tune** button (and a
  "Project settings" context-menu item) that opens `ProjectSettingsDialog` for
  that project, resolved with its settings via `projects.getProject(name→id)`.
  **Placement note (user's call, from a screenshot):** first tried a "Project"
  button in the CHAT HEADER — the user X'd it: *"I was expecting project setting
  icon with each folder instead of in header."* So the header button was removed;
  the per-folder icon is the entry point (the sidebar is visible in both the empty
  and active states, so it covers the "can't reach settings mid-chat" gap too).
  The empty-composer project-menu "Project settings" item stays as-is.

### 2026-07-21 — App launches no longer confirm ("i already told it to open")
The "Launch this app?" card was removed. A launch proposal is ONLY ever created
from the user's own explicit instruction (`detectLaunch` parses their message), so
the card re-asked something they'd just asked for. Now `sessions.runLaunch(proposal)`
is called straight from `createSession`/`sendChat` (mode `launch`), passing
`approved:true`; the outcome lands in the transcript instead of a card. Reverses
the 2026-07-20 "confirm-first-time" decision. **The safety boundary is unchanged:**
the main-process `launchApp` is still gated by `isKnownApp` (the curated registry —
chrome/edge/firefox/vscode/explorer/notepad/terminal…), never an arbitrary path
from the model. The `needsConfirm` gate + Settings "always allow" list are now
vestigial (renderer always approves) but left in place; Settings copy updated so it
no longer claims a first-launch prompt.

### 2026-07-20 — Host-launch tools (open Chrome/apps) — phase 1 built
Plan: `plans/partially-done/host-launch-tools.md`. The agent should open Chrome
(by profile) and installed apps. **Critical split:** the extension runs INSIDE
Chrome and CANNOT launch a process — only the Electron main process can. "Open a
new tab" already exists (`navigate {newTab}`); the rest are host-launch tools.

Phase 1 done: `desktop-app/src/main/host/launch-registry.ts` (pure registry +
`resolveLaunch`, no imports → unit-testable) and `launcher.ts` (`launchApp`
DETACHED/no-wait — a GUI app never exits, so waiting like `runHostCommand` would
report a false timeout; confirm-first-time remembered-apps list;
`listChromeProfiles` from Chrome's `Local State`). User's decisions: allowlist +
confirm-first-time, curated registry (never a raw path from the model), all
three OSes.

**Phases 1–3 now built + tested (2026-07-20).** A launch goes through the SAME
propose→confirm→execute path as a `/run` host command — NOT a browser phase, so
the extension is never involved (it can't spawn anyway). Pieces:
- `detectLaunch` (backend, keyword map → appId + profile — deliberately NOT the
  model; 15 unit cases incl. "open a new chrome TAB" → null, "open google" →
  null). `mode:'launch'` branch in both `POST /tasks` and `runChatTurn`;
  `POST /tasks/:id/launch-result` records the outcome ("Launch requested" — never
  more, a detached GUI app gives no exit code).
- Desktop: `launch:*` IPC + `window.api.launch` + d.ts; `pendingLaunch` flow in
  the sessions store (resolves a profile NAME → Chrome dir, remembers on
  approve); ChatThread launch card; "Launchable apps" Settings pane.
- 9 launch-integration cases on :4010, all prior suites still green after heavy
  server.js edits. Main + web typecheck clean.
**Phase 4 — achievable half done (2026-07-20):** "open chrome with my Work
profile and go to gmail" launches Chrome on the profile AND opens the URL —
Chrome navigates itself given a URL arg, so NO extension coordination is needed.
`detectLaunch` extracts a destination (explicit URL / domain / `SITE_ALIASES`
word), browsers only; it passes as a positional arg after the profile flag.
Profile-regex bug fixed en route: suffix form ("X profile") now matched before
the prefix form so a trailing "and go to …" clause isn't captured as the profile.
The FULL Phase 4 (agent CLICKS inside a launched profile) stays deferred — needs
the extension in that profile + task-claiming to avoid multi-profile races; an
architecture call + live testing, not buildable blind. Left: runtime GUI
verification on the user's Windows box.

### 2026-07-21 — Feedback learning phase 4 (effectiveness + NL capture) — plan DONE
Plan moved to `plans/done/feedback-learning.md` (all 4 phases built + tested).
- **Effectiveness tracking.** `injectLessons` returns `{block, ids}`; `planTask`
  stamps `task.pendingLesson={round,lessonIds}`, `synthesize` merges into it. The
  terminal `PATCH /tasks/:id` hook runs `attributeLessonOutcome` →
  `lessons.attributionFor(task)` (PURE: done→`successCount`, error→`failCount`,
  stopped→clear only) then `$unset`s the stamp so a repeated terminal PATCH can't
  double-count. `pendingLesson` is deliberately NOT in `PATCHABLE` (server-owned;
  the extension must not clobber it). Settings shows "N% ok", red under 50%.
- **Natural-language capture.** `feedbackTriage.isCorrectionMessage` is PURE and
  STRICT — no LLM, because the plan's own history says intent classifiers misfired
  twice here. Fires ONLY on a past-referring correction ("that was wrong", "you
  should have…"), never a fresh command (`FRESH_COMMAND_START` guard rejects
  "go to twitter instead", "open settings and fix it"). In `runChatTurn`, BEFORE
  `routeChat` and guarded by "the previous round actually produced events", a
  match records feedback (`source:'nl'`) on the previous round and runs the same
  `runFeedbackAnalysis` as a 👎. This stops a typed correction being re-planned as
  a browser task (which on a posting task would post again — the recurring bug).
- **Refactor (DRY):** `buildFeedbackDoc`/`recordFeedback` and `runFeedbackAnalysis`
  extracted so the button path and NL path share one tested pipeline. The
  `/feedback/:id/analyze` endpoint is now a thin wrapper returning
  `runFeedbackAnalysis`'s `{status, ...body}`.
- Tests: pure suites 21 (lessons, incl. attributionFor) + 41 (triage, incl. 13 NL
  detector cases); integration 18 (feedback) + 10 (analyze/lessons) still green
  after the refactor.

### 2026-07-21 — Feedback learning phase 3 (scoped lessons injected into prompts)
Plan: `plans/partially-done/feedback-learning.md`. Non-data corrections become
scoped guidance loaded into prompts. **Open question RESOLVED: SITE-SCOPED by
default** (the feedback dialog defaults to "This site only"; a lesson inherits
that host unless widened to a task-type/Everywhere — stops a Facebook quirk
leaking into a research plan).
- **`backend/lessons.js` is a PURE module** (16 unit cases): `lessonMatches`,
  `selectLessons` (matching + newest-first + HARD caps ≤5 lessons/~600 chars — an
  over-budget lesson does not load), `formatLessons`, `supersededIds` (Jaccard
  **≥0.3** within the SAME scope so a refinement REPLACES, not accumulates; 0.3
  is deliberately moderate — same-scope means same site, and real refinements
  like "keep posts short"→"keep posts under 100 words" share only topic words).
- **Lessons are written ONLY through the approval gate.** New proposal kind
  `lesson.create` (in `PROPOSAL_KINDS`); `applyProposal` inserts the lesson +
  deactivates superseded ones. The lesson TEXT is the model's; the SCOPE is the
  user's dialog choice (`feedbackTriage.lessonScopeFrom`, defaults site).
- **Injection via `injectLessons(ctx)`** (never throws — a lesson lookup must not
  break planning): wired into the **planner** (host + global lessons) and
  **synthesize** (research task-type + global). Bumps `injectedCount` per use
  (phase-4 groundwork). NOT wired into `/ai/generate` (the extension sends no
  host); the planner covers post length via `generate_text.words`.
- `GET /lessons` / `DELETE /lessons/:id`; desktop **Settings → "Learned lessons"**
  lists active lessons (scope + use count) with delete — a bad lesson injects
  into every matching prompt, so forgetting one is one click.
- **analyze endpoint no longer short-circuits on "no candidates"** — a lesson
  needs no learned skills/elements, so the model runs regardless (unless it's a
  like).

### 2026-07-21 — Feedback learning phase 2 (correction → approval-gated proposal)
Plan: `plans/partially-done/feedback-learning.md`. A 👎 correction now becomes a
proposal that rides the EXISTING `proposals[]` + `applyProposal` approval gate.
- **`backend/feedback-triage.js` is a PURE module** (no DB, no network):
  `TRIAGE_FORMAT`, `buildTriageMessages`, `proposalFromAnalysis`. **Why a separate
  file:** `require('./server.js')` boots Mongo and calls `app.listen` (the desktop
  app embeds the backend by requiring it — can't gate listen on `require.main`),
  so the only way to unit-test the validation deterministically was to move it
  out. 20 unit cases + 9 endpoint-guard cases.
- **`POST /feedback/:id/analyze`** (server.js): gathers the host's skills+elements
  (`feedbackCandidates`, capped, names+ids only — NEVER HTML into a 7B), resolves
  the model via `resolveModel` (handles `auto`), runs the model, validates with
  `proposalFromAnalysis`, and on success pushes the proposal onto the feedback's
  own task. Marks feedback `triaged`+`proposalId`. `POST /feedback/:id/dismiss`
  keeps the record (for effectiveness tracking) but flips status.
- **Honest scope — the model canNOT invent a selector for a page it never saw.**
  Three fix kinds: `skill.reorder` (**permutation-checked: may not drop or add a
  step** — the model dropping a step would silently delete skill data), `skill.edit`
  (clarify `details`), `element.repoint` **only when the correction itself names a
  selector**. Everything else → `none`, left for review. Prefer none over a guess.
- **Desktop:** `FeedbackDialog.send()` calls `store.analyzeFeedback(feedbackId)`
  after submitting; a resulting proposal shows in the transcript's existing
  proposal banner (approve → `applyProposal`), with a toast either way.
  `submitFeedback` now returns the feedback doc (was a bool) so the id is available.

### 2026-07-20 — Feedback learning phase 1 (capture + storage), PER-ROUND
Plan: `plans/partially-done/feedback-learning.md`. A `feedback` collection +
`POST /tasks/:id/feedback`. **Feedback is per-ROUND, not per-session** (user's
correction — a session has many rounds, only one went wrong; session-level
captured the wrong aggregate context). The stored context is scoped to that
round: `instruction`, that round's `messages`, that round's `events`; optional
`messageAt` pins the exact assistant message. `GET /feedback`,
`DELETE /feedback/:id`. Desktop: a per-round **👍/👎 pair, LEFT-aligned** in the
transcript (both `roundsByIndex`/`roundsByTime` carry a `round` number). 👎 →
`FeedbackDialog.vue` → `sessions.submitFeedback(round, messageAt, …)` posts
`kind:'down'`; 👍 → `sessions.likeRound(round, messageAt)` posts `kind:'up'`
one-click, **no form** — a like is a positive example so `whatWrong` is NOT
required for `kind:'up'` (backend enforces it only for `down`/`note`); the like
still stores the round context and leaves a "Marked this step as correct" note.
**Captures only — NO behaviour change yet** (collects both wins and corrections).
Items start `status:'open'` for phase 2. 18 integration cases pass.
Left: phase 2 (feedback→proposal), phase 3 (scoped lessons — BLOCKED on the open
question: site-scoped vs global-by-default), phase 4, review page.

**Whole-session checkpoint (2026-07-20):** 185 automated cases across 13 scratch
suites all green; `node --check` clean on server.js/background.js/content.js;
desktop `tsc` (main) + `vue-tsc` (web) clean. A stale duplicate
`plans/partially-done/instruction-skills.md` (said phases 1–2) was removed — the
authoritative final version is in `plans/done/`. Nothing committed; backend NOT
yet restarted by the user, so none of the server-side work is live for them.

### 2026-07-20 — Project-wise settings — backend built, desktop pending
Plan: `plans/partially-done/project-settings.md`. **Phase 1 (backend) done +
tested** (14 cases). New `projects` collection + CRUD; `POST /tasks` inherits a
project's `settings` with precedence **explicit request > project default >
global**. Whitelisted settings: `model`, `skillIds`, `promptId`, `schemaIds`,
`systemPrompt` (the project's inline "dynamic" prompt — user asked for it),
materialised into the task's `{name,content}` systemPrompt. `POST /tasks` now
requires `goal` + an EFFECTIVE model (request OR project), not `model` outright —
watch for callers that assumed the old 400.

**Desktop phase now built (2026-07-20, typecheck clean, runtime unverified):**
`projects.js` is backend-backed (`loadProjects` + migration of local-only
projects by name; `addFolder`/`remove`/`updateSettings` hit `/projects`;
localStorage is just a cache). `createSession` sends `project:{projectId}`.
**Override UX = "composer adopts project defaults":** `setCurrent` →
`applySettings` pushes the project's model+skills into the composer via
`sessions.setModel`/`setNewSessionSkills`, so the request carries them
explicitly (satisfying explicit>project); the inline prompt is applied
server-side. `ProjectSettingsDialog.vue` (model/skills/dynamic prompt) →
`PATCH /projects/:id`, opened from the project selector. **Caveat:**
`applySettings` writes the GLOBAL model picker — selecting a project changes the
app's current model and "No Project" doesn't revert it. Acceptable for v1.
Decisions were: backend store, inline dynamic prompt, allow override.

### 2026-07-20 — planSchema forbade metric "links" the prompt demanded
The heavy one, found in a prompt audit. `planSchema()` is handed to Ollama as
`format`, so its enums are GRAMMAR-ENFORCED — a value absent from an enum is one
the model literally cannot emit. Its metric enum was
`['scrolls','items','texts','actions']` — **no "links"** — while the prompt and
every research example told the model to output `metric:"links"`. So constrained
decoding coerced every search/research plan to "texts"/"actions", and the plan
only worked if `repairPlan`/`normalizePlan` later relabeled it. A direct
contributor to the Google-search failures. Fixed: enum now
`['scrolls','items','texts','links','actions']`.

- Guard added (scratchpad `metric-enum-test.js`, not committed): asserts the
  schema enum, the `normalizePlan` whitelist, and every `repairPlan` metric
  branch agree. **Rule: any grammar-enforced enum handed to the model as
  `format` must list everything the prompt asks for — audit them together.**
- Audit also confirmed: no stale tool references in the prompt (all 24 backtick
  tool names exist in `TOOL_CATALOG`); `metric:'details'` is read in the
  extension's `executeLoop` but never SET server-side — dead legacy branch,
  harmless, left alone.

### 2026-07-20 — The planning prompt was TEACHING two of the bugs
User's catch: the hardcoded `planningSystemPrompt` contradicted itself and
seeded the exact failures.

- **A rule said "NEVER invent a CSS selector for a site you have not inspected"
  — then an EXAMPLE handed the model `collect_text([role="article"])`.** A 7B
  copies the example over the rule, so it used `[role="article"]` on Google,
  where it matches nothing. The example is now explicitly labelled
  Facebook-feed-specific with a "do not copy this selector to other sites" note.
- **An example literally showed `"value":"<the post text>"`** — the very
  placeholder that got published to the live feed. Replaced with a literal value
  ("Hello everyone"), and a new rule forbids placeholder values outright
  (use `generate_text` when the user gave no text). The runtime guard added
  earlier stays as the backstop; this stops the prompt from provoking it.

General principle: **few-shot examples in a planner prompt are stronger than the
rules** for a small model. An example that shows a guessable selector or a
placeholder value will be copied literally. Audit examples as if they were
rules — because to a 7B they outrank the rules.

### 2026-07-20 — "search google for X and tell me" collected nothing, repeated 4x
Task `2abea76b`. Goal: *create a new tab for google.com and search "…" and tell
me here.* Planned as `navigate → collect_text([role="article"]) → ai_verify`,
collected 0 (Google results are not `[role="article"]`), and re-ran the whole
plan 4 times giving no answer. TWO independent bugs:

1. **The research-pipeline rewrite never fired.** It needs
   `isWebQuestion && !namesASite`, and BOTH failed: the goal has no question word
   ("tell me here" ≠ "tell me about"), and it names "google.com" so `namesASite`
   was true. So the naive guessed-selector plan survived.
   → `isWebQuestion` now recognises a search-and-report request (search/look up
   verb, or a named search engine, plus "tell me / let me know / answer / who /
   winner / here"). `namesASite` now **strips search-engine hosts first** — a
   search engine is how you REACH the web, not a site to scrape, so naming
   google.com no longer blocks the rewrite. `facebook.com` still counts.
2. **The repeat loop re-ran a zero-yield plan.** Repeating is deterministic:
   same URL + same selector = same zero. It only helps when a pass makes
   PROGRESS (an infinite feed). `executeLoop` now stops when a collection pass
   collects `have === 0`, with a chat-visible message, instead of burning the
   whole retry budget. Same lesson as "retries cannot fix a stepped form".

### 2026-07-19 — The post published, then the agent LIKED the user's own post
Task `c52e1619`. Read the whole log before changing any of the three fixes — it
is one failure causing the next.

1. **The model emitted the descriptor FLAT**: `{"tool":"click","params":{"exactText":"Next"}}`
   instead of nesting it under `params.descriptor`. It picked the right strategy
   and the wrong shape. The phase then had no selector, no text AND no
   descriptor — **no target at all** — so it failed `no element for ` (note the
   empty label) four times across 15s.
   → `liftDescriptor()` now accepts the flat form on both plan and recovery
   paths, and the prompt shows complete phase JSON instead of a bare descriptor
   object. The prompt example was the actual cause: it never showed where the
   descriptor goes.
2. **A targetless click fails SLOWLY and then poisons the recovery.** Dropped in
   `repairPlan` now, with a note. A phase that cannot act is noise, not an
   instruction being discarded.
3. **`DRAFT_STILL_OPEN` gave a FALSE "publish did not go through".** It checked
   once at 2.5s; Facebook leaves the text in the composer briefly while
   submitting. The post HAD published. → now polls ~10s before believing it.
4. **The recovery from that false alarm clicked a carousel arrow and then
   "React with Like to Minhaj Sorder's post"** — it liked the user's own post
   while trying to publish, and the composer check then passed, so the task
   reported success. → `sanitizeDecision` now aborts if a publish-step recovery
   proposes clicking anything that is not a publish CONTROL.
   **Containing the word is not enough**: that Like label contains "post" as a
   whole word. `isPublishControlLabel` requires the label to BE the verb, or be
   ≤15 chars and contain it — length is what separates a button from a
   description.

### 2026-07-19 — Instruction skills: a run that worked becomes the skill
Completes `plans/done/instruction-skills.md`. Teaching a skill no longer means
picking elements: you describe the flow in prose, it runs, and when it works you
say "save this flow as a skill".

- `POST /tasks/:id/resolution` records every descriptor that resolved (a
  dedicated endpoint, not PATCH — PATCH replaces whole fields and two phases
  finishing together would clobber each other).
- `POST /tasks/:id/save-as-skill` promotes a **done** run into
  `kind: 'instruction'`: `instructions` (the prose, verbatim) + `hints[]`
  (descriptors that resolved, with what they matched). **No element refs, no
  selectors.** Re-saving MERGES into the same name+host — a hint that resolved
  again gains `uses`, so a skill improves each run instead of duplicating.
- **A saved skill does NOT skip planning** (user's explicit call). It is
  guidance: `planningSystemPrompt` shows the prose plus reusable descriptors, and
  the planner still plans. Replaying a fixed step list was rejected — it is
  brittle in exactly the way selectors are, and it fails silently mid-flow AFTER
  side effects have fired. Guidance that goes stale costs a search; a recording
  that goes stale costs a wrong click.
- Refuses to save a run whose status is not `done`: a skill built from a broken
  run records the wrong thing as if it were right, and is then trusted forever.
- **"Save this as a skill" is gated twice** (`isSaveSkillRequest` + a
  `save_skill` class in `routeChat`), like introspection, for the same reason —
  a meta-request planned as a browse round has twice re-run a posting flow
  against the live account. 22 classification cases pass, including the
  near-misses ("use my facebook skill to post" must NOT match).

### 2026-07-19 — A placeholder was PUBLISHED to a live feed as "success"
First full descriptor run worked — and posted the literal text
**`<the post text>`** to Facebook, then reported "Task complete: 8/1 actions".

Root cause: the `type` phase substituted `task.generatedText` for a placeholder
value **only when generatedText existed**. The goal named no post text and no
`generate_text` phase was planned, so the `else` branch typed the planner's
placeholder verbatim, and the publish step happily published it. Every
individual step "succeeded".

`type` now throws when the value is a placeholder (or empty) and nothing
produced real text. Worded to avoid the `TRANSIENT` regex on purpose — waiting
and retrying cannot conjure text nobody wrote.

**This is the third instance of the same pattern** (see close_tab, and the
coverage note below): *a missing input looks exactly like a completed step, and
the target check then certifies it.* When adding a tool, ask what it does when
its input never arrived — the honest answer is usually "fails loudly", not
"proceeds with whatever it has".

### 2026-07-19 — Blank chat pane: `min-width: auto` struck a SECOND time
The transcript rendered nothing for a task whose goal was a long instruction.
The messages were never missing — they were **off-screen to the right**.

`.thread-head`'s `<div class="col">` holds the goal in `.ellipsis`
(`white-space: nowrap`). A flex child defaults to `min-width: auto`, so it will
not shrink below the un-wrapped width of the whole goal — stretching the thread
pane to several thousand px. `.thread-body` then centres itself
(`max-width: 860px; margin: 0 auto`) inside that, landing far right of the
viewport. Short goals never triggered it, which is why it appeared only now.

**`min-width: 0` alone does NOT fix this — you also need `overflow: hidden`.**
Measured with a probe: `.thread-pane` was **2954px inside a 996px parent** even
with `min-width: 0` applied. `min-width: 0` only permits a flex item to shrink;
it does not stop the item's own CONTENT (here a 2827px `white-space: nowrap`
goal) from sizing it. `overflow: hidden` makes the element a formatting context,
which sets its automatic minimum size to 0 and severs content-based sizing.
Set BOTH axes explicitly — `overflow-x` alone forces the other axis to `auto`.

**What finally worked: don't put the long string in the box.** Even with
`min-width: 0` + `overflow: hidden` on every ancestor, the pane still measured
3216px — a nowrap text node's min-content width is its full length, and it kept
winning. The goal is now truncated to 110 chars in JS (full text in a `title`
tooltip) before it reaches the DOM, and the proposal banner's detail wraps with
a 2-line clamp instead of `.ellipsis`. Both were `.ellipsis` elements holding
user-supplied text of unbounded length; **treat `.ellipsis` + long dynamic text
as the smell**, and cap the text at the source.

**When guessing at which node is too wide, measure instead.** Two rounds of
reasoning picked the wrong element; one probe listing every box whose `right`
exceeds `innerWidth`, sorted outermost-first, named it immediately.

**The fix has to hold on EVERY flex ancestor — one missing link re-widens the
whole chain.** Two rounds of fixes inside `ChatThread.vue` changed nothing
because the real gap was one level up, in `ChatView.vue`: the
`<div class="col column">` wrapping `<ChatThread />` had no `min-width: 0`, so
it kept sizing to its content regardless of what the pane below it declared.
When chasing this, fix the OUTERMOST offender first, then work in.

Applied at: `ChatView.vue` `.chat-main`, `.thread-pane`, and the header's
`.col-clamp`; plus `overflow-wrap: anywhere` on `.thread-body` and
`max-width: min(860px, 100%)` so centring cannot move it out of view again.

**Use `overflow-x: clip`, never `overflow-x: hidden`, to stop sideways growth
here.** Per spec, a non-`visible` value on one axis forces the other axis from
`visible` to `auto` — so `overflow-x: hidden` on the pane turned it into a
VERTICAL scroll container nested inside the `q-scroll-area` that already
scrolls, giving two scrollbars. `clip` constrains one axis only.

**This is the same root cause as the sidebar's sideways scroll** (see below).
Twice now, so it is in CLAUDE.md's Conventions: any flex child that clamps text
(`.ellipsis`, line-clamp, or a `.col` holding user-supplied text) needs an
explicit `min-width: 0`. The symptom is not always a scrollbar — it can be a
pane that looks completely empty.

### 2026-07-19 — The desktop app showed a BLANK transcript for browse tasks
A task that ran fine displayed nothing in the chat pane. `POST /tasks` created
the session with `chat: []` and never seeded the opening goal: follow-up turns
push to `chat` via `runChatTurn`, but the FIRST turn never did. Nothing pushed an
assistant turn at the end either, so a completed browse round left `chat` empty
while `events` was full.

- The goal is now the first `chat` turn.
- `POST /tasks/:id/event` takes `chat: true`, which also posts the message as an
  assistant turn; the extension sets it on task-complete and on terminal
  failure. Deliberately NOT on every event — the event log stays the detail
  view, the transcript stays readable.

### 2026-07-19 — click/type/wait accept descriptors; misses explain themselves
Phase 2 of the plan above. `click` / `hover` / `type` / `wait` take a
`descriptor` param resolved by the finder below; **omitting it keeps the exact
old selector/text path**, so nothing existing changed behaviour.

- A miss now travels as a structured `diagnosis`, not a string:
  `failureWithDiagnosis` (background.js) attaches it to the thrown Error, which
  `rethink` forwards to the backend, where `describeDiagnosis` renders it into
  the recovery prompt. Each cause reads differently on purpose — a `scopeEmpty`
  miss tells the model the PREVIOUS step failed, so it stops retrying this one.
- **`cleanDescriptor` validates descriptors on both paths** (`normalizePlan` for
  planned phases, `cleanParams` for recovery phases). A descriptor is model
  output like any other; the precedent is the run that put a label in the CSS
  `selector` field. Unknown `by` → dropped, annotations stripped, bogus scope
  removed. Alternates keep their array shape.
- `WAIT_FOR` resolves descriptors WITHOUT `withBackoff` — that loop already is
  the wait, and nesting the 1/2/4/8s backoff inside overshoots the caller's
  timeout by up to 15s.

### 2026-07-19 — Descriptor finder: leaf-to-root element lookup (phase 1 only)
`findByDescriptor(desc, op)` / `resolveDescriptor` in `content.js` — find an
element by what it SAYS, not by a selector. From
`plans/partially-done/instruction-skills.md`. **Nothing calls it yet** (phase 2
wires it into click/type/wait); probe it with `__baFind()` from the content
script's DevTools context, or the `FIND_DESCRIPTOR` message.

**Why bottom-up.** Everything else searches top-down —
`querySelectorAll('button,a,…')` then score the text — and that is the direct
cause of two logged bugs: "Post" matching *"Actions for this post by …"* (an
ancestor whose text merely CONTAINS the word) and a composer step landing on a
wrapper DIV. Starting from the text node makes the target unambiguous; the only
question left is how far UP to walk, which is a bounded ascent (`ASCENT_CAP = 8`)
stopping at the first ancestor actionable *for that op* (clickable for click,
editable for type). **Nearest actionable ancestor wins** — that is what makes
"the button with only 'Next' inside" mean the button, not the panel around it.

Two failures found while testing, both non-obvious:
- **Split sibling text must climb to an ancestor.** React renders a label as
  several text nodes (`<span>Post</span><span> </span><span>settings</span>`), so
  the combined string exists only on the PARENT. Testing the leaf's own element
  matches nothing. Gated on the leaf being a proper piece of the target and
  capped at 2 levels, or every node on the page climbs.
- **`nearestTexts` must not filter by similarity.** When the copy changed to
  something unrelated ("Continue" → "Next"), nothing scored above zero and the
  suggestion list came back empty — throwing away the one thing worth reporting.

**A miss returns a `diagnosis`, not just an error** (`leavesMatched`, `nearest`,
`ascentRejected`, `scopeEmpty`, `retries`). This is load-bearing, not polish: a
text finder that only says "not found" is *worse* to debug than the selectors it
replaces, because you cannot tell a copy change from a bad ascent.
`ascentRejected` (text found, no actionable ancestor within the cap) is how a
wrong `ASCENT_CAP` becomes visible instead of mysterious. Phase 2 feeds this into
`rethink`, which today gets a bare error string and is expected to guess.

**Measured on live Facebook (2026-07-19), not just jsdom:** composer entry
`depth 2` → `div[role="button"]`; composer field `depth 0` → `div[role="textbox"]`;
**the dialog's Next button `depth 5`** → `div[aria-label="Next"]`. That last
number is the one to remember — a legitimate control sat **5 hops above its own
text node**, so `ASCENT_CAP = 8` has only 3 hops of headroom on real React
markup, not the wide margin the jsdom fixtures implied. Do not lower it. Raising
it is NOT free either: the ascent stops at the FIRST actionable ancestor, so a
larger cap only changes behaviour when nothing is actionable nearby — and then
it finds a DISTANT container (a whole feed item is often clickable), which is
the "Actions for this post by …" bug coming back by another door.

**Retries cannot fix a stepped form.** "Post" does not exist in the DOM until
Next advances the dialog, so `withBackoff` spends 1+2+4+8s re-searching for
something that cannot appear, then fails anyway. Sequencing has to be right;
the backoff is for late RENDERING, not for missing steps.

Local `isVisible()` uses `getBoundingClientRect` + `getComputedStyle`, NOT the
`offsetParent !== null` test the older tools use — **offsetParent is null for
`position: fixed`, which is exactly what a Facebook dialog is.** Kept local so
existing tool behaviour is unchanged.

### 2026-07-19 — solve_with_code (READ-ONLY code execution)
`solve_with_code` writes JS, runs it on the page, checks the result, and rewrites
it differently on failure (4 attempts). Design came from
`docs/code-executor-plan.md`. Read mode only — `act` is deliberately not built.

- Loop: `pageDigestFor` (repeating-element signatures, not a DOM dump) →
  `POST /ai/codegen` → run in page → deterministic check (empty?) →
  `POST /ai/verify-code` → on failure push the attempt and retry HOTTER
  (temperature 0.2 → 0.5) so it tries something structurally different.
- Vehicle: `chrome.scripting` MAIN world + `new Function`. **A strict page CSP
  can refuse it** — reported as a clear error. The clean upgrade is
  `chrome.userScripts` (ignores page CSP, needs the user's "Allow user scripts"
  toggle).
- Generated code is written against a small `BA` helper API, not raw DOM — a 7B
  model writes far better code against a documented surface.

**Read-only is enforced at RUNTIME, not just requested in the prompt.** First
version only had the prompt plus a server-side regex; a test proved
`BA.$('.row').click()` really clicked. Now elements are handed out through a
Proxy that throws on mutators (click/submit/setAttribute/…) and on writes to
value/innerHTML/…, and `document` is shadowed by a read-only facade so code
bypassing `BA` is guarded too. fetch/XHR/WebSocket/storage are shadowed.
Gotcha: **`eval` cannot be a parameter name under `"use strict"`** — it is a
SyntaxError that rejects every snippet.

### 2026-07-19 — Full tab control (23 tools)
Added `switch_tab`, `list_tabs`, `reload_tab`, `go_back` alongside `close_tab`.
`findTabByMatch()` resolves a host / URL fragment / title, preferring the active
tab when several match. `switch_tab` repoints `AGENT[taskId].tabId`, so
subsequent phases act on the new tab.

**Guard worth keeping:** a script that diffs `TOOL_CATALOG` names against
`background.js` implementations. `close_tab` was advertised nowhere and missing
everywhere — the planner simply dropped that part of the request and reported
success. Run it after touching the catalog.

Console/network capture was considered and **dropped** (2026-07-19, user's call).
Worth knowing if it comes up again: MV3 `webRequest` cannot read response bodies
at all — only `chrome.debugger` can, and that shows a persistent "…is debugging
this browser" banner and conflicts with the user's own DevTools.

### 2026-07-19 — close_tab tool + duration scrolling
"open facebook.com tab, scroll for 5 seconds, then close that tab" failed three
ways and still reported **"Task complete"**: it reused an existing tab instead of
opening one, scrolled 5 *times* with `delay:1` (≈instant), and there was **no
close-tab tool at all** — a third of the request was silently impossible.

- New `close_tab` tool (closes the task's own tab; `PHASE_ORDER: 8` so it is
  always last in its segment — nothing can act on a closed tab).
- `scroll` takes `seconds` for durations. `delay` is clamped to 250–10000ms and
  steps to 200: the model's `delay:1` would otherwise compute **5000 steps** for
  a 5-second scroll.
- `repairPlan`: a goal mentioning "close the tab" appends `close_tab`, and
  forces `newTab: true` on the navigate — closing a tab the user already had
  open would be destructive.

**The systemic lesson:** the planner silently drops instructions it has no tool
for, and the target check ("5/1 scrolls") then reports success. Missing
capabilities look identical to completed ones. Worth a coverage check that
compares the request against what the plan actually covers.

### 2026-07-19 — Introspection detection widened + classifier fallback
Round 0 ("how many elements…") was answered correctly, but the FOLLOW-UP
("check facebook skill **details instruction** avail in **that** skill, and
write here") was missed and planned as a browser task — it ran the posting
skill again. The regex only knew "your/my/the" and lacked the verb "check".

- Detection is now subject (skill/element/schema) + read-intent, with a much
  wider verb list (check/read/see/inspect/details/instructions/write here…)
  and no determiner requirement. 14/14 cases pass.
- **`routeChat` is now a 3-way classifier** (browse | answer | introspect) as a
  second line of defence, so a phrasing the regex misses still gets answered.
  Two independent gates, because the failure mode is a read-only question
  executing a POSTING skill against a live account.
- `answerIntrospection` now prints skill **`details`** and element `details` —
  the exact field being asked for was missing from the inventory entirely.

### 2026-07-19 — Introspection: questions ABOUT the agent are not browser tasks
"Check your facebook post skill, how many elements are available there?" was
planned as a browser task — it navigated to Facebook and started **running** the
posting skill (clicked submit_post_button) before failing. Asking about a
capability is not asking to use it.

- `isIntrospection()` gates on read-intent + skill/element/schema nouns;
  `answerIntrospection()` builds an inventory (skills with element counts and
  steps, elements per host, schemas) and answers from it.
- Wired into BOTH entry points: `POST /tasks` (creates an idle, already-answered
  session — no plan, status `done`) and `runChatTurn` (before `routeChat`).
- 11/11 classification cases pass; "use my facebook skill to post about AI" and
  "collect 10 posts from facebook" stay browser tasks.

### 2026-07-19 — "Illegal invocation" in skill type steps
A taught step whose element resolves to a **non-input** node (Facebook's
composer is a contenteditable wrapper) hit the `else` branch and applied
`HTMLInputElement.prototype.value.set` to a DIV — a native setter throws
`Illegal invocation` on a foreign receiver.

- `editableTarget(el)` returns the element if it is genuinely editable,
  otherwise the first editable DESCENDANT (a taught "text input box" is usually
  a wrapper), else null.
- Both type paths now branch on the ACTUAL tag: native setter only for
  INPUT/TEXTAREA, `insertIntoLexical` for rich editors, and a clear
  "step target is not a text field (div)" error instead of a cryptic one.

### 2026-07-19 — Agent-proposed elements/skills (approval-gated)
The agent can now offer to change the knowledge it runs on, but **never writes
it**. Approval is required here even though task actions (posting) are opt-in:
editing its own memory is a different matter from carrying out a given task.

- `task.proposals[]` + `POST /tasks/:id/propose` and
  `POST /tasks/:id/proposals/:pid {decision}`. Kinds: `element.create`,
  `element.repoint`, `skill.update`, `skill.delete`.
- `applyProposal()` is the ONLY path that writes on the agent's behalf — kept in
  one place so nothing else can. Unknown kinds are rejected; an already-decided
  proposal cannot be re-applied.
- **Non-blocking**: the task keeps running, the proposal waits in the transcript
  with Save it / Not now.
- Where proposals come from: after an adaptive recovery succeeds, the click tool
  returns `selectorHint` (`selectorFor()` prefers id / data-testid / aria-label
  over structural paths) and the agent offers to remember that control. So a
  recovery teaches the system instead of being rediscovered next run.

### 2026-07-19 — Adaptive recovery (think → act → observe → think)
A failed phase no longer aborts the task. The agent looks at the live page and
decides what to do instead. **Failure-gated on purpose**: phases that behave as
expected just run, so a local model is not asked to deliberate every step
(a 7B takes 10-30s per decision).

- `PAGE_SNAPSHOT` (content.js) — visible controls and fields with their labels,
  whether each is inside a dialog, disabled, or already filled. Without this the
  "decision" is just another guess at button text.
- `POST /tasks/:id/rethink` — given the goal, what already ran, the failure and
  the snapshot, returns `replace` (swap in new phases) / `skip` / `abort`.
- `executeLoop` applies it by rewriting the plan and re-running the index.
- Capped at `MAX_RETHINKS = 3` per task (`rethinks` field, in `PATCHABLE`).

**Guards, both added after the model failed the test:**
- *Params get sanitized.* The model returned `{selector:"Post", text:"[in dialog]"}`
  — a label in the CSS field and a page-listing annotation as the label.
  `cleanParams`/`looksLikeSelector` move a non-CSS value to `text` and strip
  annotations. Page listings now use (parens) not [brackets] for the same reason.
- *Publish steps are never rethought on an ambiguous outcome.* Asked to recover
  from "unclear whether the post was published", the model invented a composer
  URL and tried again. A publish phase is now only retried with POSITIVE
  evidence nothing happened ("still in the composer", "not found"); otherwise it
  aborts. Do not delegate double-post safety to the model.

### 2026-07-19 — findField no longer types into the wrong box
"Post it again" typed a Facebook post into a feed **comment box**: the `type`
phase carried no field hint, and `findField` fell through to "first visible
editable in DOM order" — and comment inputs come before the composer.

- Hint matching is now scored (exact 100 / substring 50, +40 inside a dialog).
- The no-hint fallback order is: field inside an open **dialog** → the
  **focused** field → the **largest** visible field. Largest is the principled
  tiebreaker: a post composer dwarfs an inline comment input, and it needs no
  site-specific knowledge.
- `repairPlan` inserts a 2s `wait` between a click and a following
  `type`/`generate_text`, so a composer dialog has time to render — without it
  the text lands in whatever field was already on the page.
- The planner is told to prefer a learned skill over hand-written click/type
  when one exists for that site: its selectors are known-good, guessed button
  text is not.

### 2026-07-19 — Confirmation is opt-in; click matching scores candidates
From a run that did everything right except the last step, and still said "done".

- **Approval is OPT-IN** (`WANTS_APPROVAL`). The agent acts on the user's own
  accounts: "post it on my feed" means post it. An `ask_user` gate is inserted
  only when the goal asks to be asked ("ask me before posting", "let me review
  it first"). The `ask_user` tool description says the same, so the planner
  stops volunteering confirmations. When approval IS requested, every publish
  step still gets its own.
- **`findTarget` scores every candidate instead of taking the first substring
  hit.** Asking to click "Post" matched a feed item labelled *"Actions for this
  post by …"* — first in DOM order — so the agent clicked a menu and the post
  was never published. Scoring: exact 100 / whole-word 55 / substring 25, plus
  bonuses for short labels, being inside an open `[role="dialog"]` (+50), and
  being a real control (+10). On the failing page the composer's Post button
  scores 179 vs 75 for the feed item.
- **Publish clicks are verified, not assumed.** After clicking a publish word,
  the extension checks whether the generated text is still sitting in a
  composer/dialog (`DRAFT_STILL_OPEN`). If it is, the phase throws instead of
  reporting success — clicking something is not the same as publishing.

### 2026-07-19 — Sidebar: no sideways scroll, rename + delete
- The session list scrolled **horizontally** because `.col.ellipsis` in a flex
  row keeps `min-width: auto`, so a long label widened the row past the sidebar.
  `min-width: 0` on the title (and on the project-name cell) lets it clamp.
  Labels now clamp to **2 lines** via `-webkit-line-clamp`, and `titleOf()`
  takes 12 words instead of 8.
- Each row has a `more_vert` menu: **Edit label** and **Delete** (confirmed).
  Rename writes `task.title`, which had to be added to `PATCHABLE` — a
  non-whitelisted field is silently dropped. `titleOf()` prefers `title`, so
  clearing it falls back to the goal-derived label.
- Deleting the OPEN session resets to the new-conversation screen.

### 2026-07-18 — Skill-host navigation + research-first ordering
Two deterministic repairs, from a real failure ("No skill Facebook Post Skill
for google.com"): the model called a Facebook skill but never navigated there.

- `insertSkillNavigations()` inserts a `navigate` to a skill's taught **host**
  before any `use_skill`/`run_skill`/`collect_by_skill` whose host differs from
  the active segment. Skills are host-scoped, so calling one on the wrong site
  always fails — and small models forget the hop constantly.
- Research phases (`collect_links`/`read_pages`/`synthesize`) are moved ahead of
  everything that consumes them. Models emit the posting step *inside* the
  research block, and same-rank sorting would leave it there — composing the
  post before any research exists.

### 2026-07-18 — Chat scroll no longer fights the user
Reading back through a session was impossible.

- `refreshCurrent()` now skips the assignment when nothing changed. It polls
  every 1.5s and replacing `current.value` re-rendered the whole transcript
  each time.
- The scroll watcher keyed on `() => [chatLen, eventLen]` — a **fresh array is
  a new reference every evaluation**, so it fired on every poll regardless of
  whether anything was added. Keyed on a string now.
- A queued `scrollToBottom` is cancelled when the user scrolls away, and a
  "jump to latest" button appears whenever you are not at the bottom.

### 2026-07-18 — Multi-site chained plans
A plan is now a **sequence of site visits**, not one site with one objective.
`orderPhases()` (server.js) splits phases at each `navigate` and sorts only
*within* a segment; cross-site order is carried by the navigates. Consecutive
duplicate navigates are deduped.

- Enables: *"research X → prepare a post → go to facebook → post it"*, and
  N sites (verified with research → Facebook → X).
- Planner prompt gained a chaining rule + a worked research→post example. This
  is what made the model stop dropping the second half.
- `generate_text` prefers `task.summary` (synthesized research) as its source
  material, falling back to the last collected post. `/ai/generate` already had
  a `context` slot; this just fills it.
- `repairPlan` adds the missing publish click (label matched to the goal:
  Post / Send / Share) when the goal asks to publish but the plan only composes.
- **Every** publish step gets its own `ask_user` confirmation, naming the site.
  Opt out with "without asking" / "automatically" in the goal.

**Why it was broken:** the old code did `phases.filter(navigate).slice(0, 1)`
(one site per plan) and sorted phases globally, so posting steps were reordered
onto the search-results page.

### 2026-07-18 — Image upload + vision analysis
Attach images in the composer (button, **paste**, or **drag-drop**) and a vision
model describes/answers about them.

- `GET /models?capability=vision` — vision models usually **lack** the `tools`
  capability, so the default `/models` filter hid them completely.
- `visionModel()` picks the session's model if it can see, else the largest
  installed vision model. Session stays on its text model for everything else.
- Bytes live in the **`task_files` collection**, never on the task doc (16MB
  Mongo cap); served by `GET /tasks/:id/files/:fileId`. Purged on task delete.
- Caps: 4 images/turn, 8MB each, checked on decoded size.
- Image-led NEW sessions are created with `idle: true` → status `done`, so the
  extension does not try to plan "analyze this photo" as a browser task.
- Vision routing happens **before** `routeChat` — the answer is in the picture.

### 2026-07-18 — Stop button, prompt queue, skill selection
- **Stop:** `POST /tasks/:id/stop` flips DB status to `stopped`. The extension
  re-reads status *between phases* (`isCancelled()`), never mid-phase.
  Stop also discards the queue.
- **Queue:** typing while busy no longer 409s — the prompt is queued and runs
  when the round hits a terminal status (`drainQueue`, hooked into
  `PATCH /tasks/:id`). Loops, because an *answer* turn finishes instantly while
  a *browse* turn leaves the task busy. `DRAINING` set guards concurrent drains.
- **Skill selection:** `POST /tasks/:id/skills` narrows `task.useSkills`.
  Planning previously loaded **every** skill in the DB and ignored `useSkills`
  entirely — selecting skills did nothing. Empty selection = unrestricted.

### 2026-07-18 — Research pipeline
`navigate(google search URL) → collect_links → read_pages → synthesize`, with
map-reduce summarization and `[n]` citations; sources hidden behind
"show sources" in the UI.

- `repairPlan` rewrites a "guessed site + invented CSS selector" plan into this
  pipeline when the goal is an informational question (`isWebQuestion`), unless
  the goal names a real site, uses a learned skill, or is actions/scrolls.
- `proseModel()` swaps a `*-coder` model for an instruct model for prose work.
- Citation sanitation strips markers not backed by a real digest.
- Chat answers that would say "I don't have real-time data" emit `NEEDS_WEB`
  and escalate into a browse round instead. A regex safety net catches models
  that ignore the instruction and refuse anyway.

---

## Decisions and their reasons

- **Never repeat a plan that already acted.** `executeLoop`'s repeat guard once
  covered only `metric === 'actions'`; a chained research→post plan is
  `metric: 'links'`, so a short search would repeat from the top and **post
  twice**. Any plan containing click/type/generate_text/use_skill/run_skill/
  ask_user now completes instead of repeating.
- **Publishing is confirmed per step, not per plan.** One approval must not
  cover a second site's post.
- **Empty skill selection means "all"**, so unchecking the last skill lands back
  on unrestricted rather than an unusable "no skills" state.
- **Attachments and screenshots live in side collections**, keyed by taskId, so
  task reads stay small.
- **`requestedCount` ignores compose clauses.** "prepare **a** facebook **post**"
  was read as "collect 1 item" and capped research at one source.

## Gotchas

- **`desktop-app/` source is tracked directly in THIS repo** (like `backend/` and
  `extension/`). It used to be a dangling gitlink submodule — no `.gitmodules`,
  the pointer object wasn't even present — so from 2026-07-18 to 2026-07-21 the
  entire Electron/Vue source was silently UNtracked (`git add -A` in the root
  skipped it as a submodule boundary; committing lost every desktop change). Fixed
  2026-07-21 with `git rm --cached desktop-app` then `git add desktop-app/`. If a
  future `git status` ever shows `desktop-app` as one gitlink entry again, the
  submodule state has come back — don't commit until it's re-flattened.
- **The backend does not hot-reload.** Editing `server.js` changes nothing
  until the :34730 process is restarted. When a task behaves like old code,
  compare `server.js` mtime against the process start time before debugging:
  `Get-Item backend/server.js` vs `(Get-Process -Id <pid>).StartTime`.
- `watch(() => [a, b], cb)` in Vue fires on **every** evaluation — a new array
  is a new reference. Key on a string/primitive for length-change watchers.
- Changing a Pinia **store surface** needs a full Electron restart — Ctrl+R
  keeps a stale bundle and the new action reads as `undefined`.
- `content.js` contains regex literals with `{n,m}`; brace-matching scripts will
  mangle it. Edit it with exact-text edits.
- Vision models are **not** tool-capable — never assume `/models` lists them.
- The user runs the backend on **:34730**; never restart or kill it. Test on
  `PORT=4010`, clean up test documents (shared Mongo), and shut the instance
  down when done.
