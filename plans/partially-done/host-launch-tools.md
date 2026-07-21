# Host-launch tools — open Chrome (by profile) and installed apps

**Status:** not started — proposed 2026-07-20. Needs the user's decisions (below)
before building.

## Why

The user wants the agent to: open a new tab; open Chrome if it isn't running;
open Chrome with a specific profile; open any installed software. Today the
agent can only act *inside* an already-open Chrome — it cannot start a program.

## The split that decides everything

These four asks live in **two different processes**, and conflating them is the
main trap:

| Ask | Where it can run | Status |
|-----|------------------|--------|
| Open a new tab | Chrome extension | **Already exists** — `navigate {newTab:true}`, plus `switch_tab`/`list_tabs`/`close_tab` |
| Open Chrome if not running | Desktop app main process | New |
| Open Chrome with a profile | Desktop app main process | New |
| Open installed software | Desktop app main process | New |

**The extension cannot launch a process.** It executes inside Chrome; there is no
`chrome.*` API to start Chrome or any OS app, and there never will be — that is
the browser sandbox working as designed. So the bottom three MUST run in the
Electron main process, which already spawns processes (`runHostCommand`).

So "open a new tab" is done — nothing to build. The real work is making the
**host executor** reachable as planner tools for launching GUI apps.

## What already exists (reuse, don't rebuild)

- `desktop-app/src/main/host/executor.ts` → `runHostCommand({argv,cwd,timeout})`:
  `spawn` with **shell:false** (no injection), **allowlist-gated** by basename,
  cwd-validated, timeout-killed, output-capped. This is the safe primitive.
- `server.js` → `proposeHostCommand()` turns NL into a validated argv; the
  `/run|/sh|/host` chat flow proposes → desktop confirms → desktop runs → result
  posted back. **The backend never executes** — it only proposes.
- Default allowlist is dev tools (git/npm/node/python/…). **No chrome, no app
  launchers.**

Two properties of the existing executor are wrong for GUI apps and must change:
1. **It waits for the process to exit and captures stdout.** A GUI app does not
   exit and produces no stdout — the call would sit until the 60s timeout and
   report "timed out" for a *successful* launch.
2. **The allowlist is basename-only over CLI tools.** Launching apps needs a
   different, explicitly-managed list (and on Windows/macOS an app is often not
   a bare exe on PATH).

## Approach

### 1. A launch primitive separate from the run primitive

Add `launchApp({ app, args, profile })` beside `runHostCommand`. It **detaches**
(`spawn(..., { detached:true, stdio:'ignore' }).unref()`) and returns as soon as
the process is spawned — success = "it started", not "it exited 0". No stdout.

Per-OS launch, because there is no single portable way:
- **Windows:** resolve a known app to its exe (see registry below), else
  `cmd /c start "" <target>`. Chrome: the real `chrome.exe` so `--profile-directory`
  works (`start` cannot pass Chrome flags reliably).
- **macOS:** `open -a "Google Chrome" --args --profile-directory=…`; generic
  apps via `open -a "<Name>"`.
- **Linux:** the app's binary or `.desktop` via `gtk-launch`; Chrome binary
  directly for profile flags.

### 2. An app registry, not arbitrary exe paths (recommended)

A small curated map of `appId → { win, mac, linux launch spec }` for the apps
that actually matter (chrome, edge, firefox, vscode, explorer/finder, notepad,
terminal…), extended by the user in Settings. Rejected alternative: let the
model emit an arbitrary executable path — that is "run anything on the machine
from a chat message", which is the exact surface the current design refused. A
registry keeps the model choosing from a **known, user-approved** set.

Chrome profiles: enumerate them from Chrome's `Local State` file
(`User Data/Local State` → `profile.info_cache`) so the user (and the model) can
refer to a profile by its display name ("Work"), which we map to its
`Profile N` directory.

### 3. Planner tools, executed by the desktop app

New `TOOL_CATALOG` entries — `launch_app`, `open_chrome` (profile-aware) — but
they are **host tools**: the extension's `executeLoop` cannot run them. Options
for dispatch (open question): (a) the desktop app, which already polls the
backend, picks up host phases and runs them; (b) host phases are split out of
the browser plan entirely. Either way the backend needs to route a host phase to
the desktop, not the extension.

### 4. Security — this is the crux, not a footnote

Launching software from natural language is materially more dangerous than the
browser tools. The existing design made host commands **explicit and confirmed**
on purpose. Options, in the open questions below. The floor, non-negotiable:
- allowlist/registry-gated — never an arbitrary path from the model;
- **shell:false**, args as an array, never a concatenated string;
- the destructive-launch case (an installer, a script) stays confirmed.

## Hard parts

1. **Browser ↔ host coordination.** "Open Chrome with my Work profile and go to
   Gmail" launches Chrome (host) then wants a browser phase to run *in that new
   window*. But the extension only runs in profiles where it is installed, and
   the task's `tabId` targets whatever Chrome the extension lives in. A freshly
   launched profile may have no extension and no backend poll. **v1 should
   probably NOT try to chain a browser task onto a launched profile** — launch
   is launch; browsing that window is a separate, unsolved step. Say so plainly.
2. **"Successful launch" is ambiguous.** Detached spawn returns instantly; we
   cannot know the app truly opened. Report "launch requested", not "opened".
   *(2026-07-21: a follow-up "did it open?" used to be planned as a browser task
   that clicked blindly in the wrong window and failed with "Receiving end does
   not exist". Now `runChatTurn` detects a launch-status question inside a launch
   session — `sessionHasLaunch` + `isLaunchStatusQuestion` — and answers the
   limitation directly instead of browser-planning it. A "how many tabs are
   open?" question (`isTabQuestion`) IS answerable, though — it runs a
   deterministic `list_tabs` round (chrome.tabs.query in the extension's own
   Chrome) and lists the tabs rather than refusing.)*
3. **Windows app resolution.** `start` vs direct exe vs `App Paths` registry key.
   Chrome specifically must be the real exe for `--profile-directory`.
4. **This adds a second executor of planner phases** (desktop app), alongside the
   extension. The backend's task model assumes one executor per phase; routing
   host phases needs care so a browser phase never lands on the desktop and vice
   versa.

## Phases

1. `launchApp` primitive in the desktop main process (detached, no-wait) + a
   launch-allowlist/registry, Settings UI to edit it. Test by launching apps
   directly, no planner. **← DONE (code + resolver unit tests); Settings UI + IPC
   wiring still to do.**
2. Chrome profile enumeration + `open_chrome {profile}`.
3. Wire as planner tools with confirmation; backend routes host phases to the
   desktop app; `repairPlan`/prompt updated.
4. (Only if wanted) coordinate a browser task into a launched profile — the hard
   part, deferred until 1–3 are proven.

## Build progress

- **Phases 1–3 substantially done (2026-07-20):** launcher primitive, IPC bridge,
  confirm flow, backend proposal, and Settings pane all built and tested.
  - Backend: `detectLaunch` (keyword map → appId + profile, NOT the model — 15
    unit cases), a `mode:'launch'` branch in `POST /tasks` AND `runChatTurn`, and
    `POST /tasks/:id/launch-result`. 9 launch-integration cases pass on :4010;
    all prior suites still green (heavy server.js edits, no regressions).
  - Desktop: IPC (`launch:*`) + `window.api.launch` bridge + d.ts; `pendingLaunch`
    flow in the sessions store (`runLaunch`/`denyLaunch`, resolves a profile NAME
    → Chrome dir via `listChromeProfiles`, remembers on approve); a ChatThread
    launch card; a "Launchable apps" Settings pane (per-app "always allow"
    toggle). Main + web typecheck clean.
- **Phase 4 — the ACHIEVABLE half done (2026-07-20):** "open chrome with my Work
  profile and go to gmail" now launches Chrome on that profile AND opens the URL,
  because Chrome navigates itself when given a URL arg — NO extension
  coordination needed. `detectLaunch` extracts a destination (explicit URL, a
  domain, or a known site word → `SITE_ALIASES`), only for browsers; it rides
  through as a positional arg after the profile flag (`resolveLaunch` already
  passes non-`-` args). Also fixed a profile-regex bug: "Work **profile** and go
  to gmail" grabbed "and go to gmail" — suffix form ("X profile") is now matched
  before the prefix form, prefix is a single word, stopwords guarded. 21
  detect + 17 resolver + 12 integration cases pass.
- **Left:** runtime verification on the user's Windows box (GUI launch is
  inherently interactive — spawn/detach/profile flags/URL open can only be
  confirmed live). The FULL Phase 4 — the agent performing CLICKS/collection
  inside a launched profile window — is still genuinely deferred: it needs the
  extension present in that profile AND task-claiming so multiple profiles'
  extensions don't race for one task. That is an architecture decision + live
  testing, not something to build blind. Launch-and-navigate covers the common
  intent without it.
- **Architecture note:** launches go through the SAME propose→confirm→execute
  path as `/run` host commands (idle session + proposal, desktop runs via IPC,
  posts a `launch-result`). The extension is never involved — deliberately, since
  it cannot spawn and a launch is not a browser phase. So the deferred hard part
  (driving the launched window) stays cleanly out of scope.

- **Done:** `desktop-app/src/main/host/launch-registry.ts` (pure registry +
  `resolveLaunch`, no node imports so it unit-tests standalone) and
  `launcher.ts` (`launchApp` detached/no-wait, confirm-first-time via
  `getRememberedApps`/`rememberApp`, `listChromeProfiles` from Chrome's
  `Local State`). 15 resolver cases pass across win/mac/linux incl. the security
  guards (unknown app rejected, profile flag-injection blocked, `-`-args
  dropped). Desktop `tsc --noEmit` clean.
- **Left:** IPC (`window.api` bridge) + a launch-confirm dialog + a Settings pane
  to manage the remembered list; then phases 3–4 (planner tools, host-phase
  routing). Runtime GUI launch is inherently interactive — verify on the user's
  Windows box, not in CI.
- **Known limitation:** a bare-name binary on Linux is assumed present (we can't
  `which` from `fs.existsSync`), so the `gtk-launch`/.desktop fallback is only
  reached when a bin list is empty. Fine for v1 (Windows is the tested target).

## Decisions (user, 2026-07-20)

1. **Gate = the known-app registry; NO per-launch confirmation** (revised
   2026-07-21). Originally "allowlist + confirm-first-time": the first launch of
   an app showed a "Launch this app?" card. The user removed that —
   *"i already told it to open"* — because a launch proposal is only ever created
   from the user's OWN explicit instruction (`detectLaunch` parses their message),
   so the card re-asked something they had just asked for. Now an asked-for launch
   runs immediately (`sessions.runLaunch` is called directly from
   `createSession`/`sendChat`, passing `approved:true`); the outcome shows in the
   transcript. The real safety boundary remains the **registry** — only known apps
   (chrome, edge, firefox, vscode, explorer/finder, notepad, terminal…) can start,
   never an arbitrary path. The main-process `needsConfirm` gate and the Settings
   "always allow" list are now vestigial (the renderer always approves) but left
   in place; the confirmation card was removed from `ChatThread.vue`.
2. **Curated registry**, not arbitrary exe paths. The model may only pick an
   `appId` from a known registry (chrome, edge, firefox, vscode, explorer/finder,
   notepad, terminal…), which the user extends in Settings. Never a raw path
   from the model.
3. **All three OSes** (Windows / macOS / Linux) covered from v1. Windows is the
   user's own machine, so it is the one actually runtime-tested first; the mac
   and linux specs ship but are verified later.

## Still open (decide during build, not blocking)

- **Browser-into-launched-profile coordination** (hard part 1) stays deferred:
  v1 launches, it does not then drive a browser task in the new window.
- **Host-phase dispatch** (approach §3): whether the desktop app picks host
  phases off the backend, or host phases are a separate confirmed action. Lean
  toward the latter for v1 — simpler, and it keeps browser and host executors
  from racing over one plan.
