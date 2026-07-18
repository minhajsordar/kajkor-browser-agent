# Code Executor — `solve_with_code` (design proposal)

Goal (TODO.md): when a task needs work no cataloged tool can do, the AI should
WRITE code, an executor should RUN it in the browser, VERIFY the outcome, and
on failure try a DIFFERENT approach — the same inner loop Claude Code / Codex
use (write → run → observe → revise), scaled down to a local Ollama model.

## Why this fits the existing architecture

The planner already emits phases constrained to `TOOL_CATALOG`; `executeLoop`
already retries transient failures and stops on real ones. `solve_with_code`
is just one more tool — but instead of a fixed implementation, its body is an
**agentic micro-loop** that converges on working code. Nothing else in the
task pipeline changes.

```
executeLoop ─ phase: solve_with_code {goal, expect, mode}
                 │
                 ▼
      ┌──────────────────────────── attempt ≤ 4 ─────────────────────────┐
      │ 1 OBSERVE  content.js digest: url, title, candidate elements     │
      │            (signatures, counts), trimmed container HTML          │
      │ 2 CODEGEN  POST /ai/codegen {goal, expect, digest, attempts[]}   │
      │            → { code, sideEffects, note }   (grammar-constrained) │
      │ 3 EXECUTE  run code in page, sandboxed:                          │
      │            timeout 20s, result contract {ok, data, note},        │
      │            console captured, result ≤ 100 KB                     │
      │ 4 VERIFY   a) deterministic checks from `expect`                 │
      │            b) POST /ai/verify-code → {verdict, reason, hint}     │
      │ 5 fail → push attempt {code, error, resultSample, hint} and      │
      │          loop — the history forces a DIFFERENT approach          │
      └──────────────────────────────────────────────────────────────────┘
                 │ pass → phase done (data saved like any collect tool)
                 ▼ 4 fails → phase error: "code attempts exhausted"
```

## Tool catalog entry (server.js)

```js
{ name: 'solve_with_code', params: ['goal', 'expect', 'mode'],
  desc: 'LAST RESORT when no listed tool can do the job: AI writes JavaScript, '
      + 'runs it on the current page, verifies the result, and rewrites it on '
      + 'failure (up to 4 different attempts). `goal` = what to achieve; '
      + '`expect` = how to tell it worked (e.g. "returns ≥5 rows with name+price"); '
      + '`mode` = "read" (extract/measure/compute — retryable) or "act" '
      + '(changes page state — runs ONCE, never auto-retried).' }
```

`planSchema()` picks it up automatically via `TOOL_NAMES`.

## Execution vehicle (MV3 reality)

MV3 forbids `eval` in extension contexts, so free-form code needs a carrier:

| Priority | Vehicle | Needs | Notes |
|---|---|---|---|
| 1 | `chrome.userScripts.execute()` — USER_SCRIPT world | `userScripts` permission + user enables the "Allow user scripts" toggle (Chrome ≥ 135) | Arbitrary code string, page CSP does NOT apply, isolated from page JS but shares DOM. The clean path. |
| 2 | `chrome.scripting.executeScript({world:'MAIN', func: c => (0,eval)(c)})` | nothing new | Subject to PAGE CSP — works on some sites, not on strict ones. Cheap fallback. |
| 3 | `chrome.debugger` + `Runtime.evaluate` | optional permission `debugger` (request on demand) | Ignores CSP everywhere; also unlocks TRUSTED input events later. Shows the yellow "is debugging" bar while attached — request via `chrome.permissions.request` only when 1–2 unavailable. |

Manifest: add `"userScripts"` to `permissions`, `"debugger"` to
`optional_permissions`. The dashboard/popup should show a one-time setup note
for the user-scripts toggle.

## The `BA` runtime (what generated code codes against)

Small local models write bad raw-DOM code but decent code against a tiny,
documented API. Pre-inject a helper before the generated code (same
userScripts call), and document it in the codegen system prompt — this is the
"tool SDK", exactly like Claude Code's tools:

```js
BA.$(sel) / BA.$$(sel)            // query in page
BA.waitFor(selOrText, ms=8000)    // exponential backoff — the RETRY RULE lives here
BA.click(el)                      // real event sequence (pointerdown/up/click)
BA.type(el, text)                 // bridges to content.js insertIntoLexical via
                                  // window.postMessage — NEVER inserts + fires input
BA.text(el) / BA.attr(el, name)
BA.scroll(times=1)
BA.sleep(ms)
BA.rows(arrayOfObjects)           // stage records → background saves via existing
                                  // schema auto-create flow (same as collect tools)
```

Contract: the model returns ONLY a function body for
`async (BA) => { ...; return { ok, data, note } }`. The wrapper adds timeout,
try/catch, console capture, and size caps. A static pre-flight rejects code
containing `chrome.`, `browser.`, `document.cookie`, `import(`, `fetch(` to
foreign origins (allow same-origin only when the goal needs it), and
`eval`/`Function` nesting.

## Backend endpoints

- `POST /ai/codegen` `{model, goal, expect, mode, digest, attempts[]}` →
  `{code, sideEffects, note}`. Ollama `format` schema so output is always
  parseable; temperature 0; code capped (~4 KB). The system prompt contains
  the full BA API doc + 2 few-shot examples (one extract, one act). Each entry
  in `attempts[]` carries `{approachNote, error, resultSample, judgeHint}` and
  the prompt says explicitly: *do not repeat a failed approach — change
  selector strategy / method*.
- `POST /ai/verify-code` `{model, goal, expect, result}` →
  `{verdict: 'pass'|'fail', reason, hint}` (same pattern as `/ai/verify-record`).
  Deterministic checks run FIRST and skip the LLM when they already decide
  (e.g. `expect.min` rows, required keys present, error thrown = fail).

## The side-effect gate (RETRY RULE compliance)

- `mode:'read'` **and** codegen says `sideEffects:false` → full 4-attempt loop.
- `mode:'act'` or `sideEffects:true` → the code runs **once**. Verification
  still runs, but a failed verdict NEVER re-executes — it surfaces as a phase
  error (or an `ask_user` pause when the plan marked the action sensitive).
  Rationale: a click/post that half-worked must not be replayed (double-post).
- The final thrown error message is phrased to NOT match `executeLoop`'s
  `TRANSIENT` regex — the inner loop already did the retrying.

## Observability

Every attempt logs task events (`think`: approach note; `act`: run N; `obs`:
verdict + reason) and stores `{n, code, error, resultSample, verdict}` in a
`codeRuns` array on the task (new endpoint `POST /tasks/:id/code-run`, or add
`codeRuns` to `PATCHABLE`). The dashboard task view gets a collapsible
"attempt N — code + result" block. This is the Claude-Code-style transcript:
you can always see what code ran and why it was accepted.

## Distillation into skills (the payoff)

A PASSING code run is saved as a reusable **code skill**:
`{kind:'code', host, route, goal, expect, code, baVersion}` — next time the
planner sees the same kind of job on that host it emits `use_skill` instead of
`solve_with_code`, running the stored code directly (still verified; if
verification fails, fall back to fresh codegen and update the skill). This
mirrors how the elements/skills system already turns one-time teaching into
repeatable capability — codegen becomes self-teaching.

## Milestones

1. **M1 — read-only executor.** `userScripts.execute` vehicle + BA runtime
   (no `type` bridge yet) + `/ai/codegen` + deterministic verify + attempts
   loop + task events. Ships value immediately (extraction/computation gaps).
2. **M2 — LLM judge + memory.** `/ai/verify-code`, attempt history with
   "different approach" pressure, dashboard code/attempt viewer.
3. **M3 — act mode.** Side-effect gate, `ask_user` integration,
   `BA.type` Lexical-safe bridge through content.js.
4. **M4 — fallback vehicles.** MAIN-world eval probe, then on-demand
   `debugger` permission + `Runtime.evaluate`; trusted input dispatch for
   pages that ignore synthetic events.
5. **M5 — code skills.** Persist passing runs, planner preference, staleness
   re-verify + auto-regenerate.

## Risks / mitigations

- **Small-model code quality** → tiny BA API, format-constrained output,
  few-shot, 4 attempts with judge hints; code length cap keeps it honest.
- **User-scripts toggle friction** → detect availability at startup; guide the
  user once; fall back per the vehicle table.
- **Security** → static denylist, same-origin network only, timeout, size
  caps, act-mode single-shot + confirmation. Generated code never runs in the
  extension context — only in the page's user-script world.
- **Verification cost** → deterministic checks short-circuit the LLM judge;
  judge only sees a ≤2 KB result sample, never the whole page.
