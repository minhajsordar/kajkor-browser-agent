# Banner designer UI polish — make it feel like a design tool

**Status:** phases 1+2 done (build + tsc green, live on :5456).
Phase 1: header zones + zoom + export dropdown, click-to-add Elements
panel, Quick props inspector, dark centered workspace, canvas keys
(Delete / arrows / Ctrl+D / Esc).
Phase 2: Design/Layers tab in the right panel (name, click-select, drag
reorder = z-order within a parent, hide/show, delete); undo/redo —
`history` slice in the store, every content mutation commits through one
funnel (cap 50), Ctrl+Z/Shift+Z/Y in parent AND iframe (iframe forwards
via postMessage), header buttons; snap guides — canvas edges/centres +
sibling edges/centres, 6px threshold, indigo guide lines during drag.
Phase 3 also done: double-click inline text editing on leaf text elements
(contentEditable, Enter/blur commits, Esc cancels); Elements panel rows
draggable onto the canvas — iframe `CanvasDropZone` lands them at the drop
point (dataTransfer + `window.parent.__bannerDrag` fallback for
cross-document drops); Templates gallery in the left rail — 6 starter
designs in `utils/templates.ts` authored as element trees and converted by
`normalizeBanner`, so templates and AI output share one pipeline.
Known limits: inline edit is leaf-text only (no rich spans); template
positions are authored for 1200×628 and don't reflow for other presets.

## Why

The designer works but still looks like the CMS's dev tool: cramped dark
header, raw-CSS inspector, an awkward select→"insert into"→drop-zone flow,
no way to reach overlapped elements, no undo. The user asked for Canva-like.

## Scope (user confirmed phases 1+2)

### Phase 1 — "feels like a tool" (this plan's active work)

1. **Chrome restyle** — header reorganized into zones:
   left = app mark + banner switcher + inline rename + size preset;
   center = zoom controls (fit / % / +/-);
   right = AI Generate (accent), Save Draft, Publish, Versions, Export
   dropdown (PNG/JPG). Larger targets, icons + labels.
2. **Elements panel** — left-rail button opens a panel of banner primitives
   (heading / subtext / body / button / image / rectangle / container).
   Click inserts onto the artboard (centered), no select→drop-zone dance.
3. **Friendly inspector** — top of the right settings panel gets a "Quick
   props" section: text content (when the element has text), X/Y/W/H
   numeric fields, opacity, background-color swatch, img src/alt. The
   existing CSS panels stay below (they are real power, just secondary).
4. **Canvas workspace** — darker neutral backdrop so the artboard reads as
   a page, zoom modes (fit | %), artboard centered + subtle shadow.
5. **Basic keys (inside the iframe)** — Delete removes selection (+ its
   descendants), arrows nudge 1px (Shift = 10px), Ctrl+D duplicates with
   offset, Esc clears selection. Guard: skip when typing in an input.

### Phase 2 — power (after phase 1 lands)

- **Layers panel** (right side tab): list `body.child` elements with names,
  click-select, drag reorder = z-order, hide/show (`visibility`), delete.
- **Undo/redo**: snapshot `draftPageContentSet` on each commit; Ctrl+Z /
  Ctrl+Shift+Z + header buttons. One linear history per banner session is
  enough — no branching.
- **Snap guides**: canvas center/edge + sibling-edge snap during drag.

### Phase 3 — later (not in scope B)

Inline double-click text editing, drag-onto-canvas insertion at drop point,
templates gallery.

## Approach notes

- Zoom lives in `pageBuilder.zoom` (`'fit'` | percent number) so header and
  iframe preview share it via the existing store + postMessage bridge.
- Click-to-add runs in the parent: `addPageBlock` into `body.child` — the
  bridge pushes it into the iframe. Position = canvas center minus element
  size (defaults when styles lack numbers).
- Iframe-side actions (delete/nudge/duplicate) update the iframe store
  live, then push `builder-content-from-iframe` to the parent — same path
  drag/resize already uses.
- Element removal must delete the uid AND descendants from the map and
  strip the uid from `parent.child` — a pure helper in
  `src/utils/contentOps.ts` reused by layers/shortcuts.
- Keep the dark `--bp-designer-*` theme (all panels already use it) but
  polish: spacing, grouped buttons, one accent color for the AI action.

## Hard parts / risks

- Keyboard listeners must live in the IFRAME document (canvas focus is
  there); the parent still owns persistence — always push content changes
  back through the bridge or saves silently lose them.
- `addPageBlock` inserts by `systemAddedClass` as the map key — new
  elements must set it to a fresh `uid-*` (nanoid) or they collide.
- Zoom = scale multiplier on top of the existing fit-scale transform in
  `PageResponsivePreview`; percent mode replaces fit, it does not stack.
