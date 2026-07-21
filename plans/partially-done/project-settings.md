# Project-wise settings — projects carry config that chats/tasks inherit

**Status:** partially done — **Phases 1 (backend) + 2 (desktop, incl. saved-prompt
picker) + 3 (composer inheritance UX) built**; runtime verification in the
Electron app is the only thing left. Decisions locked (user,
2026-07-20): backend-authoritative collection; project-wise **dynamic (inline
free-text) system prompt** in addition to model/skills/prompt/schemas/workdir; a
session **may override** a project default.

## Why

The user wants settings kept per-project so every chat/task under a project
applies the same config, instead of choosing model/skills/prompt each time.

## Current state (what exists)

- A **project is a local folder**: `{name, dir}`, stored in the desktop app's
  **localStorage** (`ba_projects`), selected as `currentName`. `dir` doubles as
  the `/run` working directory. See `desktop-app/.../stores/projects.js`.
- **No config lives on a project.** The per-task settings that COULD be
  project-scoped already exist, but are chosen per task at creation:
  - `model` (from the sessions store's current `model.value`)
  - `useSkills` (skill ids attached to the task)
  - `systemPrompt` (via `promptId` → the prompts collection)
  - `schemas`
  - workdir/`dir` (already carried, per project)
- Each task **snapshots** `project: {name, dir}` onto the backend task doc, so
  sidebar grouping survives a reinstall. That snapshot is the only backend trace
  of a project — there is no `projects` collection.

So the plumbing to APPLY these settings to a task exists (POST /tasks already
accepts model/useSkills/promptId/schemas). What's missing is a place to STORE a
project's defaults and a step that fills them in when a task is created under a
project.

## Approach

### A backend `projects` collection is the source of truth (recommended)

Add a `projects` store keyed by a stable `projectId` (not name — names get
renamed and collide). Each doc:

```jsonc
{ projectId, name, dir,
  settings: {
    model: null,            // default model for tasks here
    skillIds: [],           // default attached skills
    promptId: null,         // default system prompt
    schemaIds: [],          // default schemas
    // later, tie-ins to other plans:
    launchApps: [],         // host-launch apps allowed in this project [[host-launch-tools]]
    autoApprovePublish: false
  },
  createdAt, updatedAt }
```

Rejected alternative: **keep settings in localStorage** with the project list.
Simpler, but the settings then live only on one machine and do not travel with
the shared backend the way tasks and skills do — and the user's whole data model
is already backend-authoritative (Mongo). Project config belongs with it.

### Inheritance = project fills the DEFAULTS, the task may override

At `POST /tasks`, when `project.projectId` is given and a field is NOT explicitly
set on the request, fill it from the project's `settings`. Precedence:

```
explicit request value  >  project default  >  global default
```

This keeps one-off overrides working ("use a different model just this once")
while making the project the default for everything under it. Do the merge
server-side so every entry point (desktop, extension, a future API) inherits
identically — not in the desktop store, where only one client benefits.

### Desktop UI

- Migrate the localStorage project list into the backend collection on first run
  (keep localStorage as a cache of the current selection only).
- A "Project settings" pane (model, skills, prompt, schemas, workdir) — the same
  controls the composer already has, but saved onto the project.
- The composer shows the inherited values with a clear "from project X" hint and
  lets a session override them.

## Hard parts

1. **Identity.** Projects are currently keyed by NAME in localStorage and on the
   task snapshot. Introducing `projectId` means a migration: mint ids for
   existing local projects, and match old tasks (which only stored `{name,dir}`)
   by name. Two installs that both made a "scraping" project independently will
   collide on name — the migration must handle that (merge or suffix).
2. **Two sources of truth during migration.** localStorage list vs backend
   collection. Pick backend as authoritative and reduce localStorage to
   "currently selected projectId", or they will drift.
3. **Override UX.** Making inheritance visible without being noisy — the user
   must be able to tell whether a session's model came from the project or was
   overridden, or "why is it using that model" becomes a support question.
4. **Stale defaults.** A project default pointing at a deleted skill/prompt/schema
   must degrade quietly (skip it), the same way task fields already validate ids.

## Phases

1. Backend `projects` collection + CRUD (`GET/POST/PATCH/DELETE /projects`), and
   the inheritance merge in `POST /tasks` (explicit > project > global).
   **← DONE + tested (14 integration cases on :4010).**
2. Desktop: migrate local projects → backend; a Project settings pane.
   **← DONE (2026-07-21: dialog now also picks a SAVED prompt `promptId`).**
3. Composer shows inherited-vs-overridden; per-session override.
   **← DONE (2026-07-21, code): a hint under the new-session composer.**
4. Tie-ins (later): project-scoped host-launch apps [[host-launch-tools]],
   approval behaviour.

## Build progress

- **Phase 1 done** (`backend/server.js`): `projects` collection, CRUD, and the
  inheritance merge at `POST /tasks`. `settings` is whitelisted
  (`cleanProjectSettings`): `model`, `skillIds`, `promptId`, `schemaIds`,
  `systemPrompt` (the inline dynamic prompt). PATCH **merges** settings. The
  inline prompt materialises into the task's `{name, content}` systemPrompt shape
  the planner already reads. Deleting a project does NOT orphan its tasks (they
  keep the `{name,dir}` snapshot). `POST /tasks` now requires `goal` + an
  effective model (request model OR project default), not `model` outright.
- **Phase 2 done (desktop, 2026-07-20) — typecheck clean, runtime unverified:**
  1. `projects.js` store is now **backend-backed**: `loadProjects` (GET) with
     migration of local-only projects (POST by name), `addFolder`/`remove`/
     `updateSettings` hit `/projects`, localStorage is a cache + current
     selection. `loadProjects` called from `ChatView` onMount.
  2. `sessions.createSession` sends `project: { projectId }`.
  3. **Override UX resolved as "composer adopts project defaults":** on
     `setCurrent`, `applySettings` pushes the project's model + skills into the
     composer (`sessions.setModel` / `setNewSessionSkills`) and workdir. The user
     can still change them before sending = override; since the request then
     carries those values explicitly, the backend precedence is satisfied. The
     inline system prompt is applied SERVER-side (desktop sends no promptId).
  4. `ProjectSettingsDialog.vue` (model / skills / schemas / dynamic system
     prompt) writes `PATCH /projects/:id`; opened from the project selector's
     "Project settings" item (shown only for a backend-backed project).
- **Phase 2 finished (2026-07-21):** the dialog now also has a **saved-prompt
  (`promptId`) picker** — the backend already whitelisted `promptId` and uses it
  ahead of the inline text at task creation, but nothing set it. The picker
  loads `/prompts` itself (prompts aren't in the library store), and the inline
  system-prompt field disables + says "not used" while a saved prompt is
  selected, so the precedence is visible instead of silent.
- **Phase 3 done (2026-07-21, code):** a caption under the new-session composer
  shows "Model & skills from project X" when the composer matches the project's
  defaults, or "Overriding X's defaults this session · Reset to project" when the
  user has changed the model/skills. `projectHint` (ChatThread.vue) compares
  `store.model`/`store.newSessionSkillIds` against `projects.current.settings`;
  Reset re-runs `projects.applySettings`. Only shown for a backend-backed project
  that sets a model or skills (no noise for "No Project" or an empty project).
- **Editable from each sidebar folder (2026-07-21):** project settings were only
  reachable from the project menu on the new-conversation composer — unreachable
  once you were in a session. Now every project folder in `SessionList.vue` has a
  hover-revealed **tune** button + a context-menu item opening
  `ProjectSettingsDialog` for that project (resolved via `projects.getProject`).
  A first attempt put the button in the chat header; the user asked for it on the
  folders instead ("with each folder … instead of in header"), so the header
  button was dropped.
- **Backend inheritance re-proven (2026-07-21):** a 10-case :4010 integration run
  (scratch `proj-settings-test.js`) confirms explicit model > project default,
  inline `systemPrompt` materialises, saved `promptId` > inline, skills/schemas
  inherit, and no-model+no-project → 400. Docs cleaned up; instance shut down.
- **Left:** live GUI click-through in the Electron app. Compilation IS verified —
  `electron-vite build` compiles all 279 renderer modules clean (2026-07-21), so
  the Vue templates/scripts are sound; only the runtime behaviour (does the hint
  toggle, does the picker save) needs a human at the app.

**Known caveat:** `applySettings` writes the GLOBAL model picker, so selecting a
project changes the app's current model; switching to "No Project" leaves it on
the project's last value rather than reverting. Acceptable for v1 ("adopt on
select"); revisit if it confuses.

## Open questions — need the user's decision

1. **Which settings are project-scoped in v1?** Recommend: model, skills, system
   prompt, schemas, workdir. (Launch-apps and approval behaviour later.)
2. **Backend collection vs localStorage** as the store — recommend backend, to
   match the rest of the data model. Confirm.
3. **Override granularity:** may a single session override a project default
   (recommended), or is the project's config strict for all its sessions?
