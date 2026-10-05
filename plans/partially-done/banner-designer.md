# Banner Designer — standalone AI banner agent + Canva-like editor

**Status:** partially done — everything below is built and the app runs
(`npm run dev`, port 5456). Verified: build + tsc clean, banner CRUD /
drafts / publish / versions, agent endpoint end-to-end with
`qwen2.5:3b-instruct` (~1 min for a real design). Not yet verified in a real
browser by the implementer: drag-to-move, corner resize, PNG/JPG export,
assets upload. Known caveat: local models are slow (1–5 min); pass
`model: "qwen2.5:3b-instruct"` for speed or `qwen2.5:7b-instruct` for quality.
Still open: vision-model critique loop (qwen2.5vl:7b is installed — could
screenshot → critique → revise), kajkor-side caller that invokes the agent
endpoint, and richer blocks (gradients presets, shapes, templates).

## Why

The kajkor browser agent needs to produce image banners. The `banner-designer/`
folder contains a stripped-down copy of a multi-tenant ecommerce CMS whose only
valuable part is its visual page builder. This plan turns that project into a
standalone **banner design agent**: the kajkor agent delegates design work to
it (sub-agent over HTTP), and a human designer can then adjust the result in a
Canva-like editor.

Decisions confirmed with the user: keep MongoDB, AI via Ollama called from a
Next API route, keep the existing element JSON model, and include PNG/JPG
export, version history, multi-size presets, and image uploads.

## Architecture

- Next.js app (existing code, stripped) on port **5456**.
- MongoDB via existing mongoose setup (`MONGO_URI`). Collections:
  `banners`, `banner_drafts`, `banner_versions`, `media`.
- The kajkor agent calls `POST :5456/api/agent/design` with an instruction and
  gets back `{ bannerId, builderData }`. It can open
  `http://localhost:5456/?iframe=true&bannerId=<id>` in a tab to screenshot the
  result, or send the designer link to the user.
- A human designer opens `http://localhost:5456/?bannerId=<id>` for the full
  editor.

## Canvas model (keep existing element JSON)

- The `body` element becomes the **artboard**: fixed `width`/`height`,
  `position: relative`, `overflow: hidden`. Banner size presets set these
  styles plus `pageBuilder.width/height` (iframe intrinsic size).
- Direct children of body are `position: absolute` with `left`/`top` —
  free placement like Canva. Nested containers still allowed.
- Drag-to-move runs inside the preview iframe: mousedown on the selected
  element → update `left`/`top` styles locally in the iframe store AND
  postMessage the new content set to the parent (new message type
  `builder-content-from-iframe`, handled in ParentState →
  `updatePageContentState`). Round-trip is idempotent because ParentState
  already echoes content back.
- Resize: extend `SelectedElementIndicator` with corner handles → same update
  path for `width`/`height`.
- Elements palette reduced to banner primitives: container (div), text
  (h1/h2/p/span), button, image. `img` needs `attributes: {src, alt}` support
  added to `PageBuilderElementRenderer` (the model has no attribute field
  today).

## API surface

- `GET/POST /api/banners`, `GET/PATCH/DELETE /api/banners/[id]`
- `GET/POST /api/banner-drafts` (save = create draft; latest draft loads)
- `POST /api/banners/[id]/publish`, `GET /api/banners/[id]/published`
- `GET /api/banners/[id]/versions`, `POST .../versions/restore`
- `POST /api/agent/design` — `{ instruction, bannerId?, preset?|width?,height? }`
  → Ollama `/api/chat` (`OLLAMA_URL`, `OLLAMA_MODEL`, `format: 'json'`) →
  `normalizeBanner` (pure util: ensure uids == systemAddedClass keys, valid
  child refs, artboard + absolute styles) → save banner + draft → return JSON.
  With `bannerId`, the current builderData is sent for revision instead of
  generation from scratch.
- `GET /api/media`, `POST /api/upload` (de-tenanted versions of existing code;
  files still land in `public/uploads` via `filehandler`).

## Builder UI changes

- `/` hosts the designer shell (was `/site/[siteId]`); `?iframe=true` keeps
  rendering the bare canvas — now also self-loads a banner when `bannerId` is
  in the URL and no parent bridge exists (preview/screenshot mode for kajkor).
- `PageManager` → `BannerManager`: banner dropdown + create (name + size
  preset). `siteFetch` becomes plain `fetch` (drop `x-site-id`).
- `DevActionHeader`: banner name, size-preset select, Save Draft / Publish /
  Versions / Export PNG|JPG. Breakpoint icons removed (fixed-size canvas).
- `LeftToolbar`: Assets (real `/api/upload` + `/api/media`, click an asset →
  insert `img` element), AI Generate dialog (prompt → `/api/agent/design` →
  `updatePageContentState`).
- `BlocksList`: banner primitives only.
- Export: `html-to-image` on the iframe's artboard node (same-origin iframe)
  at exact canvas pixel size.

## What gets deleted

- Routes: `admin/`, `blog/`, `cart/`, `category/`, `checkout/`, `login/`,
  `product/`, `products/`, `register/`, `super-admin/`, `site/`, `[pageSlug]/`,
  `robots.txt`, `sitemap.xml`, `template.tsx`, all of `api/` except the new set.
- Components: `admin/`, `auth/`, `blocks/` (all system blocks — `pageBlocksMap`
  becomes empty), `blocks-renderer/published/`, `context/`, `navigations/`,
  `storefront/`, `super-admin/`.
- `actions/`, `services/`, `middlewareFunctions/`, `proxy.ts`,
  `store/cartStore.ts`, all models except media + the three new banner models,
  tenant/paypal/token utils, dead hooks.
- Deps: `bcryptjs`, `jsonwebtoken` (+types), `swiper`, `react-bootstrap`,
  `moment-timezone`, `paypal` util. Add `html-to-image`. Audit the rest
  (MUI, color pickers, bootstrap css) during build.

## Hard parts / risks

- Styles only render when `systemAddedClass` is set — normalizer must assign
  `uid-*` classes to every AI-produced element and make map keys match.
- AI output quality: schema prompt must be tight; normalizer repairs common
  breakage (missing keys, camelCase style keys are fine — renderer kebab-cases
  them, missing `child` arrays, children of body lacking `position:absolute`).
- `node --check`-equivalent for TS: verify with `npm run build` (tsc) since
  there is no lint/test setup in this project.
- Keep `bootstrap.min.css` import initially (some panels may rely on it);
  revisit after the build is green.

## Phases

1. Delete CMS code + fix imports until `tsc` is clean.
2. Banner models + API routes.
3. Designer shell rework (route, BannerManager, header, toolbar).
4. Canvas: artboard + drag/resize + img attributes.
5. Blocks palette + assets panel.
6. Agent endpoint + normalizer + AI dialog.
7. Export + preview mode + presets.
8. Deps/docs/memory cleanup, final build.
