// Browser tool runtime - content script
// Runs on all pages. Provides the generic in-page tools the agent drives
// (scroll, click, type, collect_text, learned-skill runtime) plus the Teach
// learning overlay's element resolver.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The main content region, when a page marks one; else the whole body. Used as
// the scroll scope by the scroll/collect tools.
function getMainScope() {
  return document.querySelector('div[role="main"]') || document.body;
}

// The largest horizontally-scrollable container currently in view — a carousel,
// stories/reels row, or product strip. Used by horizontal scrolling.
function findHScrollable() {
  let best = null, bestW = 0;
  for (const el of document.querySelectorAll('div, ul, section')) {
    if (el.scrollWidth > el.clientWidth + 20 && el.clientWidth > 200 && el.clientHeight > 60) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight && el.clientWidth > bestW) { best = el; bestW = el.clientWidth; }
    }
  }
  return best;
}

// Plain scroll: step the page `times` times WITHOUT collecting anything.
// Vertical (default) steps the feed container if it scrolls, else the window.
// Horizontal steps the largest carousel/row in view, else the window sideways.
async function scrollPage(times = 10, delay = 1200, direction = 'vertical') {
  const scope = getMainScope();
  let done = 0;
  for (let i = 0; i < times; i++) {
    if (direction === 'horizontal') {
      const el = findHScrollable();
      if (el) el.scrollLeft += Math.round(el.clientWidth * 0.8);
      else window.scrollBy(Math.round(window.innerWidth * 0.8), 0);
    } else if (scope && scope.scrollHeight > scope.clientHeight + 4) {
      scope.scrollTop += Math.round(scope.clientHeight * 0.8);
    } else {
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
    }
    await sleep(delay);
    done++;
  }
  return done;
}

// Collapse runs of whitespace/newlines so exact-text matches survive
// pretty-printed / line-wrapped markup.
function norm(t) {
  return (t || '').replace(/\s+/g, ' ').trim();
}

// Poll for an element until it appears or times out.
function waitForEl(selector, timeout = 8000, interval = 200) {
  return new Promise((resolve) => {
    const hit = document.querySelector(selector);
    if (hit) return resolve(hit);
    const start = Date.now();
    const iv = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) { clearInterval(iv); resolve(el); }
      else if (Date.now() - start > timeout) { clearInterval(iv); resolve(null); }
    }, interval);
  });
}

// Give an element a real focus (mouse gesture + focus + caret at end).
function focusEditor(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  try { el.click(); } catch {}
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function editorText(el) {
  return (el.innerText || '').replace(/​/g, '').trim();
}

// Empty the editor so a re-run never appends to leftover text.
function clearEditor(editor) {
  focusEditor(editor);
  try { document.execCommand('selectAll', false); document.execCommand('delete', false); } catch {}
}

// Insert text into a Lexical contenteditable. Lexical ignores direct DOM writes
// and renders asynchronously, so try a method, WAIT, then verify before trying
// the next — this prevents multiple methods each inserting (duplicate text).
async function insertIntoLexical(editor, text) {
  clearEditor(editor);
  await sleep(80);

  // 1) Synthetic paste with a DataTransfer — Lexical has a PASTE handler.
  focusEditor(editor);
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  } catch {}
  await sleep(200);
  if (editorText(editor)) return 'paste';

  // 2) execCommand insertText (fires native beforeinput).
  focusEditor(editor);
  try { document.execCommand('insertText', false, text); } catch {}
  await sleep(200);
  if (editorText(editor)) return 'execCommand';

  // 3) Manual beforeinput/input events.
  focusEditor(editor);
  editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: text, bubbles: true, cancelable: true }));
  editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: text, bubbles: true }));
  await sleep(200);
  if (editorText(editor)) return 'beforeinput';

  return '';
}

// --- Skill runtime (applying learned skills) -------------------------------

// Try each ranked selector candidate until one resolves within `root`.
function resolveOne(root, selectors) {
  for (const s of (selectors || [])) {
    try {
      if (s.strategy === 'css') { const el = root.querySelector(s.value); if (el) return el; }
      else if (s.strategy === 'roleText') { for (const el of root.querySelectorAll(`[role="${s.role}"]`)) if (norm(el.textContent) === s.text) return el; }
      else if (s.strategy === 'text') { for (const el of root.querySelectorAll(s.tag || '*')) if (norm(el.textContent) === s.text) return el; }
    } catch {}
  }
  return null;
}

function resolveItems(selectors) {
  for (const s of (selectors || [])) {
    try { if (s.strategy === 'css') { const els = document.querySelectorAll(s.value); if (els.length) return [...els]; } } catch {}
  }
  return [];
}

// Pull an image URL from an element, checking BOTH the HTML <img> (src) and the
// SVG <image> tag (xlink:href / href) — FB renders profile/photo images either
// way. Falls back to background-image. Works whether el IS the image or CONTAINS it.
function imageUrlOf(el) {
  if (!el) return '';
  const svgHref = (im) => im.getAttribute('xlink:href') ||
    im.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
    im.getAttribute('href') || '';
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'img') return el.getAttribute('src') || '';
  if (tag === 'image') return svgHref(el);
  if (el.querySelector) {
    const img = el.querySelector('img');
    if (img && img.getAttribute('src')) return img.getAttribute('src');
    const svgImg = el.querySelector('image');
    if (svgImg) { const h = svgHref(svgImg); if (h) return h; }
  }
  const bg = el.style && el.style.backgroundImage;
  if (bg) { const m = bg.match(/url\(["']?(.*?)["']?\)/); if (m) return m[1]; }
  return '';
}

// Link URL for an element: its own href, else a child <a>, else the nearest
// ANCESTOR <a> — FB puts the text in a deep <span> whose clickable link is an
// ancestor anchor (and sometimes an inner icon link is the child).
function hrefOf(el) {
  if (!el) return '';
  if (el.getAttribute && el.getAttribute('href')) return el.getAttribute('href');
  const anc = el.closest && el.closest('a[href]');       // nearest ancestor link
  if (anc) return anc.getAttribute('href');
  const child = el.querySelector && el.querySelector('a[href]'); // nearest child link
  if (child) return child.getAttribute('href');
  return '';
}

// Full visible text of an element and everything inside it, keeping line breaks
// between blocks (post bodies, multi-line captions). Unlike `text` (which
// collapses to one line), this preserves the whole readable content.
function fullText(el) {
  if (!el) return '';
  const t = (el.innerText != null && el.innerText !== '') ? el.innerText : (el.textContent || '');
  return t.replace(/[ \t ]+/g, ' ')   // collapse runs of spaces
    .replace(/[ \t]*\n[ \t]*/g, '\n')       // trim spaces around newlines
    .replace(/\n{3,}/g, '\n\n')             // cap blank-line runs
    .trim();
}

function readField(item, field) {
  const el = resolveOne(item, field.selectors);
  if (!el) return '';
  if (field.attr === 'href') return hrefOf(el);
  if (field.attr === 'src') return imageUrlOf(el);
  if (field.attr === 'innerText') return fullText(el);
  return norm(el.textContent);
}

// Scroll and extract the skill's fields from each repeating item, de-duped.
// fieldNames (optional) restricts collection to just those field names.
async function collectBySkill(skill, target = 20, delay = 1200, maxScrolls = 200, fieldNames = null) {
  const seen = new Set();
  const records = [];
  const scope = getMainScope();
  let fields = skill.fields || [];
  if (Array.isArray(fieldNames) && fieldNames.length) fields = fields.filter((f) => fieldNames.includes(f.name));
  const readFields = fields.filter((f) => f.attr !== 'click');
  const clickFields = fields.filter((f) => f.attr === 'click');
  const keyField = readFields[0]; // treat the first read field (e.g. publisher) as the "is this a real item?" key
  const grab = async () => {
    for (const item of resolveItems(skill.item && skill.item.selectors)) {
      if (item.__baCollected) continue;                       // dedup by element identity
      // Require the key field — filters out sidebars/suggestions that lack it.
      if (keyField && !readField(item, keyField)) continue;   // not a real item (or not hydrated yet) → skip, retry later
      // Click actions FIRST (e.g. expand "See more") so reads get full text…
      let clicked = false;
      for (const f of clickFields) { const el = resolveOne(item, f.selectors); if (el) { try { el.click(); clicked = true; } catch {} } }
      if (clicked) await sleep(400);                          // …then wait for the expansion/action to render
      const rec = {};
      for (const f of readFields) rec[f.name] = readField(item, f);
      if (!Object.values(rec).some((v) => v) && !clickFields.length) continue;
      const sig = JSON.stringify(rec);
      item.__baCollected = true;                              // mark so re-grabs skip it
      if (seen.has(sig)) continue;                            // same post re-rendered elsewhere
      seen.add(sig);
      rec._html = (item.outerHTML || '').slice(0, 30000);     // raw item HTML for debugging
      rec._sourceText = fullText(item).slice(0, 4000);        // whole item text, for ai_verify to compare against
      records.push(rec);
    }
  };
  await grab();
  let stagnant = 0;
  for (let i = 0; i < maxScrolls && records.length < target; i++) {
    const before = records.length;
    if (scope && scope.scrollHeight > scope.clientHeight + 4) scope.scrollTop += Math.round(scope.clientHeight * 0.8);
    else window.scrollBy(0, Math.round(window.innerHeight * 0.8));
    await sleep(delay); await grab();
    if (records.length === before) { if (++stagnant >= 8) break; } else stagnant = 0;
  }
  return records.slice(0, target);
}

// --- Collection scroll state ------------------------------------------------

// Current scroll offset of whatever actually scrolls (main region or window).
function scanScrollY() {
  const scope = getMainScope();
  return Math.round((scope && scope.scrollHeight > scope.clientHeight + 4) ? scope.scrollTop : window.scrollY);
}

// Before a fresh collection pass, forget the per-element "already collected"
// marks left by earlier tasks in this tab and scroll to the top, so collect_text
// / collect_by_skill start from the first item.
async function resetScan({ y = 0 } = {}) {
  for (const el of document.getElementsByTagName('*')) {
    if (el.__baCollected) delete el.__baCollected;
    if (el.__baTextGrabbed) delete el.__baTextGrabbed;
  }
  const scope = getMainScope();
  if (scope && scope.scrollHeight > scope.clientHeight + 4) scope.scrollTop = y;
  else window.scrollTo(0, y);
  await sleep(800); // let the page settle/re-render at this offset
  return { ok: true, y: scanScrollY() };
}

// Scroll and collect the FULL inner text of every element matching a CSS
// selector, de-duped by text. No learned skill needed — just a selector.
async function collectText(selector, target = 20, delay = 1200, maxScrolls = 200) {
  let sel = (selector || '').trim() || '[role="article"]';
  // Models sometimes emit invalid CSS (e.g. jQuery :contains). A broken selector
  // used to silently collect 0 items — fall back to the article default instead.
  try { document.querySelectorAll(sel); } catch { sel = '[role="article"]'; }
  const seen = new Set();
  const records = [];
  const scope = getMainScope();
  const grab = () => {
    let nodes = [];
    try { nodes = [...document.querySelectorAll(sel)]; } catch { return; }
    for (const el of nodes) {
      if (el.__baTextGrabbed) continue;
      const text = fullText(el);
      if (!text) continue;                       // skip empties (not hydrated yet)
      el.__baTextGrabbed = true;
      if (seen.has(text)) continue;              // same block re-rendered elsewhere
      seen.add(text);
      records.push({ text, url: location.href, _html: (el.outerHTML || '').slice(0, 30000) });
    }
  };
  grab();
  let stagnant = 0;
  for (let i = 0; i < maxScrolls && records.length < target; i++) {
    const before = records.length;
    if (scope && scope.scrollHeight > scope.clientHeight + 4) scope.scrollTop += Math.round(scope.clientHeight * 0.8);
    else window.scrollBy(0, Math.round(window.innerHeight * 0.8));
    await sleep(delay); grab();
    if (records.length === before) { if (++stagnant >= 8) break; } else stagnant = 0;
  }
  return records.slice(0, target);
}

// RETRY RULE (see CLAUDE.md): every tool that locates a page element MUST
// resolve it through this helper — exponential backoff 1s, 2s, 4s, 8s (4
// retries). Stepped forms/dialogs render late, so a first miss is not a
// failure. Only lookups are retried: nothing has been acted on while the
// element is missing, so retrying is always safe. NEW TOOLS: never call
// findTarget/findField/resolveOne bare.
async function withBackoff(find, retries = 4) {
  let el = find();
  for (let i = 0; i < retries && !el; i++) {
    await sleep(1000 * Math.pow(2, i));
    el = find();
  }
  return el;
}

// Find an element by CSS selector, else the first VISIBLE clickable whose text
// (or aria-label) contains `text`. Used by the click/hover tools.
function findTarget(selector, text) {
  if (selector) { try { const el = document.querySelector(selector); if (el) return el; } catch {} }
  if (text) {
    const t = String(text).toLowerCase().trim();
    const vis = (el) => el && el.offsetParent !== null;
    const cands = [...document.querySelectorAll('a,button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],input[type="submit"],[onclick]')];
    for (const el of cands) {
      const lbl = (el.getAttribute('aria-label') || '').toLowerCase();
      if (lbl.includes(t) && vis(el)) return el;
    }
    for (const el of cands) {
      const txt = norm(el.innerText || el.textContent).toLowerCase();
      if (txt && txt.includes(t) && vis(el) && txt.length < 120) return el;
    }
    // Last resort: any visible element whose exact-ish text matches.
    for (const el of document.querySelectorAll('span,div,li,td,h1,h2,h3')) {
      const txt = norm(el.innerText || el.textContent).toLowerCase();
      if (txt && txt.includes(t) && vis(el) && txt.length < 80) return el;
    }
  }
  return null;
}

async function clickElement(selector, text) {
  const el = await withBackoff(() => findTarget(selector, text));
  if (!el) return { ok: false, error: `no element for ${selector || text}` };
  try { el.scrollIntoView({ block: 'center' }); } catch {}
  await sleep(120);
  try { el.click(); } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, matched: norm(el.getAttribute('aria-label') || el.innerText || el.textContent).slice(0, 60) || (selector || text) };
}

async function hoverElement(selector, text) {
  const el = await withBackoff(() => findTarget(selector, text));
  if (!el) return { ok: false, error: `no element for ${selector || text}` };
  try { el.scrollIntoView({ block: 'center' }); } catch {}
  await sleep(120);
  for (const type of ['pointerover', 'mouseover', 'mouseenter', 'mousemove']) {
    try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); } catch {}
  }
  return { ok: true, matched: norm(el.getAttribute('aria-label') || el.innerText || el.textContent).slice(0, 60) || (selector || text) };
}

// Find an editable field (input/textarea/contenteditable/role=textbox) by CSS
// selector, else by placeholder/aria-label text, else the focused/first one.
function findField(selector, text) {
  const editable = (el) => el && (el.tagName === 'TEXTAREA'
    || (el.tagName === 'INPUT' && /^(text|search|email|url|tel|)$/i.test(el.type || ''))
    || el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox');
  if (selector) { try { const el = document.querySelector(selector); if (el) return el; } catch {} }
  // Models often put a human label in `selector` (e.g. "New post input") — if it
  // matched nothing as CSS, reuse it as the placeholder/aria-label hint.
  if (!text && selector && /[A-Z\s]/.test(selector)) text = selector;
  if (text) {
    const t = String(text).toLowerCase().trim();
    const all = [...document.querySelectorAll('input,textarea,[contenteditable="true"],[role="textbox"]')].filter(editable);
    for (const el of all) {
      const hint = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').toLowerCase();
      if (hint.includes(t) && el.offsetParent !== null) return el;
    }
  }
  if (editable(document.activeElement)) return document.activeElement;
  return [...document.querySelectorAll('[role="textbox"],[contenteditable="true"],textarea,input[type="text"],input:not([type])')]
    .find((el) => el.offsetParent !== null) || null;
}

// Type text into a field. Contenteditables (FB's Lexical post composer) go
// through insertIntoLexical, which clears the field first and tries ONE insert
// method at a time, verifying between attempts — inserting and then also
// dispatching a synthetic input event makes Lexical insert the text TWICE.
async function typeInto(selector, text, value) {
  const el = await withBackoff(() => findField(selector, text));
  if (!el) return { ok: false, error: 'no editable field found' };
  try { el.scrollIntoView({ block: 'center' }); } catch {}
  el.focus();
  await sleep(150);
  const label = norm(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName).slice(0, 50);
  try {
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
      const method = await insertIntoLexical(el, value);
      if (!method) return { ok: false, error: 'could not insert text into the editor' };
    } else {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      el.focus();
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return { ok: true, matched: label };
  } catch (e) { return { ok: false, error: e.message }; }
}

// --- key pressing ------------------------------------------------------------
// Dispatch a real key sequence (keydown → keypress → keyup) on an element —
// for fields that submit on Enter and have no button. Synthetic events don't
// trigger the browser's native form submit, so if no page handler consumed the
// Enter (dispatchEvent returned true) and the field sits in a <form>, submit it
// explicitly. If a handler DID consume it, we must not also submit (double-post).
const KEY_CODES = { Enter: 13, Tab: 9, Escape: 27, ' ': 32, Space: 32, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, PageUp: 33, PageDown: 34, Home: 36, End: 35, Backspace: 8, Delete: 46 };
function pressKeyOn(el, key = 'Enter') {
  const k = key === 'Space' ? ' ' : key;
  const keyCode = KEY_CODES[key] || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : 0);
  const code = k === ' ' ? 'Space' : (k.length === 1 ? 'Key' + k.toUpperCase() : key);
  const opts = { key: k, code, keyCode, which: keyCode, bubbles: true, cancelable: true, view: window };
  try { el.focus(); } catch {}
  const unhandled = el.dispatchEvent(new KeyboardEvent('keydown', opts));
  el.dispatchEvent(new KeyboardEvent('keypress', opts));
  el.dispatchEvent(new KeyboardEvent('keyup', opts));
  if (k === 'Enter' && unhandled && el.form && typeof el.form.requestSubmit === 'function') {
    try { el.form.requestSubmit(); } catch {}
  }
}

// press_key tool: press a key on a field found by selector/label — or on the
// currently focused element when no target is given (e.g. right after typing).
async function pressKey(selector, text, key = 'Enter') {
  let el = null;
  if (selector || text) el = await withBackoff(() => findField(selector, text) || findTarget(selector, text));
  if (!el && document.activeElement && document.activeElement !== document.body) el = document.activeElement;
  if (!el) return { ok: false, error: 'no element to press key on (no field found)' };
  try { el.scrollIntoView({ block: 'center' }); } catch {}
  await sleep(100);
  pressKeyOn(el, key);
  return { ok: true, key, matched: norm(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName).slice(0, 50) };
}

// Perform a single-element skill's action.
async function useSkill(skill) {
  const el = await withBackoff(() => resolveOne(document, skill.selectors));
  if (!el) return { ok: false, error: 'element not found for skill ' + skill.name };
  const act = skill.action || 'click';
  try {
    if (act === 'click') el.click();
    else if (act === 'hover') el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    else if (act === 'press') pressKeyOn(el, skill.key || 'Enter');
    else if (act === 'scroll') { if (el.scrollHeight > el.clientHeight + 4) el.scrollTop += Math.round(el.clientHeight * 0.8); else el.scrollIntoView({ block: 'center' }); }
    else if (act === 'read') return { ok: true, value: norm(el.textContent) };
  } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, action: act };
}

// Run ONE step of a multi-action (v2) skill: resolve the step's element and
// perform its action. "type" inserts the provided value (composer-safe via
// insertIntoLexical for contenteditables).
async function runStep(step, value) {
  const el = await withBackoff(() => resolveOne(document, step.selectors));
  if (!el) return { ok: false, error: 'element not found for step ' + (step.name || '?') };
  try { el.scrollIntoView({ block: 'center' }); } catch {}
  await sleep(150);
  const act = step.action || 'click';
  try {
    if (act === 'click') el.click();
    else if (act === 'hover') { for (const t of ['pointerover', 'mouseover', 'mouseenter', 'mousemove']) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })); }
    else if (act === 'press') pressKeyOn(el, step.key || 'Enter');
    else if (act === 'scroll') { if (el.scrollHeight > el.clientHeight + 4) el.scrollTop += Math.round(el.clientHeight * 0.8); else el.scrollIntoView({ block: 'center' }); }
    else if (act === 'read') return { ok: true, value: norm(el.textContent) };
    else if (act === 'type') {
      if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox') {
        const method = await insertIntoLexical(el, value || '');
        if (!method) return { ok: false, error: 'could not insert text into the editor' };
      } else {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        el.focus();
        if (setter) setter.call(el, value || ''); else el.value = value || '';
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, action: act };
}

// --- Introduced-element resolution (health check) ----------------------------
// Resolve introduced elements (parent chains, css candidates) and report how
// many nodes each matches on THIS page — the skills page uses it as a live
// health check ("repoint me" signal).
function resolveElementCounts(elements) {
  const byId = new Map((elements || []).map((e) => [e.elementId, e]));
  const own = (elDoc, root) => {
    for (const s of (elDoc.selectors || [])) {
      if (s.strategy !== 'css' || !s.value) continue;
      try { const ns = [...root.querySelectorAll(s.value)]; if (ns.length) return ns; } catch {}
    }
    return [];
  };
  const nodesOf = (elDoc, seen = new Set()) => {
    if (!elDoc || seen.has(elDoc.elementId)) return [];
    seen.add(elDoc.elementId);
    const parent = elDoc.parentId ? byId.get(elDoc.parentId) : null;
    if (!parent) return own(elDoc, document);
    const out = [];
    for (const p of nodesOf(parent, seen)) out.push(...own(elDoc, p));
    return out;
  };
  const counts = {};
  for (const e of (elements || [])) counts[e.elementId] = nodesOf(e).length;
  return counts;
}

// --- Message handling ------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'SCROLL_PAGE') {
        const scrolled = await scrollPage(msg.times || 10, msg.delay || 1200, msg.direction || 'vertical');
        sendResponse({ ok: true, scrolled });
      } else if (msg?.type === 'USE_SKILL') {
        sendResponse(await useSkill(msg.skill));
      } else if (msg?.type === 'COLLECT_BY_SKILL') {
        const records = await collectBySkill(msg.skill, msg.target || 20, msg.delay || 1200, 200, msg.fields || null);
        sendResponse({ ok: true, records });
      } else if (msg?.type === 'COLLECT_TEXT') {
        const records = await collectText(msg.selector, msg.target || 20, msg.delay || 1200);
        sendResponse({ ok: true, records });
      } else if (msg?.type === 'RESET_SCAN') {
        sendResponse(await resetScan({ y: Number(msg.y) || 0 }));
      } else if (msg?.type === 'RESOLVE_ELEMENTS') {
        sendResponse({ ok: true, counts: resolveElementCounts(msg.elements || []), url: location.href });
      } else if (msg?.type === 'RUN_STEP') {
        sendResponse(await runStep(msg.step || {}, msg.value || ''));
      } else if (msg?.type === 'CLICK_ELEMENT') {
        sendResponse(await clickElement(msg.selector, msg.text));
      } else if (msg?.type === 'HOVER_ELEMENT') {
        sendResponse(await hoverElement(msg.selector, msg.text));
      } else if (msg?.type === 'TYPE_TEXT') {
        sendResponse(await typeInto(msg.selector, msg.text, msg.value));
      } else if (msg?.type === 'PRESS_KEY') {
        sendResponse(await pressKey(msg.selector, msg.text, msg.key || 'Enter'));
      } else if (msg?.type === 'WAIT_FOR') {
        // Poll until the element appears (clickables, fields, or any matching
        // node), up to `timeout` ms. Phrased so a timeout is NOT auto-retried
        // by the phase loop — this tool already IS the wait.
        {
          const deadline = Date.now() + Math.min(Number(msg.timeout) || 30000, 120000);
          let el = null;
          while (!el && Date.now() < deadline) {
            el = findTarget(msg.selector, msg.text) || findField(msg.selector, msg.text);
            if (!el) await sleep(500);
          }
          sendResponse(el
            ? { ok: true, matched: norm(el.getAttribute && (el.getAttribute('aria-label') || el.innerText || el.textContent) || el.tagName).slice(0, 60) }
            : { ok: false, error: `wait timeout: "${msg.selector || msg.text}" did not appear` });
        }
      } else {
        sendResponse({ ok: false, error: 'UNKNOWN_MESSAGE' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true;
});
