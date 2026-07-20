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

// --- Search-results link extraction (collect_links) -------------------------
// Search engines (Google especially) rotate/obfuscate result CLASS names, so we
// key off STRUCTURE that doesn't change: an organic result is an <a href> that
// contains an <h3> title, in the main results column. Ads, "People also ask",
// navigation and the engine's own links are filtered out. Returns links in the
// page's ranking order — clever enough to survive Google layout churn.

// Hosts that are the engine itself or utility/redirect links, never a result.
const SEARCH_JUNK_HOST = /(^|\.)(google|gstatic|googleusercontent|googleadservices|doubleclick|googlesyndication)\.[a-z.]+$|^webcache\./i;

// Google wraps some links as /url?q=<real>&…; unwrap to the real destination.
function decodeResultUrl(href) {
  try {
    const u = new URL(href, location.origin);
    if (u.pathname === '/url') { const q = u.searchParams.get('q') || u.searchParams.get('url'); if (q) return q; }
    return u.href;
  } catch { return href || ''; }
}

function resultAnchors(scope) {
  // 1) structural: anchors that CONTAIN an <h3> — the organic-result signature.
  let anchors = [];
  try { anchors = [...scope.querySelectorAll('a:has(h3)')]; } catch {}
  // 2) fallback: climb from each <h3> to its enclosing anchor.
  if (!anchors.length) anchors = [...scope.querySelectorAll('h3')].map((h) => h.closest('a[href]')).filter(Boolean);
  // 3) last resort: every external-looking link in the results column.
  if (!anchors.length) anchors = [...scope.querySelectorAll('a[href^="http"], a[href^="/url?"]')];
  return anchors;
}

async function collectSearchLinks({ target = 10, maxScrolls = 6, delay = 900 } = {}) {
  if (/(^|\.)consent\.(google|youtube)\./i.test(location.hostname)) {
    return { ok: false, error: 'The search engine is showing a cookie-consent page — accept it once in this browser, then retry.' };
  }
  const scope = document.querySelector('#search, #rso, div[role="main"]') || document.body;
  const byUrl = new Map(); // url -> { url, title } (dedup, preserves order)
  const grab = () => {
    for (const a of resultAnchors(scope)) {
      if (!a) continue;
      if (a.closest('[data-text-ad], [aria-label="Ads"], #tads, #bottomads')) continue; // ad blocks
      const raw = a.getAttribute('href') || '';
      if (/[?&]aclk|googleadservices/.test(raw)) continue;                                // ad redirects
      const url = decodeResultUrl(raw);
      if (!/^https?:\/\//i.test(url)) continue;
      let hostname = '';
      try { hostname = new URL(url).hostname; } catch { continue; }
      if (SEARCH_JUNK_HOST.test(hostname)) continue;                                      // engine's own/util hosts
      if (byUrl.has(url)) continue;
      const h3 = a.querySelector('h3');
      byUrl.set(url, { url, title: norm(h3 ? h3.textContent : a.textContent).slice(0, 200) });
    }
  };
  grab();
  let stagnant = 0;
  for (let i = 0; i < maxScrolls && byUrl.size < target; i++) {
    const before = byUrl.size;
    window.scrollBy(0, Math.round(window.innerHeight * 0.9)); // newer Google lazy-loads more results
    await sleep(delay);
    grab();
    if (byUrl.size === before) { if (++stagnant >= 2) break; } else stagnant = 0;
  }
  return { ok: true, links: [...byUrl.values()].slice(0, target) };
}

// --- Readable article extraction (read_pages) -------------------------------
// Generic main-content extraction: works on ANY site because it keys off
// structure and text density, never site-specific selectors. Used to turn an
// unpredictable search-result URL into a clean source record.

// The block most likely to hold the article body.
function articleRoot() {
  // 1) explicit semantic containers, if they actually carry text.
  for (const sel of ['article', 'main', '[role="main"]', '#content', '.post', '.entry-content']) {
    try { const el = document.querySelector(sel); if (el && (el.textContent || '').trim().length > 200) return el; } catch {}
  }
  // 2) else the container with the most paragraph text (classic readability).
  let best = null, bestLen = 0;
  for (const el of document.querySelectorAll('div, section')) {
    const ps = el.querySelectorAll('p');
    if (ps.length < 2) continue;
    let len = 0;
    for (const p of ps) len += (p.textContent || '').length;
    if (len > bestLen) { best = el; bestLen = len; }
  }
  return best || document.body;
}

function extractArticle({ maxChars = 8000, maxImages = 5 } = {}) {
  const root = articleRoot();
  // Strip page chrome on a CLONE so nav/ads/footers never pollute the text and
  // the live page is left untouched.
  let text = '';
  try {
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,nav,header,footer,aside,form,iframe,svg,[role="navigation"],[aria-hidden="true"]')
      .forEach((n) => n.remove());
    text = (clone.textContent || '').replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  } catch { text = fullText(root); }

  const title = norm(document.querySelector('h1')?.textContent)
    || document.querySelector('meta[property="og:title"]')?.content
    || norm(document.title);

  // Content images only — skip icons, spacers and tracking pixels.
  const images = [];
  for (const img of root.querySelectorAll('img[src]')) {
    if (images.length >= maxImages) break;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if ((w && w < 200) || (h && h < 120)) continue;
    const src = img.currentSrc || img.getAttribute('src') || '';
    if (!/^https?:/i.test(src)) continue;
    images.push({ src, alt: norm(img.getAttribute('alt') || '').slice(0, 150) });
  }

  return {
    ok: !!text,
    error: text ? '' : 'no readable content on this page',
    article: { url: location.href, title: String(title || '').slice(0, 300), text: text.slice(0, maxChars), images },
  };
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
// Score how well one element matches the requested text. Higher is better;
// -1 means no match at all.
//
// Taking the FIRST substring hit (the old behaviour) picks whatever appears
// earliest in the DOM: asking to click "Post" matched a feed item labelled
// "Actions for this post by …" instead of the composer's Post button, so the
// task clicked the wrong thing and reported success. Scoring every candidate
// and taking the best fixes that class of bug generally.
function scoreMatch(el, t) {
  const label = norm(el.getAttribute('aria-label') || '').toLowerCase();
  const text = norm(el.innerText || el.textContent || '').toLowerCase();
  const values = [label, text].filter(Boolean);
  if (!values.length) return -1;

  const rx = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  let score = -1;
  for (const v of values) {
    if (v === t) score = Math.max(score, 100);          // exact — what we want
    else if (rx.test(v)) score = Math.max(score, 55);   // whole word inside
    else if (v.includes(t)) score = Math.max(score, 25); // loose substring
  }
  if (score < 0) return -1;

  // A short label is a more precise match ("Post" beats "Actions for this post…").
  const shortest = Math.min(...values.map((v) => v.length));
  score += Math.max(0, 20 - shortest / 4);
  // The thing we are acting on is almost always inside the dialog/composer that
  // an earlier phase just opened — strongly prefer it over the page behind.
  if (el.closest('[role="dialog"],[aria-modal="true"]')) score += 50;
  // Real controls beat incidental text.
  if (el.matches('button,[role="button"],input[type="submit"],input[type="button"]')) score += 10;
  return score;
}

function findTarget(selector, text) {
  if (selector) { try { const el = document.querySelector(selector); if (el) return el; } catch {} }
  if (!text) return null;

  const t = String(text).toLowerCase().trim();
  // NOT `offsetParent !== null`: that is null for position:fixed elements, and a
  // Facebook composer dialog is fixed. The real "Post" button was being filtered
  // out as invisible, leaving "Add to your post" as the best remaining match —
  // so the agent clicked the attachment menu and never published.
  const vis = (el) => isVisible(el);
  const pick = (nodes, maxLen) => {
    let best = null, bestScore = 0;
    for (const el of nodes) {
      if (!vis(el)) continue;
      const len = norm(el.innerText || el.textContent || '').length;
      if (maxLen && len > maxLen) continue;
      const s = scoreMatch(el, t);
      if (s > bestScore) { best = el; bestScore = s; }
    }
    return best;
  };

  const controls = [...document.querySelectorAll(
    'a,button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],input[type="submit"],[onclick]'
  )];
  return pick(controls, 120)
    // Last resort: any visible element whose text matches.
    || pick(document.querySelectorAll('span,div,li,td,h1,h2,h3'), 80);
}

// --- Descriptor finder: leaf-to-root ----------------------------------------
// See plans/not-started/instruction-skills.md.
//
// findTarget (above) searches TOP-DOWN: collect every control, score its text.
// That is backwards for a target described by its words, and it is the direct
// cause of two logged failures — clicking "Post" matched an ancestor labelled
// "Actions for this post by …" (its text merely CONTAINS the word), and a
// composer step resolved to a wrapper DIV instead of the editable node.
//
// This searches BOTTOM-UP. "The button with only 'Next' inside" is precisely a
// text node whose content is "Next" — the leaf is unambiguous. The only real
// question is how far UP to walk from it, and that is a short bounded ascent
// with a per-op stop condition. Nearest actionable ancestor wins, which is what
// makes "only Next inside" mean the tight button rather than the panel round it.

const ASCENT_CAP = 8;              // hops from the text node before giving up
const CLICKABLE_SEL = 'button,[role="button"],a,[role="link"],[role="tab"],[role="menuitem"],[role="option"],[role="checkbox"],[role="radio"],input[type="submit"],input[type="button"],[onclick],[tabindex]';
const EDITABLE_SEL = 'input,textarea,[contenteditable="true"],[role="textbox"]';

// What counts as "can actually be acted on" depends on the op: a click needs a
// control, a type needs a field. Stopping the ascent at the wrong kind of node
// is how you get "it found it but nothing happened".
function actionableSel(op) {
  if (op === 'type' || op === 'press') return EDITABLE_SEL;
  if (op === 'read') return '*';
  return CLICKABLE_SEL;
}

// offsetParent !== null (used by the older tools) reports FALSE for
// position:fixed elements — which is exactly what a Facebook dialog is. Kept
// local to the new finder so the existing tools kepp their current behaviour.
function isVisible(el) {
  if (!el || !el.getBoundingClientRect) return false;
  let r; try { r = el.getBoundingClientRect(); } catch { return false; }
  if (r.width <= 0 || r.height <= 0) return false;
  let s; try { s = getComputedStyle(el); } catch { return true; }
  return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
}

// A descriptor's `value` is a string OR a list of alternates tried in order
// (["Next", "পরবর্তী"]) — text matching is language-bound in a way selectors
// are not. Only the first is normally filled; the plural shape is here so
// localization does not need a schema migration later.
function descriptorValues(desc) {
  const v = desc?.value;
  const list = Array.isArray(v) ? v : [v];
  return list.map((x) => norm(String(x ?? '')).toLowerCase()).filter(Boolean);
}

// The root the search is confined to. `dialog` is an explicit filter, not the
// +50 scoring nudge findTarget uses — when the instruction says the popup is
// open, searching the page behind it is a bug, not a fallback.
function scopeRoot(desc) {
  const scope = desc?.scope || 'page';
  if (scope === 'dialog') return document.querySelector('[role="dialog"],[aria-modal="true"]') || null;
  if (typeof scope === 'string' && scope.startsWith('within:')) {
    try { return document.querySelector(scope.slice(7)) || null; } catch { return null; }
  }
  return document.body;
}

// Every non-empty text node under `root`, skipping markup that never renders.
function textLeaves(root) {
  const out = [];
  let walker;
  try {
    walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|TITLE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
  } catch { return out; }
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
  return out;
}

// Elements whose text matches, found via their text nodes.
//
// React splits a label across several text nodes constantly (an icon between
// words, a zero-width span), so a leaf holding only "Post" would never match
// "Post settings" on its own. When a leaf's text is a PIECE of what we want, we
// retest against its parent's combined text — cheap, and it is the common case.
function matchingElements(root, values, exact) {
  const hits = new Map();  // element -> matched text (deduped)
  const consider = (el, text) => {
    if (!el || hits.has(el)) return;
    const t = norm(text).toLowerCase();
    if (!t) return;
    for (const v of values) {
      if (exact ? t === v : t.includes(v)) { hits.set(el, norm(text)); return; }
    }
  };
  for (const node of textLeaves(root)) {
    const el = node.parentElement;
    if (!el) continue;
    consider(el, node.nodeValue);
    if (hits.has(el)) continue;
    // Split across SIBLINGS (<span>Post</span><span> </span><span>settings</span>):
    // the combined text lives on an ancestor, not on this leaf's own element, so
    // testing el.textContent finds nothing — climb. Gated on the leaf being a
    // proper piece of a target value, otherwise every node on the page climbs,
    // and capped at 2 levels so a match cannot drift up into the page chrome.
    const own = norm(node.nodeValue).toLowerCase();
    if (!own || !values.some((v) => v.includes(own) && v !== own)) continue;
    let up = el.parentElement;
    for (let i = 0; i < 2 && up && up !== document.body; i++, up = up.parentElement) {
      consider(up, up.textContent);
      if (hits.has(up)) break;
    }
  }
  return [...hits.entries()].map(([el, text]) => ({ el, text }));
}

// Walk up to the nearest node that can actually take the action. The depth cap
// is what stops the ascent reaching <body> and clicking the whole page.
function ascend(from, op) {
  const sel = actionableSel(op);
  let el = from;
  for (let depth = 0; el && depth <= ASCENT_CAP; depth++, el = el.parentElement) {
    if (el === document.body) break;
    let ok = false;
    try { ok = sel === '*' ? true : el.matches(sel); } catch { ok = false; }
    if (ok && isVisible(el)) return { el, depth };
  }
  return null;
}

// Non-text descriptors (attr / placeholder / label / role / css) are ordinary
// top-down lookups — there is no text leaf to start from.
function findByAttribute(root, desc) {
  const tag = desc.tag || '*';
  const values = descriptorValues(desc);
  let sel = '';
  if (desc.by === 'css') sel = Array.isArray(desc.value) ? desc.value[0] : String(desc.value || '');
  else if (desc.by === 'attr') sel = `${tag}[${desc.attr || 'contenteditable'}="${(values[0] || 'true').replace(/["\\]/g, '\\$&')}"]`;
  else if (desc.by === 'role') sel = `${tag}[role="${(values[0] || '').replace(/["\\]/g, '\\$&')}"]`;
  else if (desc.by === 'placeholder' || desc.by === 'label') sel = EDITABLE_SEL;
  if (!sel) return [];

  let nodes = [];
  try { nodes = [...root.querySelectorAll(sel)]; } catch { return []; }
  nodes = nodes.filter(isVisible);
  if (desc.by === 'placeholder' || desc.by === 'label') {
    const attr = desc.by === 'placeholder' ? 'placeholder' : 'aria-label';
    nodes = nodes.filter((el) => {
      const h = norm(el.getAttribute(attr) || el.getAttribute('aria-label') || '').toLowerCase();
      return h && values.some((v) => h === v || h.includes(v));
    });
  }
  return nodes.map((el) => ({ el, depth: 0 }));
}

// When nothing matched, what IS on the page — so the failure says "the copy
// changed, here is the copy" instead of just "not found". Feeds both the event
// log and the rethink payload.
function nearestTexts(root, values, limit = 6) {
  const want = values[0] || '';
  const seen = new Set();
  const scored = [];
  let controls = [];
  try { controls = [...(root || document.body).querySelectorAll(CLICKABLE_SEL)]; } catch {}
  for (const el of controls) {
    if (!isVisible(el)) continue;
    const t = norm(el.getAttribute('aria-label') || el.innerText || el.textContent || '').slice(0, 60);
    if (!t || t.length > 60 || seen.has(t)) continue;
    seen.add(t);
    const lower = t.toLowerCase();
    // Cheap similarity: shared words, then shared prefix. Good enough to spot
    // "Next step" when we asked for "Next".
    const words = new Set(lower.split(/\s+/));
    let score = [...new Set(want.split(/\s+/))].filter((w) => words.has(w)).length * 10;
    if (lower.includes(want) || want.includes(lower)) score += 8;
    let i = 0; while (i < lower.length && i < want.length && lower[i] === want[i]) i++;
    score += i;
    // Unscored entries are KEPT. When the copy changed to something unrelated
    // ("Continue" → "Next"), nothing resembles what was asked for and a
    // similarity filter returns an empty list — throwing away the one thing
    // worth reporting: what is actually on the page.
    scored.push({ t, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.t);
}

// Resolve a descriptor to an element, or explain precisely why it could not.
// Returns { el, diagnosis } — diagnosis is populated ONLY on a miss.
function findByDescriptor(desc, op = 'click') {
  const by = desc?.by || 'text';
  const values = descriptorValues(desc);
  const diagnosis = {
    searched: { by, value: values, tag: desc?.tag || null, scope: desc?.scope || 'page', op },
    leavesMatched: 0, nearest: [], ascentRejected: [], scopeEmpty: false, retries: 0,
  };

  const root = scopeRoot(desc);
  if (!root) {
    // Asked to search inside a dialog that is not open: the PREVIOUS step did
    // not do what it claimed. Saying so beats "element not found".
    diagnosis.scopeEmpty = true;
    return { el: null, diagnosis };
  }
  if (!values.length && by !== 'attr') return { el: null, diagnosis };

  let candidates;
  if (by === 'text' || by === 'exactText') {
    let hits = matchingElements(root, values, by === 'exactText');
    if (desc?.tag) hits = hits.filter((h) => h.el.tagName.toLowerCase() === String(desc.tag).toLowerCase()
      || h.el.closest(desc.tag));
    diagnosis.leavesMatched = hits.length;
    candidates = [];
    for (const h of hits) {
      const up = ascend(h.el, op);
      if (up) candidates.push({ ...up, text: h.text });
      // Text was there but nothing actionable within the cap — this field is how
      // a wrong ASCENT_CAP or actionable predicate becomes visible instead of
      // looking like a missing element.
      else if (diagnosis.ascentRejected.length < 5) diagnosis.ascentRejected.push(h.text.slice(0, 60));
    }
  } else {
    candidates = findByAttribute(root, desc);
    diagnosis.leavesMatched = candidates.length;
  }

  if (!candidates.length) {
    if (!diagnosis.ascentRejected.length) diagnosis.nearest = nearestTexts(root, values);
    return { el: null, diagnosis };
  }

  // Nearest actionable ancestor wins; the existing signals only break ties.
  let best = null, bestScore = -Infinity;
  for (const c of candidates) {
    let s = -c.depth * 10;
    if (c.el.closest('[role="dialog"],[aria-modal="true"]')) s += 5;
    if (c.el.matches(CLICKABLE_SEL)) s += 3;
    s += Math.max(0, 5 - norm(c.el.innerText || c.el.textContent || '').length / 20);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return { el: best.el, diagnosis: null, depth: best.depth };
}

// RETRY RULE (CLAUDE.md): descriptors resolve through withBackoff like every
// other lookup — a stepped dialog renders late and a first miss is not a
// failure. The diagnosis returned is the LAST attempt's, with the retry count.
async function resolveDescriptor(desc, op = 'click') {
  let last = null, tries = 0;
  const el = await withBackoff(() => {
    tries++;
    last = findByDescriptor(desc, op);
    return last.el;
  });
  if (el) return { ok: true, el, depth: last.depth };
  const diagnosis = { ...(last?.diagnosis || {}), retries: Math.max(0, tries - 1) };
  return { ok: false, el: null, diagnosis, error: describeMiss(diagnosis) };
}

// One human sentence for the event log. Phrased to match executeLoop's
// TRANSIENT regex ("not found" / "no element") so the phase still auto-retries.
function describeMiss(d) {
  const want = (d.searched?.value || []).join('" / "');
  if (d.scopeEmpty) return `no element found: asked for "${want}" inside a ${d.searched?.scope} that is not open`;
  if (d.ascentRejected?.length) {
    return `no element found: text "${want}" is on the page (${d.ascentRejected.map((t) => `"${t}"`).join(', ')})`
      + ` but nothing clickable within ${ASCENT_CAP} levels above it`;
  }
  if (d.nearest?.length) return `no element found for "${want}" — nearest text on the page: ${d.nearest.map((t) => `"${t}"`).join(', ')}`;
  return `no element found for "${want}"`;
}

// A durable-ish CSS selector for an element the agent just used successfully,
// so that knowledge can be offered back as a saved element. Prefers attributes
// that survive re-renders over structural paths, which do not.
function selectorFor(el) {
  if (!el || !el.tagName) return '';
  const tag = el.tagName.toLowerCase();
  const esc = (v) => String(v).replace(/["\\]/g, '\\$&');
  if (el.id && !/^[0-9]/.test(el.id) && !/:|\s/.test(el.id)) return `#${el.id}`;
  for (const attr of ['data-testid', 'data-test-id', 'name']) {
    const v = el.getAttribute?.(attr);
    if (v) return `${tag}[${attr}="${esc(v)}"]`;
  }
  const aria = el.getAttribute?.('aria-label');
  if (aria) return `${tag}[aria-label="${esc(aria)}"]`;
  const role = el.getAttribute?.('role');
  if (role) return `${tag}[role="${esc(role)}"]`;
  return tag;
}

// Resolve a target either way: by descriptor (leaf-to-root, with a diagnosis on
// a miss) when the phase carries one, else the legacy selector/text lookup.
// Phases without a descriptor keep their exact current behaviour.
async function resolveTarget(op, selector, text, descriptor) {
  if (descriptor && (descriptor.by || descriptor.value)) return resolveDescriptor(descriptor, op);
  const find = (op === 'type' || op === 'press')
    ? () => findField(selector, text) || findTarget(selector, text)
    : () => findTarget(selector, text);
  const el = await withBackoff(find);
  return el ? { ok: true, el } : { ok: false, el: null, error: `no element for ${selector || text}` };
}

async function clickElement(selector, text, descriptor) {
  const r = await resolveTarget('click', selector, text, descriptor);
  const el = r.el;
  if (!el) return { ok: false, error: r.error, diagnosis: r.diagnosis || null };
  try { el.scrollIntoView({ block: 'center' }); } catch {}
  await sleep(120);
  try { el.click(); } catch (e) { return { ok: false, error: e.message }; }
  return {
    ok: true,
    matched: norm(el.getAttribute('aria-label') || el.innerText || el.textContent).slice(0, 60) || (selector || text),
    selectorHint: selectorFor(el),
    depth: r.depth ?? null,
    inDialog: !!el.closest('[role="dialog"],[aria-modal="true"]'),
  };
}

// What is actually on the page right now: the controls and fields a next step
// could target. This is the "observe" half of think→act→observe — without it a
// recovery decision is just another guess at button text.
function pageSnapshot(limit = 40) {
  const vis = (el) => {
    if (!el || el.offsetParent === null) return false;
    let r; try { r = el.getBoundingClientRect(); } catch { return false; }
    return r.width > 0 && r.height > 0;
  };
  const inDialog = (el) => !!el.closest('[role="dialog"],[aria-modal="true"]');
  const label = (el) =>
    norm(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.innerText || el.textContent || '')
      .slice(0, 70);

  const controls = [];
  for (const el of document.querySelectorAll('button,a,[role="button"],[role="link"],[role="tab"],[role="menuitem"],input[type="submit"]')) {
    if (!vis(el)) continue;
    const text = label(el);
    if (!text) continue;
    controls.push({ text, dialog: inDialog(el), disabled: !!(el.disabled || el.getAttribute('aria-disabled') === 'true') });
    if (controls.length >= limit) break;
  }

  const fields = [];
  for (const el of document.querySelectorAll('input,textarea,[contenteditable="true"],[role="textbox"]')) {
    if (!vis(el)) continue;
    let r; try { r = el.getBoundingClientRect(); } catch { r = { width: 0, height: 0 }; }
    fields.push({
      text: label(el), dialog: inDialog(el),
      area: Math.round(r.width * r.height),
      filled: norm(el.value || el.innerText || '').length > 0,
    });
    if (fields.length >= 15) break;
  }

  return {
    url: location.href.slice(0, 300),
    title: norm(document.title).slice(0, 120),
    dialogOpen: !!document.querySelector('[role="dialog"],[aria-modal="true"]'),
    controls,
    fields,
  };
}

// Is the composed text STILL sitting in an editable box / open dialog?
// Submitting clears the composer, so if the draft is still there the publish
// click did not land — which is how a mis-click used to report success.
function draftStillOpen(text) {
  const snippet = norm(String(text || '')).slice(0, 60).toLowerCase();
  if (snippet.length < 12) return false; // too short to identify reliably
  const vis = (el) => el && el.offsetParent !== null;
  const boxes = [
    ...document.querySelectorAll('[contenteditable="true"],[role="textbox"],textarea'),
    ...document.querySelectorAll('[role="dialog"],[aria-modal="true"]'),
  ];
  for (const el of boxes) {
    if (!vis(el)) continue;
    const v = norm(el.innerText || el.textContent || el.value || '').toLowerCase();
    if (v.includes(snippet)) return true;
  }
  return false;
}

async function hoverElement(selector, text, descriptor) {
  const r = await resolveTarget('click', selector, text, descriptor);
  const el = r.el;
  if (!el) return { ok: false, error: r.error, diagnosis: r.diagnosis || null };
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
  const vis = (el) => el && el.offsetParent !== null;
  const inDialog = (el) => !!el.closest('[role="dialog"],[aria-modal="true"]');
  const fields = [...document.querySelectorAll('input,textarea,[contenteditable="true"],[role="textbox"]')]
    .filter((el) => editable(el) && vis(el));

  if (text) {
    const t = String(text).toLowerCase().trim();
    let best = null, bestScore = 0;
    for (const el of fields) {
      const hint = (el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').toLowerCase();
      if (!hint) continue;
      let s = hint === t ? 100 : hint.includes(t) ? 50 : 0;
      if (!s) continue;
      if (inDialog(el)) s += 40;
      if (s > bestScore) { best = el; bestScore = s; }
    }
    if (best) return best;
  }

  // No usable hint. Order matters here: picking the FIRST editable in DOM order
  // typed a Facebook post into a feed COMMENT box, because comment inputs come
  // earlier in the document than the composer.
  //  1. a field inside an open dialog — that surface was deliberately opened
  //  2. the focused field — a preceding click usually focuses the composer
  //  3. the LARGEST visible field — a post composer dwarfs an inline comment box
  const dialogFields = fields.filter(inDialog);
  if (dialogFields.length) return biggest(dialogFields);
  if (editable(document.activeElement) && vis(document.activeElement)) return document.activeElement;
  return fields.length ? biggest(fields) : null;
}

// Visually largest field — the main composer rather than an incidental input.
function biggest(els) {
  let best = els[0], bestArea = -1;
  for (const el of els) {
    let r;
    try { r = el.getBoundingClientRect(); } catch { continue; }
    const area = (r.width || 0) * (r.height || 0);
    if (area > bestArea) { best = el; bestArea = area; }
  }
  return best;
}

// Type text into a field. Contenteditables (FB's Lexical post composer) go
// through insertIntoLexical, which clears the field first and tries ONE insert
// method at a time, verifying between attempts — inserting and then also
// dispatching a synthetic input event makes Lexical insert the text TWICE.
async function typeInto(selector, text, value, descriptor) {
  const r = await resolveTarget('type', selector, text, descriptor);
  const el = r.el;
  if (!el) return { ok: false, error: r.error || 'no editable field found', diagnosis: r.diagnosis || null };
  try { el.scrollIntoView({ block: 'center' }); } catch {}
  el.focus();
  await sleep(150);
  const label = norm(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName).slice(0, 50);
  try {
    // Same guard as the skill runtime: never apply an <input> value setter to a
    // node that is not an input — it throws "Illegal invocation".
    const field = editableTarget(el) || el;
    if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
      const proto = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      field.focus();
      if (setter) setter.call(field, value); else field.value = value;
      field.dispatchEvent(new InputEvent('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const method = await insertIntoLexical(field, value);
      if (!method) return { ok: false, error: 'could not insert text into the editor' };
    }
    // selectorHint/depth ride along so a successful descriptor can be recorded
    // as a skill hint later.
    return { ok: true, matched: label, selectorHint: selectorFor(el), depth: r.depth ?? null };
  } catch (e) { return { ok: false, error: e.message }; }
}

// The node a skill points at is not always the editable one — a taught
// "text input box" is often a wrapper around the real contenteditable.
function editableTarget(el) {
  if (!el) return null;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el;
  if (el.isContentEditable || el.getAttribute?.('contenteditable') === 'true' || el.getAttribute?.('role') === 'textbox') return el;
  return el.querySelector?.('[contenteditable="true"],[role="textbox"],textarea,input') || null;
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
      // Resolve to the actually-editable node first. Applying an <input> value
      // setter to a plain DIV throws "Illegal invocation" — which is how a
      // taught composer step failed on Facebook.
      const field = editableTarget(el);
      if (!field) return { ok: false, error: `step target is not a text field (${el.tagName.toLowerCase()}) — no field found` };
      if (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA') {
        const proto = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        field.focus();
        if (setter) setter.call(field, value || ''); else field.value = value || '';
        field.dispatchEvent(new InputEvent('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const method = await insertIntoLexical(field, value || '');
        if (!method) return { ok: false, error: 'could not insert text into the editor' };
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

// Console handle for testing the finder by hand. Content scripts run in an
// isolated world, so this is reachable from DevTools only after switching the
// console's context dropdown from "top" to this extension:
//   await __baFind({ by: 'exactText', value: 'Next', scope: 'dialog' })
//   await __baFind({ by: 'attr', attr: 'contenteditable', value: 'true' }, 'type')
globalThis.__baFind = async (descriptor, op = 'click') => {
  const r = await resolveDescriptor(descriptor, op);
  if (r.ok) { try { r.el.style.outline = '3px solid magenta'; } catch {} }
  console.log(r.ok ? `HIT (${r.depth} up): ${r.el.tagName}` : r.error, r.ok ? r.el : r.diagnosis);
  return r;
};

// --- Message handling ------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'COLLECT_LINKS') {
        sendResponse(await collectSearchLinks(msg.options || {}));
      } else if (msg?.type === 'EXTRACT_ARTICLE') {
        sendResponse(extractArticle({ maxChars: msg.maxChars || 8000 }));
      } else if (msg?.type === 'SCROLL_PAGE') {
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
        sendResponse(await clickElement(msg.selector, msg.text, msg.descriptor));
      } else if (msg?.type === 'FIND_DESCRIPTOR') {
        // Phase 1 probe: resolve a descriptor and report what happened, WITHOUT
        // acting on it. Used to test the ascent against a real page before any
        // tool depends on it.
        {
          const r = await resolveDescriptor(msg.descriptor || {}, msg.op || 'click');
          sendResponse(r.ok
            ? { ok: true, depth: r.depth, tag: r.el.tagName.toLowerCase(),
                matched: norm(r.el.getAttribute('aria-label') || r.el.innerText || r.el.textContent).slice(0, 80),
                selectorHint: selectorFor(r.el) }
            : { ok: false, error: r.error, diagnosis: r.diagnosis });
        }
      } else if (msg?.type === 'PAGE_SNAPSHOT') {
        sendResponse({ ok: true, snapshot: pageSnapshot(msg.limit || 40) });
      } else if (msg?.type === 'DRAFT_STILL_OPEN') {
        sendResponse({ ok: true, open: draftStillOpen(msg.text || '') });
      } else if (msg?.type === 'HOVER_ELEMENT') {
        sendResponse(await hoverElement(msg.selector, msg.text, msg.descriptor));
      } else if (msg?.type === 'TYPE_TEXT') {
        sendResponse(await typeInto(msg.selector, msg.text, msg.value, msg.descriptor));
      } else if (msg?.type === 'PRESS_KEY') {
        sendResponse(await pressKey(msg.selector, msg.text, msg.key || 'Enter'));
      } else if (msg?.type === 'WAIT_FOR') {
        // Poll until the element appears (clickables, fields, or any matching
        // node), up to `timeout` ms. Phrased so a timeout is NOT auto-retried
        // by the phase loop — this tool already IS the wait.
        {
          const deadline = Date.now() + Math.min(Number(msg.timeout) || 30000, 120000);
          const desc = msg.descriptor && (msg.descriptor.by || msg.descriptor.value) ? msg.descriptor : null;
          let el = null, last = null;
          while (!el && Date.now() < deadline) {
            // Descriptors are resolved WITHOUT withBackoff here — this loop is
            // already the wait, and nesting the 1/2/4/8s backoff inside it would
            // overshoot the caller's timeout by up to 15s.
            if (desc) { last = findByDescriptor(desc, msg.op || 'click'); el = last.el; }
            else el = findTarget(msg.selector, msg.text) || findField(msg.selector, msg.text);
            if (!el) await sleep(500);
          }
          sendResponse(el
            ? { ok: true, matched: norm(el.getAttribute && (el.getAttribute('aria-label') || el.innerText || el.textContent) || el.tagName).slice(0, 60) }
            : { ok: false,
                error: `wait timeout: "${desc ? (descriptorValues(desc)[0] || '?') : (msg.selector || msg.text)}" did not appear`,
                diagnosis: last?.diagnosis || null });
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
