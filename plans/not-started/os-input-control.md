# OS-level mouse + keyboard control ("computer use")

**Status:** NOT STARTED — proposed 2026-09-18. User asked for full mouse and
keyboard access ("move the mouse and use the keyboard"). Scope decided: **real
OS-level control**, not just trusted input inside Chrome tabs. Needs the user's
decisions (bottom) before building.

## Why

The user wants the agent to control the real cursor and real keyboard — not
simulated DOM events. The extension can never do this: it executes inside the
Chrome sandbox and there is no `chrome.*` API for OS input. The only process in
this project that can move the OS cursor is the **Electron main process** —
the same place `runHostCommand` and `launchApp` already live.

## What already exists (reuse, don't rebuild)

- `desktop-app/src/main/host/executor.ts` — `runHostCommand`: allowlist-gated,
  shell-free spawn. Established precedent that host-side capability is gated
  and never model-arbitrary.
- The **propose → execute → post-result** pattern: backend builds a proposal
  (`proposeHostCommand` / `detectLaunch`), the desktop app runs it via
  `ipcMain.handle('host:*')`, and the outcome is recorded in the session
  transcript (`POST /tasks/:id/host-result`, `/launch-result`). Input control
  rides the same rails — the backend never executes input itself.
- Electron's `desktopCapturer` (screenshots of the whole screen) and `screen`
  (display geometry, cursor position) — **already available in the main
  process, zero new dependencies**. This is half of "computer use" for free.
- `globalShortcut` — a truly global hotkey registration, needed for the kill
  switch below.

## Approach

### 1. An input primitive in the main process

New module `desktop-app/src/main/host/input.ts`, beside `executor.ts` /
`launcher.ts`. One function, e.g.
`runGesture(steps: InputStep[]): Promise<InputResult>`, executing a **batch**
atomically:

```
move {x,y} | click {x,y,button} | dblclick {x,y} | drag {from,to}
scroll {x,y,dx,dy} | key {key|combo} | type {text} | wait {ms}
```

Batching matters: a chat round-trip per mouse-move would be unusable. The
model (or the user's literal instruction) produces one gesture; the main
process runs it start-to-finish and reports once.

**How the events get sent — dependency decision:**

| Option | Verdict |
|---|---|
| **`koffi` FFI → `SendInput`/`SetCursorPos`** (Windows), `CGEventPost` (macOS), XTest (Linux) | **Recommended.** Prebuilt binaries for Node AND Electron (no node-gyp), tiny, and `SendInput` is real driver-level input — same thing Windows itself generates. Win v1 first. |
| Bundled PowerShell + `Add-Type` C# script via `spawn` | Zero-dep fallback. Works (`SetCursorPos`, `SendInput` P/Invoke), but ~200-400ms process startup per call — acceptable for batched gestures, ugly for anything interactive. Good for a same-day prototype. |
| `@nut-tree/nut-js` | **Rejected for now.** Went subscription in 2025: prebuilt packages are $20/mo; the OSS core must be built from source (CMake + compilers per platform). Revisit if the project ever subscribes. |
| `robotjs` | Rejected — effectively unmaintained, needs node-gyp rebuild against Electron's ABI. |
| `webContents.sendInputEvent` | Rejected for this goal — only injects into the Electron app's OWN window, not OS-wide. |
| `chrome.debugger` `Input.dispatch*` | Rejected *for this goal* — trusted input but only inside the attached tab, yellow banner, DevTools conflict. Still worth doing separately later as "trusted input in tabs" — it complements, doesn't replace, OS input. |

### 2. Targeting — how does a step know where to click?

This is the actual hard problem (sending input is easy). Three sources, in
increasing order of ambition:

- **a) Literal steps.** "Move the mouse to 500,300 and double-click" — the
  backend parses/dictates coordinates directly. Trivially works v1.
- **b) DOM element → screen coordinates.** The extension already knows any
  element's viewport rect (`getBoundingClientRect`). Add the Chrome window's
  screen position (Windows: `GetForegroundWindow`/`GetWindowRect` via koffi,
  or the window bounds Electron can query) + content-area offset (Chrome
  toolbar height — obtainable from `chrome.windows` `innerHeight` vs window
  height? needs care) → real screen point. This makes *"click the Post button
  with the real mouse"* work — the agent's existing element knowledge becomes
  real cursor coordinates.
- **c) Screenshot → vision loop.** `desktopCapturer` captures the screen; a
  vision model returns pixel targets; `input.ts` executes; repeat. This is the
  full "computer use" agent (Claude Computer Use / Operator pattern). Needs a
  vision-capable Ollama model (llava / qwen2.5vl / llama3.2-vision) — the
  current planner is text-only. **Deferred to a later phase; do not build the
  loop before the primitive is proven.**

### 3. Dispatch — same rails as host commands and launches

The extension is **never** involved (it cannot see OS input, and per the
host-launch decision, host actions stay out of browser phases). Flow:

1. User asks in chat (e.g. "move the mouse to the Start button and click", or
   a detected intent like `detectLaunch` does for launches — `detectInput`
   keyword map OR a model step, same question launch faced).
2. Backend builds a gesture proposal → stored on the session.
3. Desktop app picks it up (poll, like `pendingLaunch`/`pendingHost`) →
   `input.ts` runs it via a new `host:gesture` IPC.
4. Outcome posted to `POST /tasks/:id/input-result` (mirroring
   `host-result`): recorded as a transcript turn with `meta: {input:true}`.

### 4. Safety — the crux, not a footnote

Real input can click **anything on the machine** — a real Delete button, a
real Send. This is a step past the launch registry in danger:

- **Kill switch, non-negotiable.** While input is armed, a global hotkey
  (`globalShortcut`, e.g. Ctrl+Alt+K — NOT bare Esc, which the app would be
  stealing from the user constantly) aborts mid-gesture and disarms. A tool
  that moves your real mouse without a panic button is a trap.
- **Bounded batches.** Max steps per gesture, max duration, per-step delay
  floor so a runaway gesture is visible and stoppable.
- **Gate level — user decision below.** The launch precedent says: if the user
  literally dictated the action, run it (no re-confirm). But a
  *model-composed* batch clicking at model-chosen pixels is different —
  recommend a summary card for model-derived gestures at least in v1.
- **Foreground check (cheap, worth it):** before firing, read the foreground
  window title via koffi and log it; abort if a UAC/secure-desktop prompt is
  up (SendInput silently no-ops there anyway — better to report it).

## Hard parts

1. **DPI / coordinate spaces.** Three different pixel spaces exist:
   `getBoundingClientRect` = CSS px in viewport; Electron `screen` = DIP;
   `SendInput`/`SetCursorPos` = physical px. `screen.getPrimaryDisplay().scaleFactor`
   does the conversion — get it wrong on a 125%/150% display and every click
   lands 25-50% off. Test on the user's actual display scaling early.
2. **Chrome window position** for DOM→screen mapping. `GetWindowRect` gives
   the outer window incl. title bar; the content offset (tab strip + toolbar
   height) varies with Chrome UI state. Getting the content origin right is
   fiddly — one approach: have the extension compute a known reference point.
3. **Elevated windows.** `SendInput` from a non-elevated process cannot inject
   into elevated apps (UIPI) — clicks on Task Manager / admin prompts silently
   fail. Report "no effect there", don't pretend.
4. **Vision model availability** gates phase (c). Local Ollama vision models
   exist but the user's current planner is text-only — a screenshot loop
   without one can't aim.
5. **Focus and pacing.** OS input goes wherever focus is; a gesture that
   assumes Window A focused while the user alt-tabs mid-run types into
   Window B. Foreground-check between steps, not just at start.

## Phases

1. **`input.ts` primitive + IPC + a manual test path** (e.g. a hidden
   `/gesture` dev command or a Settings test button): move cursor in a square,
   click, type into Notepad. Proves the dependency choice on the real Windows
   box before any agent wiring.
2. **Backend proposal flow**: `detectInput`/`proposeGesture` → session
   proposal → desktop `host:gesture` → `/input-result` in transcript. Kill
   switch + batch caps in this phase, not later.
3. **DOM→screen mapping**: extension reports element viewport rect, main
   process resolves Chrome window rect + content offset → real click on a
   real element. This is the "it actually clicks the button I named" payoff.
4. **(Only if wanted + a vision model exists) screenshot loop**: desktopCapturer
   frames → model → gestures, bounded iterations. The true "computer use" mode.

## Alternatives rejected

- **Extension-only via `chrome.debugger`.** Doesn't meet the ask — it is
  tab-scoped trusted input, not OS control. Kept as a possible *separate*
  plan (it also unlocks network body capture, per the code-executor plan).
- **Native messaging host.** A separate native binary for the extension to
  reach OS input — extra install surface when the Electron app already is
  the host-side component.
- **Driving a Playwright/CDP browser instead.** Real input inside its own
  controlled browser, but it's a second browser the user didn't open — the
  whole point of this project is acting on the user's real session.
- **Letting the model emit arbitrary input at will.** Same reasoning the
  host-command allowlist was built on: batched, bounded, gated — never a
  live wire from model output to the HID layer.

## Open questions for the user

1. **Gate level for gestures.** (a) Run anything the user literally dictated
   with no confirm (launch precedent), but card-confirm model-composed
   gestures; (b) confirm every gesture; (c) no confirm at all.
   Recommendation: (a).
2. **Dependency**: `koffi` (recommended — real SendInput, prebuilt) vs the
   zero-dep PowerShell prototype to validate UX first, then koffi?
3. **Scope limit v1**: input anywhere on screen, or constrain phase-1-2 to
   coordinates inside the Chrome window only (until targeting is proven)?
4. **Kill-switch hotkey** preference — Ctrl+Alt+K suggested; must be global
   and unlikely to collide.
5. **Is a vision model on the table?** If the user can run llava/qwen2.5vl
   locally, phase 4 (screenshot loop) becomes real; otherwise it stays
   documented-only.
