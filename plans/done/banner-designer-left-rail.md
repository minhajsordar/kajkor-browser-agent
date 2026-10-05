# Banner designer — Canva-style left rail with 6 menus

**Status:** done — 64px labeled rail (AI accent, Templates, Elements, Text,
Brand, Uploads, Projects) over the existing left-position Dialogs; Elements
panel has search + a Shapes category; Text/Brand/Projects panels are new.
Build + tsc green.

## Why

The 40px icon-only rail is cryptic — users can't discover panels. Canva's
pattern is a labeled icon strip where each item opens a contextual panel.
The user picked 6 menus: **Templates, Elements, Text, Brand, Uploads,
Projects** — with AI Generate kept as the accent action at the top.

## Design (from the Canva screenshots)

- Rail widens 40px → 64px; each item = icon + small label underneath,
  stacked vertically. Active panel's item highlights.
- Clicking a rail item opens the existing left-position Dialog panel —
  but panels get a consistent look: title, search box where relevant,
  section headings, card/button list items.
- All six panels:

| Menu | Panel contents |
|---|---|
| Templates | existing gallery (name + swatch cards) — restyle only |
| Elements | add search filter + new Shapes category (circle, pill, divider) |
| Text | NEW — "Add a heading/subheading/body" presets + font-combination blocks (nested h1+p container) |
| Brand | NEW — localStorage brand kit: color swatches (click applies to selected element — text color if text, else background) + font-family presets + add-your-own color |
| Uploads | existing assets/media panel — renamed label only |
| Projects | NEW — banner list (name, size, updated) → open / create / delete |

## Layout offsets to update

Rail 40px → 64px touches: `page.tsx` (preview `left-[40px]`, rail width),
Dialog `left` offsets (`40px` → `64px`) in every *Button dialog,
`BlocksList` overlay unaffected.

## Notes / limits

- Brand kit lives in localStorage (per-browser) — no DB table for now.
- Projects panel navigates via full reload `?bannerId=` — store resets,
  which is correct for switching documents.
- Font combos use system font stacks only (no webfont loading yet).
