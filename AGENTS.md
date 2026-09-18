# AGENTS.md — kajkor-browser-agent

Start here, then read the two files that actually carry the project's knowledge:

- **`CLAUDE.md`** — the invariants you must not break, and the layout.
- **`PROJECT_MEMORY.md`** — what already exists, what was decided, and why.
  Read it BEFORE planning work and update it in the SAME change.
- **`plans/`** — plans for unfinished work, foldered by state
  (`not-started/`, `partially-done/`, `done/`). Write the plan before the code.

## Required environment

The backend reads these from the environment and has **no fallback** for the
first one — it exits if it is missing (see CLAUDE.md, "no secrets in the repo"):

| var | required | notes |
|---|---|---|
| `MONGODB_URI` | **yes** | shared remote Mongo. Never commit it. |
| `AUTH_SECRET` | no | unset ⇒ random per process, so tokens die on restart |
| `MONGODB_DB` | no | defaults to `browser_agent` |
| `OLLAMA_URL` | no | defaults to `http://localhost:11434` |
| `PORT` | no | defaults to `34730` (fixed; the extension targets it) |
| `CORS_ALLOWED_ORIGINS` | no | comma-separated extra origins |
| `AUTH_ENFORCE_LOCAL` | no | `1` ⇒ require a token even on loopback |

## Commands

```bash
# backend
cd backend
npm test                 # node --test, 169 pure unit cases, <1s, no DB
npm run test:api         # e2e: boots a 2nd instance on :4010; needs MONGODB_URI
MONGODB_URI=... npm start # port 34730

# desktop app (Electron + Vue/Quasar)
cd desktop-app
npm run typecheck        # tsc over the main/preload process
npm run build            # typecheck + electron-vite build (bundles the backend)
npm run dev              # electron-vite dev
```

Per-file syntax check for anything you touched: `node --check <file>`.

## Verification before finishing

1. `node --check` every changed `.js` file (the extension has no build step, so
   this is the only thing that catches a typo before Chrome does).
2. `cd backend && npm test`.
3. `cd desktop-app && npm run typecheck` if you touched `src/main` or
   `src/preload`.
4. Do **not** restart the user's backend on 34730. For end-to-end API checks use
   `npm run test:api` (boots a second instance on :4010 and shuts it down), or
   boot your own on another port — clean up any documents you created (Mongo is
   the real shared DB).

## Things that are easy to get wrong here

- The extension has no bundler. `background.js` / `content.js` / `learn.js` are
  loaded as-is, and a change needs the unpacked extension **reloaded** in Chrome.
- Tool names in `extension/background.js` MUST match `TOOL_CATALOG` in
  `backend/server.js`.
- Task fields the extension PATCHes must be in `PATCHABLE` (server.js) or the
  update is silently dropped.
- Anything that locates a page element goes through `withBackoff` — see the
  RETRY RULE in CLAUDE.md.
