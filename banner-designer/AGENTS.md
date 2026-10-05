# AGENTS.md — banner-designer

Standalone AI banner-design agent + Canva-like visual editor, stripped down
from a multi-tenant ecommerce CMS. Only the page-builder core survives.

**Role in the system:** the kajkor browser agent delegates banner work here.
It calls `POST :5456/api/agent/design` with an instruction, gets back
`{ bannerId, builderData, editorUrl, previewUrl }`, and can screenshot the
design by opening `previewUrl` in a tab. A human designer then refines the
result at `http://localhost:5456/?bannerId=<id>`.

## Stack

- Next.js 16 (Turbopack, app router) + React 19 + TypeScript, port **5456**
  (`npm run dev` / `npm run build` / `npm start`). Install with
  `npm install --legacy-peer-deps` (@mui/base has a stale React-18 peer range).
- MongoDB via mongoose (`src/config/db.ts`, `MONGO_URI` env). Single tenant —
  no site resolution, no auth. DB `banner_designer` on the shared Mongo host.
- Ollama at `OLLAMA_URL` (default `http://localhost:11434`). Model choice:
  request `model` field → `OLLAMA_MODEL` env → auto-pick (prefers 7b+ instruct).
  Local models are SLOW — expect ~1–5 min per generation.

## The element model (inherited — do not redesign casually)

`builderData` is a flat `uid -> element` map. `body` is the artboard: fixed
`width`/`height`, `position: relative`, `overflow: hidden`. Direct children of
body are `position: absolute` + `left`/`top` px — free placement, Canva-style.

- `systemAddedClass` is the CSS hook: `PageBuilderCssRenderer` emits
  `.{systemAddedClass}{...}` per element — it MUST equal the element's map key.
- Styles live at `style.light.<breakpoint>.{styles,custom,hover}`; breakpoints
  other than `default` are legacy baggage but must exist on every element.
- `text` holds text content; `attributes` (added for this project) carries
  `img.src`/`alt` etc. — `PageBuilderElementRenderer` spreads it onto the tag.
- AI output goes through `utils/normalizeBanner.ts`, which accepts BOTH a
  simple element tree (`{styles, children:[{tag,text,styles,children}]}` —
  what the prompt asks for) and the flat map, and repairs it into valid
  builderData. Keep it pure — it is the trust boundary for model output.

## Runtime wiring

- `/` renders the designer shell; `?iframe=true` renders the bare canvas.
  The canvas runs INSIDE an iframe (`PageResponsivePreview`) — state syncs via
  postMessage: parent→iframe `builder-setting-state`/`builder-content-state`,
  iframe→parent `builder-state-from-iframe` (selection) and
  `builder-content-from-iframe` (drag/resize commits, added here).
- Standalone preview: `?iframe=true&bannerId=X` self-loads the banner
  (`BannerDraftLoader` runs in both modes) — this is the kajkor screenshot URL.
- The editor iframe fills the workspace (`&editor=true` → pasteboard +
  editor CSS). Inside it, `.canvas-stage` (inset:0, flex-centred) scales the
  artboard via `transform: scale(--canvas-scale)`; zoom/fit is computed in
  the iframe from `pageBuilder.zoom` → CSS var + `window.__canvasScale`.
  Drag/resize/drop divide viewport deltas by that scale. Selection chrome
  lives outside the stage and positions with `position:fixed` from
  `getBoundingClientRect` — never use `position:absolute` for overlays here
  (containing-block offsets break it). Scale stays OFF `.banner-canvas`
  itself so exports capture a clean node.
- Drag-to-move + 8-point resize + rotate live in the iframe renderer /
  `SelectedElementIndicator`: local zustand updates during the gesture,
  content pushed to parent on mouseup.
- Zustand store: `src/store/builderStore.ts` (`pageBuilder` + `pageContent`
  slices; `draftPageContentSet` is the live document).

## API surface

- `GET/POST /api/banners` · `GET/PATCH/DELETE /api/banners/[bannerId]`
- `GET/POST /api/banner-drafts` (latest draft loads first; capped at 20)
- `POST /api/banners/[id]/publish` · `GET /api/banners/[id]/published`
- `GET /api/banners/[id]/versions` · `POST .../versions/restore`
- `GET /api/media?type=image` · `POST /api/upload` (multipart `file`, saved to
  `public/uploads`, tracked in `media`)
- `POST /api/agent/design` — `{instruction, bannerId?, preset?|width?,height?,
  model?, name?, images?}` (images = ≤4 data-URL/base64 references). Without
  `bannerId` it generates + creates a banner; with it, it sends the current
  draft to the model and saves the revision as a draft. Returns `{bannerId,
  draftId, builderData, warnings, model, editorUrl, previewUrl}`.
- With `images` the route runs TWO stages: a vision model describes the
  reference in words, then the text model writes the JSON tree from that
  description (small vision models truncate/stall on full JSON). `pickModel`
  must never return a text model for the vision stage — images sent to one
  are ignored or error.

## Conventions / gotchas

- Elements on the canvas get styles ONLY through emitted CSS — an element with
  no `systemAddedClass` renders unstyled. The normalizer guarantees it.
- `position: absolute` is enforced on artboard children by the normalizer and
  by every block in `blocks-list/registeredBlocks.ts` — keep it that way.
- Insert flow: select an element → "Insert into selection" → BlocksList panel
  → drag a block into the drop zones. To add to the canvas itself, select
  `main` (the artboard) first.
- Export PNG/JPG runs client-side via `html-to-image` against the iframe's
  `.banner-canvas` node — cross-origin images without CORS headers will blank
  or fail the export.
- The `.env` `MONGO_URI` is the shared remote Mongo (db `banner_designer`).
  Never commit a URI into source.
- Bootstrap css is still imported in `layout.tsx` — the settings panels were
  built against it; removing it changes their look.
- Verification: `npx tsc --noEmit` and `npm run build`. No test suite exists.
