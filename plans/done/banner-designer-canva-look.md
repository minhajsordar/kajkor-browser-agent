# Banner designer — Canva-look pass

**Status:** done — light `--bp-designer-*` vars flipped (legacy panels
reskin automatically) + ~65 hardcoded `white/x`/`bg-gray-*` classes moved
to neutral across 64 files; header is Canva's purple→teal gradient; the
selection indicator is now a violet outline with a floating white pill
toolbar (font/size/color/B-I-U/align for text + duplicate/layer/delete/
parent/insert for all); Elements panel renders thumbnail cards; zoom is a
bottom-right pill on the workspace. Build + tsc green.

## Why

Structure now matches Canva (rail + panels + right inspector) but the skin
and the signature interaction don't. User compared side-by-side and wants
the Canva look.

## Gaps → changes

1. **Light theme** — flip `--bp-designer-*` vars to a light palette
   (legacy settings panels + Dialog reskin automatically), then fix all
   hand-written Tailwind `white/x` classes in the new components to neutral
   colors (skip lines carrying `bg-indigo` — accent buttons stay white-on-
   indigo). Workspace `#26262a` → light gray `#edeff2`.
2. **Header** — Canva's purple→teal gradient
   (`#8b3dff → #6420ff → #00c4cc`), white controls.
3. **Floating selection toolbar** — replace the red outline + header/footer
   bars with an indigo outline and a white pill floating above the selected
   element: duplicate, layer up/down (z-order), delete, select-parent,
   insert; text elements also get font-family, size -/+, color, B/I/U,
   align. All actions run in the iframe + push to parent.
4. **Elements panel thumbnails** — 2-col cards with visual previews
   (styled "Aa" for text, mini button, image placeholder, actual shape
   mini for shapes) instead of text-only buttons.
5. **Bottom-right zoom pill** — slider + % + Fit floating over the
   workspace (Canva's placement); header zoom buttons removed.

## Not doing

- Doc title in header center (user asked the banner name removed earlier).
- Canva's "Add page" bar (single-canvas banners, no pages).
- Real webfonts (system stacks only for now).
