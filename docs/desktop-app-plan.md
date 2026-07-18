# Desktop App — chat-first agent workstation (plan)

Direction (2026-07-17): the desktop app is THE product surface — a chat-first
interface like Codex/Antigravity where the user talks to the agent and tasks
run under the hood. The extension is a headless browser executor (popup =
Teach button only). The backend is the shared brain both connect to.

## What we start from (copied scaffolds, both Vue 3 + Quasar + Pinia)

| Path | Origin | Keep | Strip |
|---|---|---|---|
| `desktop-app/` | pos-inventory (Electron + electron-vite + TS main, Vue renderer, SQLite offline sync) | Electron shell, window/lifecycle, preload/IPC pattern, auto-updater, auth store + login view shells | SQLite layer, sync engine, device activation, all POS pages/services |
| `backend/frontend/` | erp (Vite + Vue + Quasar web dashboard) | Vite/Quasar config, layout/components as a parts bin for renderer pages | business pages |
| `D:\...\erp-soft\api-inventory\package.json` | build pattern | `build-server` esbuild bundling of an Express server into `dist-server/server.cjs` for embedding | everything else |

## Architecture

```
┌────────────────────────── Electron (desktop-app) ──────────────────────────┐
│ main process                                                               │
│  ├─ boots EMBEDDED backend  (bundled backend/server.js, PORT=34730)        │
│  ├─ host executor service   (run shell commands — allowlist + confirm)     │
│  └─ IPC: window.api.{auth,chat,tasks,host,settings}                        │
│ renderer (Vue/Quasar)                                                      │
│  └─ chat-first UI: sessions list · chat thread · live task activity ·      │
│     data tables · approvals · skills/elements manager · settings           │
└────────────────────────────────────────────────────────────────────────────┘
        │ HTTP :34730 (loopback, no token needed)          ▲
        ▼                                                  │ 30s ba-task-poll
   MongoDB (shared)                          Chrome extension (executor)
```

- **Port: 34730 fixed everywhere** — backend default, extension `BACKEND_URL`,
  desktop dev-reuse URL, and the embedded (packaged) backend all use 34730.
  (User proposed 3473012 — invalid, TCP ports max at 65535.)
- The extension needs NO push channel: the standing `ba-task-poll` alarm
  (background.js) picks up backend-created tasks within ~30s.

## Auth (backend part DONE — 2026-07-17)

- `POST /auth/register` (first user ever = admin; afterwards admin-only),
  `POST /auth/login` → 30-day JWT, `GET /auth/me`.
- Middleware: **loopback requests are trusted** (extension + desktop app on
  the same machine work with zero config); every non-local request requires
  `Authorization: Bearer <jwt>`. `AUTH_ENFORCE_LOCAL=1` requires tokens even
  locally; set `AUTH_SECRET` in production.
- Desktop app: login screen (adapt `LocalLoginView`) only gates the app UI +
  remote backends; a purely local setup can auto-login as the device owner.

## Chat-first model (the core UX)

One conversation per task session — already backed by the API:

- `POST /tasks {goal, model}` → new session; `POST /tasks/:id/chat {message}`
  → router decides **browse** (new browser round under the hood) vs
  **answer** (reply from collected data); `POST /tasks/:id/compact` shrinks
  long sessions. Events/data/screenshots poll from `GET /tasks/:id`.
- Renderer chat thread renders: user turns, agent replies, an inline
  live-activity block while a round runs (phase chips + event log), inline
  data table when records land, and Approve/Decline bubbles for
  `pendingQuestion` (ask_user).
- **Host commands** become a third route: the chat router gains `host` mode
  ("zip that folder", "run npm test") → task phase `host_exec` → the desktop
  app polls/claims it via IPC-backed executor (never the extension). Same
  confirmation gating as ask_user; output streams back as events. The
  code-executor plan (docs/code-executor-plan.md) plugs into the same slot
  later for in-page JS.

## Milestones

1. **M0 — shell boots**: gut POS pages/SQLite/sync from `desktop-app`;
   embedded server bundling (`esbuild backend/server.js → dist-server`),
   PORT=34730; blank Quasar layout loads; health check green.
2. **M1 — chat MVP**: sessions list (GET /tasks), new-session composer,
   chat thread wired to /chat + /answer + live events poll, model picker
   (GET /models), compact button. This replaces the deleted extension
   dashboard/popup functionality.
3. **M2 — auth + settings**: login/register views → /auth endpoints, token
   store (Pinia), backend URL + port settings, remote-backend support.
4. **M3 — data & teaching surfaces**: schema/records tables, screenshots,
   skills/elements manager (ports of the deleted extension pages), "Teach"
   deep-link note (teaching still happens in the browser via the extension).
5. **M4 — host executor**: `host_exec` tool in TOOL_CATALOG + backend claim
   API, Electron-side runner (spawn with cwd/timeout/output caps), allowlist
   + per-command confirmation UI, results in chat.
6. **M5 — packaging**: electron-builder targets, auto-update, first-run
   wizard (Mongo URI, Ollama check, extension install pointer).

## Risks / notes

- `better-sqlite3` and the sync stack in the scaffold pull native builds we
  don't need — remove early to keep installs clean.
- Two CLAUDE.md files now exist (repo root + desktop-app's POS-era one);
  rewrite `desktop-app/CLAUDE.md` at M0 so agents don't follow stale POS docs.
- Never point two backends at the same Mongo with different code versions
  for long — migrate then switch.
- Host execution is the highest-risk surface: allowlist, confirmation, no
  shell string interpolation from the model (argv arrays), output size caps.
