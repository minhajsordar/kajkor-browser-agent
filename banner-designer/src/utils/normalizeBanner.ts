/**
 * normalizeBanner — repair arbitrary model output into a valid builderData map.
 *
 * Accepts two input shapes:
 *
 * 1. TREE (preferred — what the prompt asks for, and what small models
 *    naturally produce):
 *      { styles: {...}, children: [ { tag, text, styles, attributes, children: [...] } ] }
 *    The root object is the artboard; children flatten recursively.
 *
 * 2. FLAT MAP (the storage format itself):
 *      { body: {...}, "uid-x": {...} }
 *
 * Output is always the flat map the renderer + settings panels expect:
 * - a `body` root element (artboard: fixed size, position:relative, overflow:hidden)
 * - elements keyed by uid == systemAddedClass (the CSS hook styles emit under)
 * - `style.light.default.{styles,custom,hover}` on every element
 * - direct children of body absolutely positioned via left/top
 *
 * Pure module (no DB / no fetch) so it stays testable and client-usable.
 */

const ALLOWED_TAGS = new Set([
  'main', 'section', 'div', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'img', 'button', 'a', 'strong', 'em', 'small', 'ul', 'ol', 'li', 'svg',
]);

// Void elements can't hold children or text — React throws at render time.
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

const BREAKPOINTS = ['default', '478px', '767px', '991px', '1280px', '1440px', '1920px'];

let counter = 0;
const nextUid = () => `uid-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type StyleBranch = { styles: Record<string, string>; custom: string; hover: Record<string, string> };
const emptyBranch = (): StyleBranch => ({ styles: {}, custom: '', hover: {} });

function toStyleMap(value: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (v !== null && v !== undefined && v !== '') out[k] = String(v);
    }
  }
  return out;
}

function toHoverMap(value: any): Record<string, string> {
  return toStyleMap(value);
}

function makeTheme(styles: Record<string, string>, custom = '', hover: Record<string, string> = {}) {
  const theme: Record<string, StyleBranch> = {};
  for (const bp of BREAKPOINTS) {
    theme[bp] = bp === 'default' ? { styles, custom, hover } : emptyBranch();
  }
  return { light: theme };
}

function normalizeBranch(branch: any): StyleBranch {
  const out = emptyBranch();
  if (branch && typeof branch === 'object') {
    out.styles = toStyleMap(branch.styles);
    if (typeof branch.custom === 'string') out.custom = branch.custom;
    out.hover = toHoverMap(branch.hover);
  }
  return out;
}

function normalizeStyle(style: any) {
  const light = style?.light && typeof style.light === 'object' ? style.light : {};
  const normalized: Record<string, StyleBranch> = {};
  for (const bp of BREAKPOINTS) {
    normalized[bp] = normalizeBranch(light[bp]);
  }
  return { light: normalized };
}

function px(value: any): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = parseFloat(String(value));
  if (Number.isNaN(n)) return undefined;
  return `${n}px`;
}

function safeTag(tag: any, fallback = 'div'): string {
  return ALLOWED_TAGS.has(tag) ? tag : fallback;
}

// Attributes React manages itself or that collide with builder props —
// a string `style` crashes React ("style prop expects a mapping"),
// `children` crashes void tags, `class`/`className` would override the
// systemAddedClass CSS hook, and `key`/`ref`/inline `on*` handlers /
// contentEditable / dangerouslySetInnerHTML must never come from model
// output. Exported so the renderer can apply the same filter to drafts
// saved before this rule existed.
const BLOCKED_ATTRS = new Set([
  'style', 'class', 'classname', 'key', 'ref', 'children',
  'contenteditable', 'dangerouslysetinnerhtml',
]);

export function cleanAttributes(attrs: any): Record<string, string | number> | undefined {
  if (!attrs || typeof attrs !== 'object') return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(attrs)) {
    const key = k.toLowerCase();
    if (BLOCKED_ATTRS.has(key) || key.startsWith('on')) continue;
    if (typeof v === 'string' && v.trim()) out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

// Models sometimes write CSS into attributes.style ("color: red; top: 4px")
// — parse it into the styles map rather than let a string `style` prop
// reach React. Explicit `styles` keys win.
function parseInlineStyle(value: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value !== 'string') return out;
  for (const decl of value.split(';')) {
    const idx = decl.indexOf(':');
    if (idx <= 0) continue;
    const prop = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (prop && val) out[prop] = val;
  }
  return out;
}

// attributes.class / className — merge into classList (kept out of the
// attributes spread where it would fight the renderer's own className).
function classFromAttrs(attrs: any): string {
  if (!attrs || typeof attrs !== 'object') return '';
  return [attrs.class, attrs.className]
    .filter((c): c is string => typeof c === 'string' && !!c.trim())
    .join(' ');
}

export interface NormalizeResult {
  builderData: Record<string, any>;
  warnings: string[];
}

/** Convert one element-tree node into flat-map entries (uid -> element)
 * under `parentUid`. Used by panels inserting nested presets — the caller
 * pushes the returned root uid into the parent's child array. */
export function treeToElements(node: any, parentUid: string): { entries: Record<string, any>; uid: string | null } {
  const out: Record<string, any> = {};
  const warnings: string[] = [];
  const uid = flattenTreeNode(node, parentUid, out, warnings);
  return { entries: out, uid };
}

/* ---------------- tree input ---------------- */

function looksLikeTree(raw: any): boolean {
  if (Array.isArray(raw)) return true;
  if (!raw || typeof raw !== 'object') return false;
  if (Array.isArray(raw.children)) return true;
  // Single-element tree root (has tag/styles but isn't a uid map).
  if (raw.tag || raw.styles || raw.text) return true;
  return false;
}

function flattenTreeNode(node: any, parentUid: string, out: Record<string, any>, warnings: string[]): string | null {
  if (!node || typeof node !== 'object') return null;
  const uid = nextUid();
  const styles = toStyleMap(node.styles ?? node.style?.light?.default?.styles);
  const rawAttrs = node.attributes ?? node.attrs;
  for (const [k, v] of Object.entries(parseInlineStyle(rawAttrs?.style))) {
    if (!(k in styles)) styles[k] = v;
  }
  const element: Record<string, any> = {
    tag: safeTag(node.tag),
    id: typeof node.id === 'string' ? node.id : '',
    classList: [typeof node.classList === 'string' ? node.classList : '', classFromAttrs(rawAttrs)]
      .filter(Boolean).join(' '),
    systemAddedClass: uid,
    uid,
    parentId: parentUid,
    child: [] as string[],
    style: node.style?.light
      ? normalizeStyle(node.style)
      : makeTheme(styles, typeof node.custom === 'string' ? node.custom : '', toHoverMap(node.hover)),
  };
  if (node.tag && node.tag !== element.tag) warnings.push(`tag "${node.tag}" not allowed; used <div>`);
  if (typeof node.text === 'string' && node.text) element.text = node.text;
  const attrs = cleanAttributes(rawAttrs);
  if (attrs) element.attributes = attrs;

  out[uid] = element;
  const kids = Array.isArray(node.children) ? node.children : (Array.isArray(node.child) ? node.child : []);
  for (const kid of kids) {
    const childUid = flattenTreeNode(kid, uid, out, warnings);
    if (childUid) element.child.push(childUid);
  }
  return uid;
}

function normalizeTree(raw: any, width: number, height: number, warnings: string[]): Record<string, any> {
  const root = Array.isArray(raw) ? { children: raw } : raw;
  const out: Record<string, any> = {};

  const bodyStyles = toStyleMap(root.styles ?? root.style?.light?.default?.styles);
  out.body = {
    tag: 'main',
    id: '',
    classList: 'banner-canvas',
    systemAddedClass: 'banner-canvas',
    uid: 'body',
    parentId: '',
    child: [] as string[],
    style: makeTheme(bodyStyles, typeof root.custom === 'string' ? root.custom : ''),
  };

  const kids = Array.isArray(root.children) ? root.children : (Array.isArray(root.child) ? root.child : []);
  for (const kid of kids) {
    const childUid = flattenTreeNode(kid, 'body', out, warnings);
    if (childUid) out.body.child.push(childUid);
  }
  return out;
}

/* ---------------- flat-map input ---------------- */

function normalizeMap(rawMap: Record<string, any>, warnings: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  const keyMap: Record<string, string> = {};

  for (const [oldKey, el] of Object.entries(rawMap)) {
    if (!el || typeof el !== 'object') continue;
    keyMap[oldKey] = oldKey === 'body' ? 'body' : nextUid();
  }

  for (const [oldKey, el] of Object.entries(rawMap)) {
    const uid = keyMap[oldKey];
    if (!uid) continue;
    const isBody = uid === 'body';
    const tag = isBody ? 'main' : safeTag(el.tag);
    if (!isBody && el.tag && el.tag !== tag) warnings.push(`tag "${el.tag}" not allowed; used <div>`);

    const element: Record<string, any> = {
      tag,
      id: typeof el.id === 'string' ? el.id : '',
      classList: [typeof el.classList === 'string' ? el.classList : '', classFromAttrs(el.attributes)]
        .filter(Boolean).join(' '),
      systemAddedClass: isBody ? 'banner-canvas' : uid,
      uid,
      parentId: '',
      child: [] as string[],
      style: normalizeStyle(el.style),
    };
    const defaultStyles = element.style.light.default.styles;
    for (const [k, v] of Object.entries(parseInlineStyle(el.attributes?.style))) {
      if (!(k in defaultStyles)) defaultStyles[k] = v;
    }
    if (typeof el.text === 'string') element.text = el.text;
    const attrs = cleanAttributes(el.attributes);
    if (attrs) element.attributes = attrs;
    out[uid] = element;
  }

  for (const [oldKey, el] of Object.entries(rawMap)) {
    const uid = keyMap[oldKey];
    const refs = Array.isArray(el?.child) ? el.child : (Array.isArray(el?.children) ? el.children : []);
    if (!uid) continue;
    for (const ref of refs) {
      // ref may be a uid string (map form) or a nested element object (tree form).
      const childUid = typeof ref === 'object' && ref !== null
        ? flattenTreeNode(ref, uid, out, warnings)
        : keyMap[String(ref)];
      if (childUid && out[childUid] && childUid !== uid) {
        out[uid].child.push(childUid);
        out[childUid].parentId = uid;
      }
    }
  }

  // Orphans attach to the artboard.
  for (const [uid, el] of Object.entries(out)) {
    if (uid !== 'body' && !el.parentId) {
      if (!out.body) {
        out.body = {
          tag: 'main', id: '', classList: 'banner-canvas', systemAddedClass: 'banner-canvas',
          uid: 'body', parentId: '', child: [],
          style: makeTheme({}),
        };
      }
      out.body.child.push(uid);
      el.parentId = 'body';
    }
  }
  return out;
}

/* ---------------- entry ---------------- */

export function normalizeBanner(raw: any, opts: { width?: number; height?: number } = {}): NormalizeResult {
  const width = opts.width || 1200;
  const height = opts.height || 628;
  const warnings: string[] = [];

  let input: any = raw?.builderData ?? raw?.elements ?? raw;
  if (!input || typeof input !== 'object') {
    warnings.push('model output was not an object; produced an empty canvas');
    input = {};
  }

  const out = looksLikeTree(input)
    ? normalizeTree(input, width, height, warnings)
    : normalizeMap(input, warnings);

  if (!out.body) {
    warnings.push('no body element; created an empty artboard');
    out.body = {
      tag: 'main', id: '', classList: 'banner-canvas', systemAddedClass: 'banner-canvas',
      uid: 'body', parentId: '', child: [], style: makeTheme({}),
    };
  }

  // Artboard invariants.
  const bodyStyles = out.body.style.light.default.styles;
  bodyStyles.width = `${width}px`;
  bodyStyles.height = `${height}px`;
  bodyStyles.position = 'relative';
  bodyStyles.overflow = 'hidden';
  if (!bodyStyles['background-color'] && !bodyStyles.backgroundColor) {
    bodyStyles['background-color'] = '#ffffff';
  }

  // Void elements: drop children/text so React's void-tag rule can't trip.
  for (const el of Object.values(out) as any[]) {
    if (VOID_TAGS.has(el.tag)) {
      if (Array.isArray(el.child) && el.child.length) {
        warnings.push(`<${el.tag}> cannot have children; dropped them`);
        // Re-parent its children to the artboard rather than losing them.
        for (const childUid of el.child) {
          if (out[childUid]) {
            out[childUid].parentId = 'body';
            out.body.child.push(childUid);
          }
        }
        el.child = [];
      }
      delete el.text;
    }
  }

  // Direct children: absolute positioning inside the artboard.
  for (const uid of out.body.child) {
    const el = out[uid];
    if (!el) continue;
    const styles = el.style.light.default.styles;
    styles.position = 'absolute';
    const left = px(styles.left ?? styles.x);
    const top = px(styles.top ?? styles.y);
    styles.left = left ?? '0px';
    styles.top = top ?? '0px';
    delete styles.x;
    delete styles.y;
  }

  return { builderData: out, warnings };
}
