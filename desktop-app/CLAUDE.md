# Kajkor Agent — Desktop App (Claude guide)

Chat-first Electron workstation ("Kajkor Agent"). The user talks to the agent
here; browser tasks run under the hood via the Chrome extension executor, and
host-machine commands run via a main-process executor. This app is the product
UI — the extension is now popup + Teach button only. ("Browser Agent" was the
old display name; the repo/project is still kajkor-browser-agent.)

> This scaffold was copied from a POS app (pos-inventory). The offline-first
> layers — bundled local mongod, cloud sync engine, device activation — have
> been REMOVED. If you see references to SQLite, activation, or sync anywhere,
> they are stale; ignore them.

## Architecture (decided 2026-07-17)

```
Electron
  main/         boots/points to the Browser Agent backend, creates the window
  preload/      exposes window.api.{app,updater} (contextIsolated)
  renderer/     Vue 3 + Quasar + Pinia + Vue Router (hash) chat UI
        │ HTTP (axios, baseURL from main) + JWT
        ▼
  Browser Agent backend  ──►  shared remote MongoDB
        ▲
  Chrome extension (executor)  picks up tasks via 30s poll
```

- **Backend source of truth:** `../backend/server.js` (CommonJS Express).
  - **Embedded by default (dev AND packaged):** `resolveBackend()` boots the
    backend IN-PROCESS on fixed port **34730** (`EMBEDDED_PORT`, override
    `BA_PORT`) so the extension and renderer always reach it — no separate
    terminal. Dev requires `../backend/server.js`; packaged requires the esbuild
    bundle `resources/server/server.cjs`.
  - **Port already in use → reuse it** (a standalone `node server.js` on 34730
    is not double-booted). `BA_BACKEND_URL` forces an explicit external backend.
  - **Per-install override:** drop `backend-config.json` ({mongoUri,dbName,
    authSecret}) in userData to repoint a packaged app without rebuilding.
- **Data:** shared remote MongoDB (backend's own default URI, or `MONGODB_URI`).
  No local database is bundled.
- **Auth:** backend JWT. Loopback requests are trusted, so the local app works
  without a token; a login screen (M2) is for gating the UI and remote backends.

## Key files

- `src/main/index.ts` — lifecycle; `resolveBackend()` (dev reuse vs embed),
  window creation, `app:getVersion` / `app:getBackendUrl` IPC.
- `src/main/embedded/server.ts` — `startServer()`: sets PORT/MONGODB_URI/
  AUTH_SECRET then `require()`s the backend; waits on `/health`. `EMBEDDED_PORT`.
- `src/main/embedded/paths.ts` — dev→`../backend/server.js`, prod→bundle.
- `src/main/embedded/util.ts` — port/http wait helpers.
- `src/main/{auto-updater,utils/logger}.ts` — kept from the scaffold.
- `src/preload/index.ts` — `window.api.app.getBackendUrl()` is how the renderer
  learns which backend to call.
- `src/renderer/src/boot/backend.js` — the shared axios instance; `initBackend()`
  fills baseURL from main; JWT from `localStorage.ba_token`.
- `src/renderer/src/pages/` — `ConnectionView.vue` (M0 health check). M1 adds
  Chat, Sessions, Settings, Login.

## Backend API the renderer uses

Tasks are conversational sessions (see repo `docs/desktop-app-plan.md`):
`POST /tasks`, `POST /tasks/:id/chat` (routes browse vs answer),
`POST /tasks/:id/compact`, `GET /tasks/:id` (events/data), `POST /tasks/:id/answer`.
Auth: `POST /auth/login|register`, `GET /auth/me`.

## Scripts

- `npm install` first (pulls Electron + Quasar). Then `npm run dev` —
  electron-vite dev (renderer HMR). Needs the backend running on :34730.
- `npm run build` — typecheck + electron-vite build.
- `npm run build-server` — esbuild-bundle `../backend/server.js` →
  `resources/server/server.cjs` (runs automatically as `prebuild`).
- `npm run build:win|mac|linux` — package with electron-builder.

## Roadmap

M0 shell (done: embedded/reuse backend, blank Quasar shell + health check) →
M1 chat MVP → M2 auth + settings → M3 data/skills/elements pages → M4 host
executor → M5 packaging. Full detail: repo `docs/desktop-app-plan.md`.
