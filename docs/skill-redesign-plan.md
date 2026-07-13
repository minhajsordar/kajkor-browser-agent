# Skill creation redesign — Elements + Skills (two-step)

Status: PLANNED (not yet implemented)
Owner idea: TODO.md (two-step skill creation)

## Problem with the current design

A skill today is a single document with selectors baked in
(`skills` collection: `{ name, kind, selectors, item, fields[] }`):

- When the site changes its DOM, every skill breaks individually; each must be
  re-taught from scratch. Nothing is shared.
- The same page feature (e.g. the post-item container) is duplicated inside
  every skill that touches it.
- `urlPattern` is a free-text glob with no notion of route params.
- The planner only sees skill names — no per-element semantics to route with.

## New model

**Element** — a named, route-bound pointer to ONE thing on a page. Repointable.
**Skill** — a named bundle of element references + a short intent description.

Repointing one element heals every skill that references it.

### `elements` collection (new)

```js
{
  elementId: uuid,
  host: 'facebook.com',
  route: '/post/[postId]',      // auto-generalized from the URL at introduce
                                // time; slugs editable in the UI
  name: 'post_item',            // snake_case, unique per host
  details: 'One post card in the feed',  // short human description — the
                                // planner LLM reads this to route tasks
  type: 'container' | 'item' | 'field' | 'action' | 'input',
  action: 'click'|'type'|'hover'|'scroll'|null,  // action/input types
  attr:   'text'|'innerText'|'href'|'src'|null,  // field types
  parentId: elementId | null,   // e.g. post_item.parent = post_list
  selectors: [{ strategy, value, score }],  // RELATIVE to parent when parentId
  sample: { tag, role, aria, text },        // signature snapshot (debug/AI re-find)
  sampleHtml: '…',                          // trimmed outerHTML (debug/AI re-find)
  version: 1,                   // bumped on each repoint
  createdAt, updatedAt, lastResolvedAt
}
```

Semantics:

- **Parent chain resolution.** Root elements resolve from `document`; a child
  resolves inside its parent's node. `item`-type elements resolve with
  `querySelectorAll` (repeating); everything else `querySelector`. Example
  chain: `post_list` (container) → `post_item` (item, parent=post_list) →
  `publisher_name` (field, parent=post_item).
- **Route binding.** On introduce, the current URL path is generalized:
  numeric / long-hash segments become `[slug]` params (`/post/98123` →
  `/post/[postId]`). The pattern is editable in the overlay and the manager
  page. Runtime matching converts the pattern to a regex (`[x]` → `[^/]+`).
- **Repointing.** "Re-introduce" keeps `elementId` + `name` + all skill
  references. New selectors are inserted at the top score; the previous
  selectors are KEPT as lower-score fallbacks (the resolver already walks
  ranked candidates, so old selectors provide free resilience). `version++`.

### `skills` v2

```js
{
  skillId, host,
  name: 'collect_feed_posts',
  details: 'Collect publisher + text + link from home feed posts',
  elements: [{ elementId, order: null }],   // order only for action sequences
  createdAt, updatedAt
}
```

- A skill whose elements form container+item+fields ≡ today's "collection"
  skill (drives `collect_by_skill`).
- A skill of action/input elements is a step bundle (drives `use_skill` /
  future `run_skill` sequence runner).
- Open decision: ordered vs unordered. Recommendation: unordered by default,
  optional `order` for action bundles.

## Backwards compatibility (make-or-break)

- `GET /skills/:id?resolve=1` — backend hydrates element refs into EXACTLY the
  legacy runtime shape (`selectors`, `item.selectors`, `fields[]`).
  `background.js` (`use_skill`, `collect_by_skill`) and `content.js`
  (`resolveOne/resolveItems/readField`) are untouched in phase 1.
- One-time migration script:
  - collection skill → container/item element (from `item.selectors`) + one
    field element per field (`parentId` = the item element) + v2 skill doc
    referencing them.
  - action skill → one action element + v2 skill doc.
  - `urlPattern` → `route` (best-effort: strip host, keep glob as-is or
    convert `*` → `[slug]`).

## Learning overlay (learn.js) — two tabs

**Tab 1 — Introduce element**
- Click an element on the page → panel: name (✨ AI-suggest stays), type,
  action/attr, details, route pattern (prefilled generalized, editable),
  parent.
- Parent auto-detect: resolve all introduced elements for this route; the
  INNERMOST resolved node containing the clicked node is suggested as parent
  (selector computed relative to it). User can override via dropdown.
- "Repoint existing…" dropdown: pick an existing element for this route →
  replaces its selectors (keeps id/name/references) instead of creating new.
- Badges: outline every introduced element that resolves (label = name);
  elements that DON'T resolve are listed red — "needs repointing".

**Tab 2 — Compose skill**
- Checkbox list of this host's elements (grouped by route) → skill name +
  details → save.
- Keep a "quick skill" one-click path (introduce + auto-wrap in a
  single-element skill) so trivial cases stay as fast as today.

## Skills manager page

- **Elements panel** — grouped host → route. Edit name/route/details/parent.
  "Test on live page" button → new `RESOLVE_ELEMENTS` content message returns
  per-element match counts (green/red health). Repoint button deep-links to
  the page and starts the overlay in repoint mode.
- **Skills panel** — edit name/details, add/remove element references.
  (Replaces the old "clone action into collection" hack.)

## Planner integration

- System prompt lists each skill with its element names/types/details:
  `- skill "collect_feed_posts" — Collect posts from home feed. elements:
  post_list(container), post_item(item), publisher_name(field:text),
  post_link(field:href) [route /]`.
- Element `details` are what let small local models route correctly — the UI
  should nudge for a few descriptive words.
- New tool (phase 4) `run_skill(skill, params)` — executes an ordered action
  bundle (click → type → click …) for "repetitive/one-time runner" workflows.

## Phases

| Phase | Scope | Notes |
|---|---|---|
| 1 | `elements` CRUD + `/elements/:id/repoint`; route utils (generalize/match); migration script; `?resolve=1` compat resolver; background fetches resolved skills | No user-visible change; ship silently |
| 2 | Overlay rework: Introduce/Compose tabs, parent auto-detect, route editor, repoint flow, element badges | Biggest UI change |
| 3 | Skills page rework: elements panel + live health + skill composer | |
| 4 | Planner prompt upgrade; `run_skill` sequence tool | |
| 5 | Self-healing (optional): task runtime marks unresolvable elements broken; AI re-find candidate selectors from `sampleHtml`, user confirms | Later |

## Open decisions

1. Skill elements ordered or unordered? (rec: unordered + optional order for
   action bundles)
2. Element name uniqueness per host (rec) or per host+route?
3. Should repoint keep unlimited selector history or cap at N fallbacks?
   (rec: cap ~4)
