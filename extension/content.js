// Facebook Page Scraper - content script
// Runs on *.facebook.com. Two jobs:
//  1) On a feed/search page: scroll and collect candidate Page links.
//  2) On a Page profile: extract page info.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Link collection -------------------------------------------------------

// Paths that are clearly NOT a page profile.
const NON_PAGE_SEGMENTS = new Set([
  'watch', 'reel', 'reels', 'story', 'stories', 'groups', 'events',
  'marketplace', 'gaming', 'photo', 'photo.php', 'videos', 'video.php',
  'permalink.php', 'posts', 'sharer', 'sharer.php', 'login', 'help',
  'settings', 'bookmarks', 'friends', 'messages', 'notifications',
  'search', 'hashtag', 'l.php', 'ajax', 'privacy', 'policies'
]);

function normalizePageUrl(href) {
  let u;
  try { u = new URL(href, location.origin); } catch { return null; }
  if (!/(^|\.)facebook\.com$/.test(u.hostname)) return null;

  // profile.php?id=... is a valid page/profile URL
  if (u.pathname === '/profile.php' && u.searchParams.get('id')) {
    return `${u.origin}/profile.php?id=${u.searchParams.get('id')}`;
  }

  const seg = u.pathname.split('/').filter(Boolean);
  if (seg.length === 0) return null;
  const first = seg[0].toLowerCase();
  if (NON_PAGE_SEGMENTS.has(first)) return null;

  // /people/Name/1000... -> keep as-is (profile)
  // /PageSlug -> keep the slug only, drop deep post paths
  if (first === 'people' || first === 'pages') {
    return `${u.origin}/${seg.slice(0, 3).join('/')}`;
  }
  // A page slug: strip trailing sub-paths like /about, /photos
  return `${u.origin}/${seg[0]}`;
}

// The feed lives inside <div role="main">. Page links sit inside each post's
// header anchor, with the page name in a <span class="html-span"> child.
function getMainScope() {
  return document.querySelector('div[role="main"]') || document.body;
}

function grabPageLinks(found) {
  const scope = getMainScope();

  // Primary: the page-name span inside a post anchor.
  scope.querySelectorAll('a[href] span.html-span').forEach((span) => {
    const a = span.closest('a[href]');
    if (!a) return;
    const url = normalizePageUrl(a.getAttribute('href'));
    if (!url) return;
    const name = (span.textContent || '').trim();
    if (!name) return;
    if (!found.has(url)) found.set(url, name);
    else if (!found.get(url) && name) found.set(url, name);
  });

  // Fallback: any page anchor inside main that has visible text.
  scope.querySelectorAll('a[href]').forEach((a) => {
    const url = normalizePageUrl(a.getAttribute('href'));
    if (!url || found.has(url)) return;
    const name = (a.textContent || '').trim().slice(0, 120);
    if (name) found.set(url, name);
  });
}

// Scroll (slowly) until `target` unique page links are collected, or the feed
// stops yielding new ones. De-duped by url via the Map.
async function scrollAndCollectLinks({ target = 10, delay = 1200, maxScrolls = 300 } = {}) {
  const found = new Map(); // url -> name (unique)
  const scope = getMainScope();

  grabPageLinks(found);
  let stagnant = 0;
  for (let i = 0; i < maxScrolls && found.size < target; i++) {
    const before = found.size;
    // ~80% of a viewport per step, inside main if it scrolls, else the window.
    if (scope && scope.scrollHeight > scope.clientHeight + 4) {
      scope.scrollTop += Math.round(scope.clientHeight * 0.8);
    } else {
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
    }
    await sleep(delay);
    grabPageLinks(found);
    // Stop if the feed stops producing new links (end reached / rate-limited).
    if (found.size === before) { if (++stagnant >= 8) break; } else stagnant = 0;
  }

  return Array.from(found, ([url, label]) => ({ url, label })).slice(0, target);
}

// Plain scroll: step down the page `times` times WITHOUT collecting anything.
// Scrolls the feed container if it scrolls, else the window. Returns count done.
async function scrollPage(times = 10, delay = 1200) {
  const scope = getMainScope();
  let done = 0;
  for (let i = 0; i < times; i++) {
    if (scope && scope.scrollHeight > scope.clientHeight + 4) {
      scope.scrollTop += Math.round(scope.clientHeight * 0.8);
    } else {
      window.scrollBy(0, Math.round(window.innerHeight * 0.8));
    }
    await sleep(delay);
    done++;
  }
  return done;
}

// Click the page's Follow button unless already Following. Returns the outcome.
function clickFollowIfNeeded() {
  if (document.querySelector('div[aria-label="Following"][role="button"]')) return 'already-following';
  const btn = document.querySelector('div[aria-label="Follow"][role="button"]');
  if (btn) { btn.click(); return 'followed'; }
  return 'no-button';
}

// --- Page info extraction --------------------------------------------------

function textOf(el) {
  return el ? (el.textContent || '').trim() : '';
}

function firstMatch(regex) {
  const m = document.body.innerText.match(regex);
  return m ? m[0].trim() : '';
}

function extractPageInfo() {
  const info = {
    url: location.href,
    name: '',
    title: document.title || '',
    category: '',
    likes: '',
    followers: '',
    intro: '',
    website: '',
    phone: '',
    email: '',
    address: '',
    profileImage: '',
    collectedAt: new Date().toISOString()
  };

  // Name: prefer h1, fall back to og:title / document title
  const h1 = document.querySelector('h1');
  info.name = textOf(h1) ||
    document.querySelector('meta[property="og:title"]')?.content ||
    (document.title || '').replace(/\s*\|\s*Facebook.*/i, '').trim();

  // Profile image
  info.profileImage =
    document.querySelector('meta[property="og:image"]')?.content || '';

  // Intro / description
  info.intro =
    document.querySelector('meta[property="og:description"]')?.content ||
    document.querySelector('meta[name="description"]')?.content || '';

  // Followers / likes from visible text (best-effort, FB markup is unstable)
  const followers = firstMatch(/[\d.,]+[KMB]?\s+followers/i);
  const likes = firstMatch(/[\d.,]+[KMB]?\s+likes/i);
  info.followers = followers;
  info.likes = likes;

  // Website / email / phone from visible links & text
  const links = Array.from(document.querySelectorAll('a[href]'));
  const site = links.find((a) => /l\.php\?u=/.test(a.href) || /^https?:\/\//.test(a.getAttribute('href') || ''));
  if (site) {
    let href = site.href;
    const m = href.match(/l\.php\?u=([^&]+)/);
    info.website = m ? decodeURIComponent(m[1]) : (site.getAttribute('href') || '');
  }
  const mail = links.find((a) => /^mailto:/.test(a.getAttribute('href') || ''));
  if (mail) info.email = mail.getAttribute('href').replace(/^mailto:/, '');
  const tel = links.find((a) => /^tel:/.test(a.getAttribute('href') || ''));
  if (tel) info.phone = tel.getAttribute('href').replace(/^tel:/, '');

  // Category often sits right under the name
  info.category = firstMatch(/\b(Local business|Business|Product\/service|Company|Public figure|Community|Shopping & retail|Restaurant|Media\/news company|Education)\b/i);

  return info;
}

// --- Page-details extraction (only for real Pages) -------------------------
//
// Facebook's class names are obfuscated and rotate, so selectors below chain
// STABLE anchors (aria-label / role / href params / heading text) from ancestor
// down to child. That keeps each pointer unique and resilient.

// Collapse runs of whitespace/newlines so exact-text matches survive FB's
// pretty-printed / line-wrapped markup.
function norm(t) {
  return (t || '').replace(/\s+/g, ' ').trim();
}

// Detect a Facebook Page. Primary signal is the standalone "Followers" label,
// but layouts vary, so also accept a followers link or a "N followers" count.
function isFacebookPage() {
  for (const s of document.querySelectorAll('span')) {
    if (norm(s.textContent) === 'Followers') return true;
  }
  if (document.querySelector('a[href*="sk=followers"], a[href*="/followers"]')) return true;
  if (/[\d.,]+\s*[kmb]?\s*followers/i.test(norm(document.body.innerText))) return true;
  return false;
}

// Strip Facebook tracking params (fbclid, etc.) from a URL.
function cleanUrl(u) {
  try {
    const url = new URL(u);
    ['fbclid', 'mibextid', '__tn__', '__cft__', 'eav', '_rdr', 'h', 's'].forEach((p) => url.searchParams.delete(p));
    return url.toString().replace(/\?$/, '');
  } catch {
    return u;
  }
}

// l.facebook.com/l.php?u=<encoded real url> -> real url (tracking stripped)
function decodeFbLink(href) {
  if (!href) return '';
  let out = href;
  try {
    const u = new URL(href, location.origin);
    if (/(^|\.)facebook\.com$/.test(u.hostname) && u.pathname === '/l.php') {
      const real = u.searchParams.get('u');
      if (real) out = real;
    }
  } catch {
    const m = href.match(/[?&]u=([^&]+)/);
    if (m) { try { out = decodeURIComponent(m[1]); } catch {} }
  }
  return cleanUrl(out);
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

// True if a decoded link is a real external website (not fb/social/map/whatsapp).
function isWebsiteLink(dec) {
  const host = hostOf(dec);
  if (!host || /facebook\.com$/.test(host)) return false;
  if (/instagram\.com$|tiktok\.com$|twitter\.com$|x\.com$|youtube\.com$|linkedin\.com$/.test(host)) return false;
  if (/whatsapp\.com$|wa\.me$/.test(host)) return false;
  if (/bing\.com$|google\.[^/]+$/.test(host)) return false;
  if (/\/maps\//i.test(dec) || /[?&]where1=/i.test(dec)) return false;
  return true;
}

// The page name node sits just above the "... followers" row. Climb from the
// followers link and pick the first real label that isn't a stat or an action.
function domHeaderName() {
  const fol = document.querySelector('a[href*="sk=followers"], a[href*="/followers"]');
  let block = fol ? fol.parentElement : null;
  for (let i = 0; i < 8 && block; i++) {
    for (const el of block.querySelectorAll('[role="button"], a[href]')) {
      // skip the follower/following stat links themselves
      if (el.matches('a[href*="sk="], a[href*="/followers"], a[href*="/following"]')) continue;
      // Drop the trailing verified-badge screen-reader text.
      const name = norm(el.textContent).replace(/\s*Verified account$/i, '').trim();
      if (name && name.length <= 80 &&
          !/^[\d.,]+[kmb]?$/i.test(name) &&
          !/follower|following/i.test(name) &&
          !/^(follow|message|share|like|see more|more)$/i.test(name)) {
        return name;
      }
    }
    block = block.parentElement;
  }
  return '';
}

// Page name — prefer the DOM header (reliable even when the tab title is still
// the generic "Facebook"); fall back to og:title / document.title.
function findName() {
  const dom = domHeaderName();
  if (dom) return dom;
  const clean = (s) => (s || '').replace(/\s*[|·\-–]\s*Facebook.*$/i, '').trim();
  const og = clean(document.querySelector('meta[property="og:title"]')?.content);
  if (og && og.toLowerCase() !== 'facebook') return og;
  const t = clean(document.title);
  if (t && t.toLowerCase() !== 'facebook') return t;
  return og || t || '';
}

// Follower/following count. Handles all layouts:
//  - profile.php pages: <a href="...sk=followers"><strong>35K</strong> followers</a>
//  - vanity pages:      <a href="/PageName/followers">...</a>
//  - plain text:        "35K followers"
function statCount(kind) {
  // 1) dedicated link (sk= param or /followers path)
  const a = document.querySelector(`a[href*="sk=${kind}"], a[href*="/${kind}"]`);
  if (a) {
    const strong = a.querySelector('strong');
    const t = norm(strong ? strong.textContent : a.textContent);
    const m = t.match(/[\d.,]+\s*[kmb]?/i);
    if (m) return m[0].replace(/\s+/g, '');
    if (t) return t;
  }
  // 2) text fallback: "35K followers" / "1,234 followers"
  const m = norm(document.body.innerText).match(new RegExp('([\\d.,]+\\s*[kmb]?)\\s*' + kind, 'i'));
  return m ? m[1].replace(/\s+/g, '') : '';
}

// Bio — the description block rendered directly above the
// <span aria-label="Highlighted details"> list.
function findBio() {
  const hd = document.querySelector('span[aria-label="Highlighted details"]');
  if (!hd) return '';
  let el = hd;
  for (let up = 0; up < 10 && el; up++) {
    let prev = el.previousElementSibling;
    while (prev) {
      const t = norm(prev.textContent);
      if (t && t.length > 1 && !/follower|following|highlighted details/i.test(t)) {
        return t;
      }
      prev = prev.previousElementSibling;
    }
    el = el.parentElement;
  }
  return '';
}

// All inner texts of the "Highlighted details" list. Page owners put varied
// info here (category, social handle, phone, "Rating", "Price range"...), so
// keep the raw list too.
function getHighlights() {
  const hd = document.querySelector('span[aria-label="Highlighted details"]');
  if (!hd) return [];
  return [...hd.querySelectorAll('[role="listitem"]')]
    .map((it) => norm(it.textContent))
    .filter(Boolean);
}

// Category — first Highlighted-details item that isn't a phone or a social handle.
function findCategory() {
  const hd = document.querySelector('span[aria-label="Highlighted details"]');
  if (!hd) return '';
  for (const it of hd.querySelectorAll('[role="listitem"]')) {
    if (it.querySelector('a[href]')) continue; // social/link rows, not the category
    const t = norm(it.textContent);
    if (t && !/\+?\d[\d\s().\-]{6,}\d/.test(t)) return t;
  }
  return '';
}

// Phone can live as plain text in the Highlighted-details list.
function highlightPhone() {
  const hd = document.querySelector('span[aria-label="Highlighted details"]');
  if (!hd) return '';
  for (const it of hd.querySelectorAll('[role="listitem"]')) {
    if (it.querySelector('a[href]')) continue;
    const m = norm(it.textContent).match(/\+?\d[\d\s().\-]{6,}\d/);
    if (m) return norm(m[0]);
  }
  return '';
}

// Locate the "Contact info" list by heading text -> its id -> aria-labelledby.
function contactInfoList() {
  let id = '';
  for (const s of document.querySelectorAll('h2 span[id], span[id]')) {
    if (norm(s.textContent) === 'Contact info') { id = s.id; break; }
  }
  if (!id) return null;
  try { return document.querySelector(`[aria-labelledby="${CSS.escape(id)}"]`); } catch { return null; }
}

// Classify each row inside the Contact info list.
function parseContactInfo() {
  const out = { phone: '', email: '', website: '', address: '' };
  const list = contactInfoList();
  if (!list) return out;
  for (const row of list.querySelectorAll('[role="listitem"]')) {
    const mail = row.querySelector('a[href^="mailto:"]');
    if (mail) { out.email = mail.getAttribute('href').replace(/^mailto:/, ''); continue; }

    const link = row.querySelector('a[href]');
    if (link) {
      const raw = link.getAttribute('href') || '';
      const dec = decodeFbLink(link.href);
      const isMap = /bing\.com\/maps|google\.[^/]+\/maps|[?&]where1=/i.test(raw) || /\/maps\//i.test(dec);
      if (isMap) { out.address = norm(link.textContent); continue; }
      if (!out.website && isWebsiteLink(dec)) { out.website = dec; continue; }
    }

    const txt = norm(row.textContent);
    const pm = txt.match(/\+?\d[\d\s().\-]{6,}\d/);
    if (pm && !out.phone) out.phone = norm(pm[0]);
  }
  return out;
}

// Address can live in a separate "About" list (not always under Contact info).
// The map link is a stable signal — Bing/Google maps or a where1= query.
function findAddress() {
  for (const a of document.querySelectorAll('[role="listitem"] a[href], a[href]')) {
    const dec = decodeFbLink(a.href);
    if (/\/maps\//i.test(dec) || /[?&]where1=/i.test(dec) || /bing\.com\/maps/i.test(dec)) {
      const t = norm(a.textContent);
      if (t) return t;
    }
  }
  return '';
}

// Website — first external link in an info list that isn't a map/social/whatsapp.
function findWebsite() {
  for (const a of document.querySelectorAll('[role="listitem"] a[href]')) {
    const dec = decodeFbLink(a.href);
    if (isWebsiteLink(dec)) return dec;
  }
  return '';
}

// Email anywhere: a mailto link, else an email pattern in visible text.
function findEmail() {
  const a = document.querySelector('a[href^="mailto:"]');
  if (a) return a.getAttribute('href').replace(/^mailto:/, '').split('?')[0];
  const m = norm(document.body.innerText).match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : '';
}

// Phone anywhere: a tel: link, else the WhatsApp number.
function findPhone() {
  const a = document.querySelector('a[href^="tel:"]');
  if (a) return a.getAttribute('href').replace(/^tel:/, '');
  return '';
}

// Instagram / TikTok links anywhere on the page (via l.php decode).
function findSocials() {
  const res = { instagram: '', tiktok: '' };
  for (const a of document.querySelectorAll('a[href]')) {
    const dec = decodeFbLink(a.href);
    const host = hostOf(dec);
    if (/instagram\.com$/.test(host) && !res.instagram) res.instagram = dec;
    else if (/tiktok\.com$/.test(host) && !res.tiktok) res.tiktok = dec;
  }
  return res;
}

// Page logo — the <image> inside the profile-picture <svg> holds the real fbcdn
// URL (xlink:href). Prefer it over og:image (often just a share card).
function findLogo() {
  const svgImg = document.querySelector('.x1dus1kp svg image') || document.querySelector('svg image');
  const href = svgImg
    ? (svgImg.getAttribute('xlink:href') ||
       svgImg.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
       svgImg.getAttribute('href') || '')
    : '';
  return href || document.querySelector('meta[property="og:image"]')?.content || '';
}

// Page banner — the cover photo, tagged data-imgperflogname="profileCoverPhoto".
function findCover() {
  const el = document.querySelector('[data-imgperflogname="profileCoverPhoto"]');
  if (!el) return '';
  const img = el.tagName === 'IMG' ? el : el.querySelector('img');
  if (img && img.getAttribute('src')) return img.getAttribute('src');
  const bg = el.getAttribute('style') || '';
  const m = bg.match(/url\(["']?(.*?)["']?\)/);
  return m ? m[1] : '';
}

// Phone fallback from the WhatsApp CTA button, if present.
function whatsappPhone() {
  const a = document.querySelector('a[aria-label="WhatsApp"]');
  if (!a) return '';
  const dec = decodeFbLink(a.href);
  const m = dec.match(/[?&]phone=([^&]+)/);
  if (!m) return '';
  try { return decodeURIComponent(m[1]).trim(); } catch { return m[1]; }
}

function extractPageDetails() {
  const details = {
    url: location.href,
    name: findName(),
    isPage: isFacebookPage(),
    category: '',
    followers: '',
    following: '',
    bio: '',
    phone: '',
    email: '',
    whatsapp: '',
    website: '',
    address: '',
    instagram: '',
    tiktok: '',
    highlights: [],
    logo: '',
    cover: '',
    collectedAt: new Date().toISOString()
  };

  if (!details.isPage) return details; // caller skips non-pages

  details.logo = findLogo();
  details.cover = findCover();
  details.highlights = getHighlights();
  details.category = findCategory();
  details.followers = statCount('followers'); // e.g. "35K"
  details.following = statCount('following');
  details.bio = findBio() ||
    document.querySelector('meta[property="og:description"]')?.content || '';

  const contact = parseContactInfo();
  details.whatsapp = whatsappPhone();
  details.phone = contact.phone || findPhone() || highlightPhone() || details.whatsapp;
  details.email = contact.email || findEmail();
  details.website = contact.website || findWebsite();
  details.address = contact.address || findAddress();

  const social = findSocials();
  details.instagram = social.instagram;
  details.tiktok = social.tiktok;

  return details;
}

// Which fields we'd expect on a healthy Page. Used to flag partial extractions.
const CORE_FIELDS = ['name', 'followers', 'phone', 'email', 'website', 'address', 'bio'];

function missingCoreFields(details) {
  return CORE_FIELDS.filter((f) => !details[f]);
}

// Save the HTML for debugging only on a likely FAILURE, not a page that simply
// lacks optional info: name/followers empty, or NO contact info found at all.
function shouldSaveDebugHtml(details) {
  if (!details.name || !details.followers) return true;
  if (!details.phone && !details.email && !details.website && !details.address) return true;
  return false;
}

// Fill empty fields of `a` from `b`; keep the richer highlights list.
function mergeDetails(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) {
    const bv = b[k];
    if (Array.isArray(bv)) { if ((out[k]?.length || 0) < bv.length) out[k] = bv; }
    else if (typeof bv === 'boolean') { out[k] = out[k] || bv; }
    else if (!out[k] && bv) { out[k] = bv; }
  }
  return out;
}

// Step-scroll down the whole page (height grows as content lazy-loads), pausing
// at each step so sections render, then return to the top. Used before extract.
async function hydratePage(steps = 10, stepDelay = 1000) {
  for (let i = 1; i <= steps; i++) {
    window.scrollTo(0, Math.round(document.body.scrollHeight * (i / steps)));
    await sleep(stepDelay);
  }
  // Sit at the very bottom a moment so the last lazy sections finish loading.
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(1500);
  window.scrollTo(0, 0);
  await sleep(1500);
}

// Extract, and if fields look incomplete, wait + scroll and try again (up to
// `attempts`). Later passes see more lazily-loaded content; results are merged.
async function extractPageDetailsWithRetry({ wait = 5000, attempts = 3 } = {}) {
  let best = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt === 1) await sleep(wait);

    // Force lazy sections (Intro / Contact info card, About, posts) to hydrate.
    // Long pages only render a section once it's scrolled near, so step down
    // the WHOLE page (recomputing height as it grows), then return to the top.
    await hydratePage(7, 900);

    const d = extractPageDetails();
    best = best ? mergeDetails(best, d) : d;
    best.isPage = best.isPage || d.isPage;
    best.missingFields = best.isPage ? missingCoreFields(best) : [];

    const incomplete = !best.isPage || shouldSaveDebugHtml(best);
    const worthRetrying = best.isPage ||
      document.querySelector('a[href*="sk=followers"], a[href*="/followers"]');
    if (!incomplete || !worthRetrying) break;
  }
  return best;
}

// --- Messenger automation --------------------------------------------------

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

// Close every docked/open chat window (staggered clicks), then wait ~1s.
async function closeAllChats() {
  const closers = document.querySelectorAll('[aria-label="Close chat"]');
  closers.forEach((b, i) => setTimeout(() => { try { b.click(); } catch {} }, i * 100));
  await sleep((closers.length * 100) + 1000);
}

// Send a message in the page's chat composer. Returns { ok, method, sent }.
async function sendChatMessage(message) {
  const msgBtn = document.querySelector(
    'div[aria-label="Message"][role="button"], div[aria-label="Send message"][role="button"]'
  );
  if (!msgBtn) return { ok: false, error: 'Message button not found on this page' };
  msgBtn.click();

  // The chat input is uniquely scoped inside the "Thread composer" container —
  // this avoids the page's comment boxes (also Lexical contenteditables).
  const CHAT_INPUT = 'div[aria-label="Thread composer"] div[contenteditable="true"][role="textbox"]';
  const found = await waitForEl(CHAT_INPUT, 10000);
  if (!found) return { ok: false, error: 'Chat composer did not open' };
  await sleep(700);
  const editor = document.querySelector(CHAT_INPUT) || found;

  const method = await insertIntoLexical(editor, message || '');
  if (!method) return { ok: false, error: 'Could not insert text into composer' };

  await sleep(400);
  const sendBtn = document.querySelector('div[aria-label="Press Enter to send"]');
  if (!sendBtn) return { ok: true, method, sent: false, error: 'Send button not found' };
  sendBtn.click();
  await sleep(3000);
  await closeAllChats();
  return { ok: true, method, sent: true };
}

// Run the selected FB actions on this page in a SINGLE visit: optionally follow
// and/or send a message. Both happen in one tab, not separately.
async function fbRunActions({ doFollow, doMessage, message }) {
  // 1) Let the page finish loading before touching anything.
  await sleep(2500);
  // 2) Close any docked/open chat windows, then wait ~1s.
  await closeAllChats();

  const out = { ok: true };

  // 3) Follow first (quick, header button).
  if (doFollow) {
    out.followAction = clickFollowIfNeeded();
    await sleep(800);
  }

  // 4) Then message.
  if (doMessage) {
    const r = await sendChatMessage(message);
    out.method = r.method;
    out.sent = !!r.sent;
    if (!r.ok) { out.messageError = r.error; }
    else if (!r.sent) { out.messageError = r.error; }
  }

  return out;
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

// --- Post-by-post scanning (find_post) --------------------------------------
// Walks feed posts ONE AT A TIME in DOM order so none are skipped: each call
// scrolls the next unscanned post into view, lets it hydrate, expands
// "See more", and returns its full text. Scan state lives on the elements
// (__baScanned), so repeated calls step through the feed post by post.

// Top-level feed posts only — comments render as nested [role="article"].
function articleNodes() {
  return [...document.querySelectorAll('[role="article"]')]
    .filter((el) => !(el.parentElement && el.parentElement.closest('[role="article"]')));
}

// Best-effort permalink of a post (timestamp/permalink anchor inside it).
function postPermalink(article) {
  const a = article.querySelector(
    'a[href*="/posts/"], a[href*="story_fbid"], a[href*="/permalink"], a[href*="/videos/"], a[href*="/reel/"]'
  );
  if (!a) return '';
  try { return cleanUrl(new URL(a.getAttribute('href'), location.origin).toString()); } catch { return ''; }
}

async function scanNextPost({ settle = 700, maxLoadScrolls = 4 } = {}) {
  const scope = getMainScope();
  for (let attempt = 0; attempt <= maxLoadScrolls; attempt++) {
    for (const article of articleNodes()) {
      if (article.__baScanned) continue;
      try { article.scrollIntoView({ block: 'center' }); } catch {}
      await sleep(settle); // let the post hydrate in view
      // Expand truncated text so the whole content is readable.
      for (const btn of article.querySelectorAll('[role="button"]')) {
        if (norm(btn.textContent).toLowerCase() === 'see more') {
          try { btn.click(); await sleep(400); } catch {}
          break;
        }
      }
      const text = fullText(article).slice(0, 6000);
      article.__baScanned = true;
      if (!text) continue; // placeholder that never hydrated — move to the next
      return { ok: true, post: { text, url: postPermalink(article) || location.href } };
    }
    // Every post in the DOM is scanned — nudge one small step to load more.
    if (scope && scope.scrollHeight > scope.clientHeight + 4) scope.scrollTop += Math.round(scope.clientHeight * 0.6);
    else window.scrollBy(0, Math.round(window.innerHeight * 0.6));
    await sleep(1000);
  }
  return { ok: true, noMore: true };
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
  const el = findTarget(selector, text);
  if (!el) return { ok: false, error: `no element for ${selector || text}` };
  try { el.scrollIntoView({ block: 'center' }); } catch {}
  await sleep(120);
  try { el.click(); } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, matched: norm(el.getAttribute('aria-label') || el.innerText || el.textContent).slice(0, 60) || (selector || text) };
}

async function hoverElement(selector, text) {
  const el = findTarget(selector, text);
  if (!el) return { ok: false, error: `no element for ${selector || text}` };
  try { el.scrollIntoView({ block: 'center' }); } catch {}
  await sleep(120);
  for (const type of ['pointerover', 'mouseover', 'mouseenter', 'mousemove']) {
    try { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window })); } catch {}
  }
  return { ok: true, matched: norm(el.getAttribute('aria-label') || el.innerText || el.textContent).slice(0, 60) || (selector || text) };
}

// Perform a single-element skill's action.
async function useSkill(skill) {
  const el = resolveOne(document, skill.selectors);
  if (!el) return { ok: false, error: 'element not found for skill ' + skill.name };
  const act = skill.action || 'click';
  try {
    if (act === 'click') el.click();
    else if (act === 'hover') el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    else if (act === 'scroll') { if (el.scrollHeight > el.clientHeight + 4) el.scrollTop += Math.round(el.clientHeight * 0.8); else el.scrollIntoView({ block: 'center' }); }
    else if (act === 'read') return { ok: true, value: norm(el.textContent) };
  } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, action: act };
}

// --- Message handling ------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'COLLECT_LINKS') {
        const links = await scrollAndCollectLinks(msg.options || {});
        sendResponse({ ok: true, links });
      } else if (msg?.type === 'SCROLL_PAGE') {
        const scrolled = await scrollPage(msg.times || 10, msg.delay || 1200);
        sendResponse({ ok: true, scrolled });
      } else if (msg?.type === 'USE_SKILL') {
        sendResponse(await useSkill(msg.skill));
      } else if (msg?.type === 'COLLECT_BY_SKILL') {
        const records = await collectBySkill(msg.skill, msg.target || 20, msg.delay || 1200, 200, msg.fields || null);
        sendResponse({ ok: true, records });
      } else if (msg?.type === 'COLLECT_TEXT') {
        const records = await collectText(msg.selector, msg.target || 20, msg.delay || 1200);
        sendResponse({ ok: true, records });
      } else if (msg?.type === 'SCAN_NEXT_POST') {
        sendResponse(await scanNextPost(msg || {}));
      } else if (msg?.type === 'CLICK_ELEMENT') {
        sendResponse(await clickElement(msg.selector, msg.text));
      } else if (msg?.type === 'HOVER_ELEMENT') {
        sendResponse(await hoverElement(msg.selector, msg.text));
      } else if (msg?.type === 'EXTRACT_PAGE_INFO') {
        // Give lazy content a moment to render.
        await sleep(msg.wait || 1500);
        sendResponse({ ok: true, info: extractPageInfo() });
      } else if (msg?.type === 'EXTRACT_PAGE_DETAILS') {
        const details = await extractPageDetailsWithRetry({
          wait: msg.wait || 5000,
          attempts: msg.attempts || 3
        });
        // Attach full HTML only when it still looks like extraction failed after
        // all retries, so the backend can save it for later debugging.
        const html = (details.isPage && shouldSaveDebugHtml(details))
          ? document.documentElement.outerHTML : '';
        sendResponse({ ok: true, details, html });
      } else if (msg?.type === 'FB_ACTIONS') {
        const res = await fbRunActions({
          doFollow: !!msg.doFollow,
          doMessage: !!msg.doMessage,
          message: msg.message
        });
        sendResponse(res);
      } else {
        sendResponse({ ok: false, error: 'UNKNOWN_MESSAGE' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true;
});
