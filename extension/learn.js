// Browser Agent — learning overlay (injected on demand by the background).
// Point-and-click teaching. Two-step model (docs/skill-redesign-plan.md):
//   1. INTRODUCE elements — name one thing on the page (type, action/attr,
//      parent element, route pattern). Repointable when the site changes.
//   2. COMPOSE skills — bundle introduced elements into a named skill (v2).
// The CLASSIC tab keeps the original one-shot skill flow.
//
// Selectors are computed DETERMINISTICALLY from stable anchors (aria-label /
// role / text / href / data-*). The control panel lives in an IFRAME (not a
// shadow root) so keystrokes typed into its inputs never reach the host page's
// keyboard-shortcut handlers.

(() => {
  if (window.__BA_LEARN) { window.__BA_LEARN.restart(); return; }

  const BACKEND = 'http://localhost:4000';
  const host = location.hostname.replace(/^www\./, '');
  const firstSeg = location.pathname.split('/').filter(Boolean)[0];
  const defaultPattern = `${host}/${firstSeg ? firstSeg + '/*' : '*'}`;

  const cssEsc = (v) => String(v).replace(/["\\]/g, '\\$&');
  const cssId = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : v);
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Link URL: own href, else child <a>, else nearest ancestor <a> (FB text lives
  // in a deep span whose clickable link is an ancestor anchor).
  const hrefOf = (el) => {
    if (!el) return '';
    if (el.getAttribute && el.getAttribute('href')) return el.getAttribute('href');
    const anc = el.closest && el.closest('a[href]');       // nearest ancestor link
    if (anc) return anc.getAttribute('href');
    const child = el.querySelector && el.querySelector('a[href]'); // nearest child link
    return child ? child.getAttribute('href') : '';
  };
  // Full visible text of an element + everything inside it, keeping line breaks.
  const fullText = (el) => {
    if (!el) return '';
    const t = (el.innerText != null && el.innerText !== '') ? el.innerText : (el.textContent || '');
    return t.replace(/[ \t]+/g, ' ').replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };
  // Image URL from either an HTML <img> (src) or an SVG <image> (xlink:href/href).
  const imageUrlOf = (el) => {
    if (!el) return '';
    const svgHref = (im) => im.getAttribute('xlink:href') ||
      im.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || im.getAttribute('href') || '';
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'img') return el.getAttribute('src') || '';
    if (tag === 'image') return svgHref(el);
    const img = el.querySelector && el.querySelector('img');
    if (img && img.getAttribute('src')) return img.getAttribute('src');
    const svgImg = el.querySelector && el.querySelector('image');
    if (svgImg) return svgHref(svgImg);
    const bg = el.style && el.style.backgroundImage;
    const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
    return m ? m[1] : '';
  };

  function indexOfType(n) { let i = 1, s = n; while ((s = s.previousElementSibling)) if (s.tagName === n.tagName) i++; return i; }
  function cssPath(el) {
    const parts = []; let n = el;
    for (let i = 0; i < 6 && n && n !== document.body; i++) {
      if (n.id) { parts.unshift(`#${cssId(n.id)}`); break; }
      const al = n.getAttribute && n.getAttribute('aria-label');
      if (al) { parts.unshift(`${n.tagName.toLowerCase()}[aria-label="${cssEsc(al)}"]`); break; }
      parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${indexOfType(n)})`); n = n.parentElement;
    }
    return parts.join(' > ');
  }
  // A reusable aria-label selector for an element, or null if the label looks
  // dynamic (contains a name/free text). Action labels keep only their stable prefix.
  function stableAria(el) {
    const al = el.getAttribute && el.getAttribute('aria-label');
    if (!al) return null;
    const m = al.match(/^(.*?)\s+(?:to|on|for)\s+/i);
    if (m && /\b(like|love|care|haha|wow|sad|angry|react|comment|share|send|message|follow|save|reply|write)\b/i.test(m[1])) {
      return `[aria-label^="${cssEsc(m[1])}"]`;   // e.g. [aria-label^="React with Like"]
    }
    return null; // name / free-text label — don't bake it in
  }
  function relPath(container, el) {
    const parts = []; let n = el;
    while (n && n !== container && parts.length < 6) {
      const sa = stableAria(n);
      parts.unshift(sa ? `${n.tagName.toLowerCase()}${sa}` : `${n.tagName.toLowerCase()}:nth-of-type(${indexOfType(n)})`);
      n = n.parentElement;
    }
    return parts.join(' > ');
  }
  function computeSelectors(el) {
    const out = []; const tag = el.tagName.toLowerCase();
    const aria = el.getAttribute && el.getAttribute('aria-label');
    const role = el.getAttribute && el.getAttribute('role');
    const text = norm(el.textContent).slice(0, 60);
    if (aria) out.push({ strategy: 'css', value: `${tag}[aria-label="${cssEsc(aria)}"]`, score: 92 });
    if (role && text) out.push({ strategy: 'roleText', role, text, tag, score: 74 });
    if (tag === 'a') { const href = el.getAttribute('href') || ''; if (/sk=|\/followers|mailto:|tel:|\/groups\//.test(href)) out.push({ strategy: 'css', value: `a[href*="${cssEsc(href.slice(0, 40))}"]`, score: 60 }); }
    for (const a of (el.attributes || [])) { if (a.name.startsWith('data-') && a.value && a.value.length < 40 && !/^\d+$/.test(a.value)) { out.push({ strategy: 'css', value: `${tag}[${a.name}="${cssEsc(a.value)}"]`, score: 58 }); break; } }
    if (role) out.push({ strategy: 'css', value: `${tag}[role="${cssEsc(role)}"]`, score: 52 });
    if (text) out.push({ strategy: 'text', tag, text, score: 46 });
    out.push({ strategy: 'css', value: cssPath(el), score: 30 });
    return out.sort((a, b) => b.score - a.score);
  }
  // Find the repeating-item container. Prefers common list/post roles the
  // clicked element sits inside; else climbs looking for a role/data-* selector
  // that matches many siblings. Returns { selector, count, container }.
  function computeItemSelector(el) {
    // 1) feed units (current FB) and common repeating roles.
    const posinset = el.closest('div[aria-posinset]');
    if (posinset) { let c = 0; try { c = document.querySelectorAll('div[aria-posinset]').length; } catch {} if (c >= 2) return { selector: 'div[aria-posinset]', count: c, container: posinset }; }
    for (const role of ['article', 'listitem', 'row']) {
      const anc = el.closest(`[role="${role}"]`);
      if (anc) { const sel = `[role="${role}"]`; let c = 0; try { c = document.querySelectorAll(sel).length; } catch {} if (c >= 2) return { selector: sel, count: c, container: anc }; }
    }
    // 2) climb: pick the container whose stable selector repeats the most.
    let best = null, n = el;
    for (let i = 0; i < 10 && n && n !== document.body; i++) {
      const cands = [];
      const r = n.getAttribute && n.getAttribute('role'); if (r) cands.push(`[role="${cssEsc(r)}"]`);
      for (const a of (n.attributes || [])) { if (a.name.startsWith('data-') && a.value && a.value.length < 30 && !/^\d+$/.test(a.value)) { cands.push(`${n.tagName.toLowerCase()}[${a.name}="${cssEsc(a.value)}"]`); break; } }
      for (const sel of cands) { try { const c = document.querySelectorAll(sel).length; if (c >= 3 && c <= 400 && (!best || c > best.count)) best = { selector: sel, count: c, container: n }; } catch {} }
      n = n.parentElement;
    }
    if (best) return best;
    // 3) fallback: exact path (matches one — the panel will show count 1 so you know).
    const p = cssPath(el); let c = 1; try { c = document.querySelectorAll(p).length; } catch {}
    return { selector: p, count: c, container: el };
  }
  function signatureOf(el) {
    return { tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', aria: el.getAttribute('aria-label') || '', text: norm(el.textContent).slice(0, 40), attrs: [...(el.attributes || [])].map((a) => a.name).filter((n) => n.startsWith('data-')).slice(0, 5) };
  }

  // ---- route patterns (client mirror of the backend rules) ----
  // '[slug]' matches one path segment, '*' matches anything, '/*' = any path.
  function generalizeRoute(p) {
    const segs = String(p || '/').split('?')[0].split('/').filter(Boolean);
    const out = segs.map((s) => {
      if (/^pfbid/i.test(s)) return '[postId]';
      if (/^\d{4,}$/.test(s)) return '[id]';
      if (/^[0-9a-f]{10,}$/i.test(s) || /^[A-Za-z0-9_=-]{18,}$/.test(s)) return '[id]';
      return s;
    });
    return '/' + out.join('/');
  }
  function routeMatches(route, path) {
    const src = String(route || '/*')
      .replace(/[.+?^${}()|\\]/g, '\\$&').replace(/\[[^\]/]+\]/g, '[^/]+').replace(/\*/g, '.*');
    const p = (String(path || '/').split('?')[0].replace(/\/+$/, '')) || '/';
    try { return new RegExp('^' + src + '/?$', 'i').test(p); } catch { return false; }
  }

  // ---- hover highlight (parent DOM, non-interactive) ----
  const hi = document.createElement('div');
  hi.style.cssText = 'position:fixed;z-index:2147483646;border:2px solid #6d8bff;background:rgba(109,139,255,.15);pointer-events:none;display:none;border-radius:4px;';
  document.documentElement.appendChild(hi);
  const matchStyle = document.createElement('style');
  matchStyle.textContent = '.__ba_match{outline:2px solid #34d399 !important;outline-offset:-2px;}';
  document.documentElement.appendChild(matchStyle);

  // ---- panel in an iframe (isolates keystrokes from the page) ----
  const frame = document.createElement('iframe');
  frame.id = 'ba-learn-frame';
  frame.style.cssText = 'position:fixed;right:16px;bottom:16px;width:350px;height:560px;max-height:92vh;border:none;border-radius:12px;box-shadow:0 12px 44px rgba(0,0,0,.5);z-index:2147483647;background:transparent;';
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#16181f;color:#e7e9ee;border:1px solid #2a2f3a;border-radius:12px;overflow:hidden}
    .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#1d2029;border-bottom:1px solid #2a2f3a;font-weight:600;cursor:move;user-select:none;touch-action:none}
    .hd .host{color:#8b90a0;font-weight:400;font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .hd .x{cursor:pointer;background:none;border:none;color:#8b90a0;font-size:15px}
    .tabs{display:flex;gap:4px;padding:8px 10px 0;background:#16181f}
    .tab{flex:1;padding:6px 4px;background:#1d2029;border:1px solid #2a2f3a;border-radius:7px;color:#8b90a0;cursor:pointer;font:inherit;font-size:12px;font-weight:600}
    .tab.on{color:#fff;background:#5570e6;border-color:#5570e6}
    .body{padding:12px;max-height:calc(92vh - 84px);overflow:auto}
    .hint{color:#8b90a0}
    .preview{font:11px ui-monospace,monospace;background:#0e0f13;border:1px solid #2a2f3a;border-radius:7px;padding:7px;margin-bottom:10px;word-break:break-word;max-height:70px;overflow:auto}
    label{display:block;font-size:12px;color:#c7ccd8;margin:8px 0 4px}
    input,select,textarea{width:100%;padding:6px 8px;background:#1d2029;color:#e7e9ee;border:1px solid #2a2f3a;border-radius:7px;font:inherit}
    input:focus,select:focus,textarea:focus{outline:none;border-color:#6d8bff}
    input:disabled,select:disabled{opacity:.5}
    .row-inline{display:flex;gap:6px;align-items:flex-end}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    .kinds{display:flex;gap:12px;margin:10px 0 4px}
    .kinds label{display:inline-flex;align-items:center;gap:5px;margin:0}
    .kinds input{width:auto}
    button.btn{width:100%;padding:8px;margin-top:12px;background:#5570e6;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer}
    button.btn.ghost{background:#1d2029;color:#e7e9ee;border:1px solid #2a2f3a}
    .fields{margin-top:8px;display:flex;flex-direction:column;gap:6px}
    .frow{display:grid;grid-template-columns:1fr 74px 24px;gap:5px}
    .frow input,.frow select{padding:4px 6px;font-size:12px}
    .frow .del{background:none;border:1px solid #2a2f3a;color:#8b90a0;border-radius:6px;cursor:pointer}
    .matches{display:block;color:#f6c453;font-size:12px;margin:6px 0}
    .msg{display:block;margin-top:8px;font-size:12px;color:#8b90a0}
    .hidden{display:none!important}
    .elems{margin-top:10px;display:flex;flex-direction:column;gap:4px}
    .erow{display:flex;gap:6px;align-items:center;padding:4px 7px;border:1px solid #2a2f3a;border-radius:7px;font-size:12px;cursor:pointer}
    .erow:hover{border-color:#6d8bff}
    .erow .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .erow .ty{color:#8b90a0}
    .cnt.ok{color:#34d399}.cnt.bad{color:#f87171}
    .crow{display:flex;gap:6px;align-items:center;padding:4px 7px;border:1px solid #2a2f3a;border-radius:7px;font-size:12px;margin-bottom:4px}
    .crow input{width:auto}
    .crow .nm{flex:1}
    .rt{color:#8b90a0;font-size:11px;margin:8px 0 2px;text-transform:none}
    .section-lbl{font-size:11px;color:#8b90a0;letter-spacing:.4px;text-transform:uppercase;margin:12px 0 4px}
  </style></head><body>
    <div class="hd" title="Drag to move">🎓 Learning <span class="host">${host}</span><button class="x" title="Exit">✕</button></div>
    <div class="tabs">
      <button class="tab on" data-tab="intro">1 · Introduce</button>
      <button class="tab" data-tab="compose">2 · Compose skill</button>
      <button class="tab" data-tab="classic">Classic</button>
    </div>
    <div class="body">

      <!-- ============ TAB: INTRODUCE ELEMENT ============ -->
      <div id="tab-intro">
        <div class="hint" id="ihint">Click any element on the page to introduce it.</div>
        <div class="hidden" id="iform">
          <div class="preview" id="ipreview"></div>
          <div class="row-inline">
            <div style="flex:1"><label>Name</label><input id="iname" placeholder="e.g. post_item" /></div>
            <button class="btn ghost" id="isuggest" title="Suggest name" style="margin:0;width:auto;padding:6px 9px">✨</button>
          </div>
          <div class="grid2">
            <div><label>Type</label>
              <select id="itype">
                <option value="action">action (click/hover…)</option>
                <option value="input">input (type into)</option>
                <option value="field">field (read data)</option>
                <option value="item">item (repeating)</option>
                <option value="container">container</option>
              </select></div>
            <div id="iactWrap"><label>Action</label>
              <select id="iact"><option>click</option><option>type</option><option>read</option><option>hover</option><option>scroll</option></select></div>
            <div id="iattrWrap" class="hidden"><label>Reads</label>
              <select id="iattr"><option>text</option><option>innerText</option><option>href</option><option>src</option></select></div>
          </div>
          <label>Parent element <span style="color:#8b90a0">(auto-detected)</span></label>
          <select id="iparent"><option value="">(none — whole page)</option></select>
          <label>Route pattern <span style="color:#8b90a0">([slug] = one segment, /* = any path)</span></label>
          <input id="iroute" />
          <label>Short details <span style="color:#8b90a0">(the AI planner reads this)</span></label>
          <input id="idetails" placeholder="e.g. One post card in the home feed" />
          <span class="matches hidden" id="imatches"></span>
          <label>Save as</label>
          <select id="irepoint"><option value="">➕ New element</option></select>
          <button class="btn" id="isave">Save element</button>
          <span class="msg" id="imsg"></span>
        </div>
        <div class="section-lbl">Introduced on this page</div>
        <div class="elems" id="elemList"><span class="hint">Loading…</span></div>
      </div>

      <!-- ============ TAB: COMPOSE SKILL ============ -->
      <div id="tab-compose" class="hidden">
        <div class="hint">Pick introduced elements, then name the skill. The agent uses the skill's elements to do the task.</div>
        <div id="composeList" style="margin-top:8px"><span class="hint">Loading…</span></div>
        <label>Skill name</label>
        <input id="sname" placeholder="e.g. collect_feed_posts" />
        <label>Short details <span style="color:#8b90a0">(what is this skill for?)</span></label>
        <input id="sdetails" placeholder="e.g. Collect publisher + text + link from feed posts" />
        <button class="btn" id="ssave">Save skill</button>
        <span class="msg" id="smsg"></span>
      </div>

      <!-- ============ TAB: CLASSIC (one-shot skill) ============ -->
      <div id="tab-classic" class="hidden">
        <div class="hint" id="hint">Click any element on the page to teach it.</div>
        <div class="sel hidden" id="sel">
          <div class="preview" id="preview"></div>
          <div class="row-inline">
            <div style="flex:1"><label>Name</label><input id="name" placeholder="e.g. like_button" /></div>
            <button class="btn ghost" id="suggest" title="Suggest name" style="margin:0;width:auto;padding:6px 9px">✨</button>
          </div>
          <div class="kinds">
            <label><input type="radio" name="kind" value="action" checked/> Action</label>
            <label><input type="radio" name="kind" value="collection"/> Collection</label>
          </div>
          <div id="actionRow"><label>Action</label>
            <select id="act"><option>click</option><option>scroll</option><option>type</option><option>read</option><option>hover</option></select>
          </div>
          <div id="collRow" class="hidden">
            <span class="matches" id="matches"></span>
            <button class="btn ghost" id="addField" style="margin-top:0">+ Tag a field (click one inside an item)</button>
            <div class="fields" id="fieldList"></div>
          </div>
          <label>Save under URL pattern</label>
          <input id="pat" value="${defaultPattern}" />
          <button class="btn ghost" id="test" style="margin-top:8px">🧪 Test on this page</button>
          <div id="testOut" class="msg" style="white-space:pre-wrap"></div>
          <button class="btn" id="save">Validate &amp; review</button>
          <div id="review" class="hidden" style="margin-top:10px">
            <div id="reviewOut" class="preview" style="max-height:150px"></div>
            <div style="display:flex;gap:8px">
              <button class="btn" id="confirmSave" style="margin-top:0">Confirm &amp; Save</button>
              <button class="btn ghost" id="cancelSave" style="margin-top:0">Cancel</button>
            </div>
          </div>
          <span class="msg" id="msg"></span>
        </div>
      </div>

    </div>
  </body></html>`;
  document.documentElement.appendChild(frame);

  // ---- session state ----
  let idoc = null;
  let tab = 'intro';
  let selectedEl = null, kind = 'action', itemSelector = null, fields = [], capturingField = false, hoverEl = null;
  let ELEMENTS = [];                 // introduced elements for this host
  let elemById = new Map();
  let iSel = null;                   // node selected in the Introduce tab
  let parentCands = [];              // [{e, node, depth}] containing iSel
  const outlined = [];
  const $ = (s) => idoc.querySelector(s);
  const clearOutlines = () => { outlined.forEach((el) => el.classList.remove('__ba_match')); outlined.length = 0; };
  const outline = (nodes) => { clearOutlines(); nodes.forEach((n) => { n.classList.add('__ba_match'); outlined.push(n); }); };

  // ---- element resolution (in-page, css candidates only) ----
  function ownNodes(elDoc, root) {
    for (const s of (elDoc.selectors || [])) {
      if (s.strategy !== 'css' || !s.value) continue;
      try { const ns = [...root.querySelectorAll(s.value)]; if (ns.length) return ns; } catch {}
    }
    return [];
  }
  function resolveNodes(elDoc, seen = new Set()) {
    if (!elDoc || seen.has(elDoc.elementId)) return [];
    seen.add(elDoc.elementId);
    const parent = elDoc.parentId ? elemById.get(elDoc.parentId) : null;
    if (!parent) return ownNodes(elDoc, document);
    const out = [];
    for (const p of resolveNodes(parent, seen)) out.push(...ownNodes(elDoc, p));
    return out;
  }
  const routeElements = () => ELEMENTS.filter((e) => routeMatches(e.route, location.pathname));
  const domDepth = (n) => { let d = 0; while ((n = n.parentElement)) d++; return d; };

  // Elements on this route whose resolved node CONTAINS `node` — innermost first.
  function findParentCandidates(node) {
    const out = [];
    for (const e of routeElements()) {
      for (const n of resolveNodes(e)) {
        if (n !== node && n.contains(node)) { out.push({ e, node: n, depth: domDepth(n) }); break; }
      }
    }
    return out.sort((a, b) => b.depth - a.depth);
  }

  async function loadElements() {
    try { ELEMENTS = (await fetch(`${BACKEND}/elements?host=${encodeURIComponent(host)}`).then((r) => r.json())).elements || []; }
    catch { ELEMENTS = []; }
    elemById = new Map(ELEMENTS.map((e) => [e.elementId, e]));
    renderElemList(); renderCompose(); renderRepointOptions();
  }

  function renderElemList() {
    const box = $('#elemList');
    const list = routeElements();
    if (!list.length) { box.innerHTML = '<span class="hint">None yet for this route.</span>'; return; }
    box.innerHTML = list.map((e) => {
      const n = resolveNodes(e).length;
      return `<div class="erow" data-id="${esc(e.elementId)}" title="Click to highlight on the page">
        <span class="nm">${esc(e.name)}</span><span class="ty">${esc(e.type)}</span>
        <span class="cnt ${n ? 'ok' : 'bad'}">${n ? n + '×' : 'broken'}</span>
      </div>`;
    }).join('');
    box.querySelectorAll('.erow').forEach((row) => row.addEventListener('click', () => {
      const e = elemById.get(row.getAttribute('data-id'));
      outline(resolveNodes(e));
    }));
  }

  function renderRepointOptions() {
    const sel = $('#irepoint');
    const keep = sel.value;
    sel.innerHTML = '<option value="">➕ New element</option>' +
      routeElements().map((e) => `<option value="${esc(e.elementId)}">↻ Repoint: ${esc(e.name)}</option>`).join('');
    sel.value = keep && elemById.has(keep) ? keep : '';
  }

  // ---- Introduce tab ----
  function guessTypeAttr(el) {
    const clicky = el.matches && el.matches('a,button,[role="button"],[role="link"],[role="tab"],[role="menuitem"],input[type="submit"]');
    const editable = el.matches && el.matches('input,textarea,[contenteditable="true"],[role="textbox"]');
    if (editable) return { type: 'input', action: 'type', attr: 'text' };
    if (clicky) return { type: 'action', action: 'click', attr: 'text' };
    const tag = el.tagName.toLowerCase();
    const txt = norm(el.textContent);
    let hasImg = false, hasLink = false;
    try { hasImg = !!(el.querySelector && el.querySelector('img, image')); } catch {}
    try { hasLink = !!(el.querySelector && el.querySelector('a[href]')); } catch {}
    const attr = tag === 'a' ? 'href' : (tag === 'img' || tag === 'image') ? 'src'
      : (hasImg && !txt) ? 'src' : (hasLink && !txt) ? 'href' : 'text';
    return { type: 'field', action: 'click', attr };
  }

  function introSelect(el) {
    iSel = el;
    $('#ihint').classList.add('hidden'); $('#iform').classList.remove('hidden');
    $('#imsg').textContent = '';
    const sig = signatureOf(el);
    $('#ipreview').textContent = `<${sig.tag}${sig.role ? ` role="${sig.role}"` : ''}${sig.aria ? ` aria-label="${sig.aria}"` : ''}> ${sig.text}`;
    const g = guessTypeAttr(el);
    $('#itype').value = g.type; $('#iact').value = g.action; $('#iattr').value = g.attr;
    // parent auto-detect: innermost introduced element containing the click
    parentCands = findParentCandidates(el);
    $('#iparent').innerHTML = '<option value="">(none — whole page)</option>' +
      parentCands.map((c) => `<option value="${esc(c.e.elementId)}">${esc(c.e.name)} (${esc(c.e.type)})</option>`).join('');
    $('#iparent').value = parentCands.length ? parentCands[0].e.elementId : '';
    $('#iroute').value = generalizeRoute(location.pathname);
    toggleIntroType();
  }

  function toggleIntroType() {
    const t = $('#itype').value;
    $('#iactWrap').classList.toggle('hidden', !(t === 'action' || t === 'input'));
    $('#iattrWrap').classList.toggle('hidden', t !== 'field');
    const m = $('#imatches');
    if (t === 'item' && iSel) {
      const r = computeItemSelector(iSel);
      m.textContent = `Matches ${r.count} repeating item(s): ${r.selector}`;
      m.classList.remove('hidden');
      try { outline([...document.querySelectorAll(r.selector)]); } catch {}
    } else { m.classList.add('hidden'); clearOutlines(); }
  }

  // Selector candidates for the element being introduced.
  function buildIntroSelectors(node, type, parentPick) {
    if (type === 'item') {
      const r = computeItemSelector(node);
      return [{ strategy: 'css', value: r.selector, score: 60 }];
    }
    if (parentPick && parentPick.node && parentPick.node.contains(node)) {
      // relative to the parent element's node (resolver scopes queries inside it)
      const sels = [];
      const aria = stableAria(node);
      if (aria) sels.push({ strategy: 'css', value: node.tagName.toLowerCase() + aria, score: 55 });
      const rel = relPath(parentPick.node, node);
      if (rel) sels.push({ strategy: 'css', value: rel, score: 50 });
      if (sels.length) return sels;
    }
    return computeSelectors(node);
  }

  async function saveElement() {
    if (!iSel) return;
    const msg = $('#imsg');
    const repointId = $('#irepoint').value;
    const type = $('#itype').value;
    const parentId = $('#iparent').value || null;
    const parentPick = parentCands.find((c) => c.e.elementId === parentId) || null;
    if (parentId && !parentPick) { msg.textContent = 'Chosen parent does not contain the clicked element.'; return; }
    const selectors = buildIntroSelectors(iSel, type, parentPick);
    const sample = signatureOf(iSel);
    const sampleHtml = (type === 'item' || type === 'container') ? (iSel.outerHTML || '').slice(0, 60000) : null;
    msg.textContent = 'Saving…';
    try {
      let r;
      if (repointId) {
        r = await fetch(`${BACKEND}/elements/${repointId}/repoint`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectors, sample, sampleHtml }),
        }).then((x) => x.json());
        msg.textContent = r.ok ? `Repointed “${r.element.name}” ✓ (v${r.element.version}) — every skill using it is healed.` : (r.error || 'Failed.');
      } else {
        const name = $('#iname').value.trim();
        if (!name) { msg.textContent = 'Name required.'; return; }
        r = await fetch(`${BACKEND}/elements`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            host, name, type,
            route: $('#iroute').value.trim() || '/*',
            details: $('#idetails').value.trim(),
            action: (type === 'action' || type === 'input') ? $('#iact').value : null,
            attr: type === 'field' ? $('#iattr').value : null,
            parentId, selectors, sample, sampleHtml,
          }),
        }).then((x) => x.json());
        msg.textContent = r.ok ? `Saved element “${r.element.name}” ✓ — introduce more or compose a skill.` : (r.error || 'Failed.');
      }
      if (r.ok) {
        $('#iname').value = ''; $('#idetails').value = ''; $('#irepoint').value = '';
        iSel = null; $('#iform').classList.add('hidden'); $('#ihint').classList.remove('hidden');
        clearOutlines();
        await loadElements();
        $('#imsg').textContent = msg.textContent; // keep the confirmation visible after re-render
      }
    } catch { msg.textContent = 'Backend not reachable.'; }
  }

  // Repointing keeps identity — lock the identity inputs while it's selected.
  function toggleRepointLock() {
    const locked = !!$('#irepoint').value;
    ['#iname', '#itype', '#iparent', '#iroute', '#idetails', '#iact', '#iattr'].forEach((s) => { $(s).disabled = locked; });
    if (locked) {
      const e = elemById.get($('#irepoint').value);
      if (e) { $('#iname').value = e.name; $('#itype').value = e.type; $('#iroute').value = e.route; $('#idetails').value = e.details || ''; }
      $('#imsg').textContent = 'Repointing replaces the selectors only; name/type/route stay.';
    } else { $('#imsg').textContent = ''; }
  }

  // ---- Compose tab ----
  function renderCompose() {
    const box = $('#composeList');
    if (!ELEMENTS.length) { box.innerHTML = '<span class="hint">No elements yet — introduce some first.</span>'; return; }
    const byRoute = {};
    for (const e of ELEMENTS) (byRoute[e.route] = byRoute[e.route] || []).push(e);
    box.innerHTML = Object.entries(byRoute).map(([route, list]) => `
      <div class="rt">${esc(route)}</div>` +
      list.map((e) => `<label class="crow"><input type="checkbox" value="${esc(e.elementId)}" />
        <span class="nm">${esc(e.name)}</span><span class="ty">${esc(e.type)}${e.attr ? ':' + esc(e.attr) : ''}${e.action ? ':' + esc(e.action) : ''}</span></label>`).join('')
    ).join('');
  }

  async function saveSkill() {
    const msg = $('#smsg');
    const ids = [...$('#composeList').querySelectorAll('input:checked')].map((c) => c.value);
    const name = $('#sname').value.trim();
    if (!name) { msg.textContent = 'Skill name required.'; return; }
    if (!ids.length) { msg.textContent = 'Pick at least one element.'; return; }
    // URL pattern: the shared route if all elements agree, else host-wide.
    const routes = [...new Set(ids.map((id) => elemById.get(id)?.route || '/*'))];
    const urlPattern = host + (routes.length === 1 ? routes[0] : '/*');
    msg.textContent = 'Saving…';
    try {
      const r = await fetch(`${BACKEND}/skills`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, name, details: $('#sdetails').value.trim(), elements: ids, urlPattern }),
      }).then((x) => x.json());
      if (r.ok) {
        msg.textContent = `Saved skill “${r.skill.name}” ✓ — usable in tasks right away.`;
        $('#sname').value = ''; $('#sdetails').value = '';
        $('#composeList').querySelectorAll('input:checked').forEach((c) => { c.checked = false; });
      } else msg.textContent = r.error || 'Failed.';
    } catch { msg.textContent = 'Backend not reachable.'; }
  }

  // ---- page pointer handling ----
  function onMove(e) {
    if (e.target === frame || tab === 'compose') { hi.style.display = 'none'; return; }
    hoverEl = e.target;
    const r = e.target.getBoundingClientRect();
    hi.style.display = 'block'; hi.style.left = r.left + 'px'; hi.style.top = r.top + 'px'; hi.style.width = r.width + 'px'; hi.style.height = r.height + 'px';
  }
  function onClick(e) {
    if (e.target === frame) return;      // clicks inside the panel never reach here anyway
    if (tab === 'compose') return;       // compose only uses the panel
    e.preventDefault(); e.stopImmediatePropagation();
    const el = hoverEl || e.target;
    if (tab === 'intro') { introSelect(el); return; }
    if (capturingField) { addField(el); return; }
    selectElement(el);
  }

  // ---- Classic tab (original one-shot skill flow, unchanged) ----
  function selectElement(el) {
    selectedEl = el; fields = []; renderFields();
    $('#hint').classList.add('hidden'); $('#sel').classList.remove('hidden');
    const sig = signatureOf(el);
    $('#preview').textContent = `<${sig.tag}${sig.role ? ` role="${sig.role}"` : ''}${sig.aria ? ` aria-label="${sig.aria}"` : ''}> ${sig.text}`;
    if (kind === 'collection') refreshItem();
  }
  function refreshItem() {
    if (!selectedEl) return;
    const r = computeItemSelector(selectedEl); itemSelector = r.selector;
    $('#matches').textContent = `Matches ${r.count} similar item(s) on the page.`;
    clearOutlines();
    try { document.querySelectorAll(itemSelector).forEach((el) => { el.classList.add('__ba_match'); outlined.push(el); }); } catch {}
  }
  function addField(el) {
    capturingField = false; $('#addField').textContent = '+ Tag a field (click one inside an item)';
    let container = null; try { container = el.closest(itemSelector); } catch {}
    if (!container) container = el.parentElement;
    const tag = el.tagName.toLowerCase();
    let hasImg = false, hasLink = false;
    try { hasImg = !!(el.querySelector && el.querySelector('img, image')); } catch {}
    try { hasLink = !!(el.querySelector && el.querySelector('a[href]')); } catch {}
    const txt = norm(el.textContent);
    const attr = tag === 'a' ? 'href'
      : (tag === 'img' || tag === 'image') ? 'src'
      : (hasImg && !txt) ? 'src'
      : (hasLink && !txt) ? 'href'   // wrapper over an icon/link with no own text
      : 'text';
    fields.push({ name: `field${fields.length + 1}`, attr, rel: relPath(container, el), ariaSel: stableAria(el) || '' });
    renderFields();
  }
  function renderFields() {
    const box = $('#fieldList'); if (!box) return;
    box.innerHTML = fields.map((f, i) => `<div class="frow"><input data-i="${i}" class="fname" value="${f.name}" /><select data-i="${i}" class="fattr">${['text', 'innerText', 'href', 'src', 'click'].map((a) => `<option ${a === f.attr ? 'selected' : ''}>${a}</option>`).join('')}</select><button class="del" data-i="${i}">✕</button></div>`).join('');
    box.querySelectorAll('.fname').forEach((inp) => inp.addEventListener('input', (e) => { fields[+e.target.dataset.i].name = e.target.value; }));
    box.querySelectorAll('.fattr').forEach((s) => s.addEventListener('change', (e) => { fields[+e.target.dataset.i].attr = e.target.value; }));
    box.querySelectorAll('.del').forEach((b) => b.addEventListener('click', () => { fields.splice(+b.dataset.i, 1); renderFields(); }));
  }

  let pendingSkill = null;   // validated skill awaiting the user's confirmation

  function buildBody() {
    if (!selectedEl) return null;
    const name = $('#name').value.trim();
    if (!name) { $('#msg').textContent = 'Name required.'; return null; }
    const body = { host, urlPattern: $('#pat').value.trim() || defaultPattern, name, kind, sample: signatureOf(selectedEl) };
    if (kind === 'action') { body.action = $('#act').value; body.selectors = computeSelectors(selectedEl); }
    else {
      body.item = { selectors: [{ strategy: 'css', value: itemSelector, score: 60 }] };
      body.fields = fields.map((f) => ({ name: f.name, attr: f.attr, selectors: [{ strategy: 'css', value: f.rel, score: 50 }, ...(f.ariaSel ? [{ strategy: 'css', value: f.ariaSel, score: 55 }] : [])] }));
      let sample = null; try { sample = selectedEl.closest(itemSelector) || document.querySelector(itemSelector); } catch {}
      body.sampleHtml = (sample && sample.outerHTML || '').slice(0, 60000);
    }
    return body;
  }

  // Step 1: validate + clean, then SHOW what changed and ask for confirmation.
  async function runValidate() {
    const body = buildBody();
    if (!body) return;
    $('#msg').textContent = 'Validating…';
    let model = ''; try { model = (await new Promise((r) => chrome.storage.local.get(['ba_model'], (o) => r(o.ba_model)))) || ''; } catch {}
    let skill = body, notes = [];
    try {
      const v = await fetch(`${BACKEND}/skills/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, model }) }).then((x) => x.json());
      if (v.ok && v.skill) { skill = v.skill; notes = v.changes || []; }
    } catch { $('#msg').textContent = 'Backend not reachable.'; return; }
    pendingSkill = skill;
    const lines = skill.kind === 'collection'
      ? (skill.fields || []).map((f) => `  • ${f.name} [${f.attr}]`).join('\n')
      : `  action: ${skill.action}`;
    $('#reviewOut').textContent =
      (notes.length ? '✦ AI cleaned:\n' + notes.map((n) => '  - ' + n).join('\n') + '\n\n' : '✓ No issues found.\n\n') +
      `Will save “${skill.name}” (${skill.kind}):\n` + lines;
    $('#review').classList.remove('hidden');
    $('#save').classList.add('hidden');
    $('#msg').textContent = '';
  }

  // Step 2: user confirmed — persist the validated skill.
  async function confirmSave() {
    if (!pendingSkill) return;
    $('#msg').textContent = 'Saving…';
    try {
      const r = await fetch(`${BACKEND}/skills`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingSkill) }).then((x) => x.json());
      if (r.ok) {
        $('#msg').textContent = `Saved “${pendingSkill.name}” ✓ — keep teaching or exit.`;
        pendingSkill = null;
        $('#name').value = ''; selectedEl = null; fields = [];
        $('#sel').classList.add('hidden'); $('#hint').classList.remove('hidden');
        $('#review').classList.add('hidden'); $('#save').classList.remove('hidden');
        $('#reviewOut').textContent = ''; $('#testOut').textContent = '';
        clearOutlines();
      } else { $('#msg').textContent = r.error || 'Failed.'; }
    } catch { $('#msg').textContent = 'Backend not reachable.'; }
  }

  function cancelSave() {
    pendingSkill = null;
    $('#review').classList.add('hidden');
    $('#save').classList.remove('hidden');
  }
  // AI name suggestion (shared by both tabs; writes into the given input).
  async function suggestName(targetInput, node, applyKind) {
    if (!node) return;
    let model = ''; try { model = (await new Promise((r) => chrome.storage.local.get(['ba_model'], (o) => r(o.ba_model)))) || ''; } catch {}
    const msg = tab === 'intro' ? $('#imsg') : $('#msg');
    if (!model) { msg.textContent = 'No model set (pick one in the popup).'; return; }
    msg.textContent = 'Thinking…';
    try {
      const r = await fetch(`${BACKEND}/skills/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature: signatureOf(node), model }) }).then((x) => x.json());
      if (r.ok && r.name) {
        targetInput.value = r.name;
        if (applyKind && (r.kind === 'action' || r.kind === 'collection')) { kind = r.kind; $(`input[value="${kind}"]`).checked = true; toggleKind(); }
        msg.textContent = '';
      } else msg.textContent = r.error || 'No suggestion.';
    } catch { msg.textContent = 'Suggest failed.'; }
  }
  function toggleKind() {
    $('#actionRow').classList.toggle('hidden', kind !== 'action');
    $('#collRow').classList.toggle('hidden', kind !== 'collection');
    if (kind === 'collection' && selectedEl) refreshItem(); else clearOutlines();
  }

  // Dry-run the in-progress skill against the live page before saving.
  function testReadField(item, f) {
    let el = null;
    try { el = item.querySelector(f.rel); } catch {}
    if (!el && f.ariaSel) { try { el = item.querySelector(f.ariaSel); } catch {} }
    if (f.attr === 'click') return el ? '(click target found ✓)' : '(click target NOT found)';
    if (!el) return '(not found)';
    if (f.attr === 'href') return hrefOf(el) || '(no link)';
    if (f.attr === 'src') return imageUrlOf(el) || '(no image url)';
    if (f.attr === 'innerText') return fullText(el).slice(0, 200) || '(empty)';
    return norm(el.textContent).slice(0, 60);
  }
  function runTest() {
    const out = $('#testOut');
    if (!selectedEl) { out.textContent = 'Select an element first.'; return; }
    if (kind === 'collection') {
      let items = []; try { items = [...document.querySelectorAll(itemSelector)]; } catch {}
      if (!items.length) { out.textContent = `⚠ Matches 0 items. Pick a repeating post/row (aim for many matches).`; return; }
      if (!fields.length) { out.textContent = `Matches ${items.length} items, but you tagged 0 fields. Use “+ Tag a field”.`; return; }
      const sample = {};
      for (const f of fields) sample[f.name] = testReadField(items[0], f);
      const empties = Object.values(sample).filter((v) => !v || v === '(not found)').length;
      out.textContent = `Matches ${items.length} items.\nSample (1st item):\n` +
        Object.entries(sample).map(([k, v]) => `  ${k}: ${v || '—'}`).join('\n') +
        (empties ? `\n⚠ ${empties} field(s) empty — re-tag them inside a post.` : '\n✓ looks good.');
    } else {
      const el = document.querySelector((computeSelectors(selectedEl)[0] || {}).value || '*');
      out.textContent = el ? `✓ Found. Text: "${norm(el.textContent).slice(0, 60)}"` : '⚠ Not found with the top selector.';
    }
  }

  function teardown() {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    clearOutlines(); hi.remove(); frame.remove(); matchStyle.remove();
    window.__BA_LEARN = null;
  }

  // Drag the panel by its header (same-origin iframe + pointer capture).
  function makeDraggable() {
    const hd = idoc.querySelector('.hd');
    let start = null;
    hd.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.x')) return;   // ✕ stays a plain click
      const r = frame.getBoundingClientRect();
      frame.style.left = r.left + 'px'; frame.style.top = r.top + 'px';
      frame.style.right = 'auto'; frame.style.bottom = 'auto';
      start = { x: e.clientX, y: e.clientY };
      hd.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    hd.addEventListener('pointermove', (e) => {
      if (!start) return;
      const r = frame.getBoundingClientRect();
      // keep at least the header on screen so the panel can't be lost
      const left = Math.min(Math.max(r.left + (e.clientX - start.x), 44 - r.width), window.innerWidth - 44);
      const top = Math.min(Math.max(r.top + (e.clientY - start.y), 0), window.innerHeight - 44);
      frame.style.left = left + 'px'; frame.style.top = top + 'px';
    });
    hd.addEventListener('pointerup', () => { start = null; });
    hd.addEventListener('pointercancel', () => { start = null; });
  }

  function switchTab(next) {
    tab = next;
    clearOutlines();
    idoc.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.getAttribute('data-tab') === next));
    $('#tab-intro').classList.toggle('hidden', next !== 'intro');
    $('#tab-compose').classList.toggle('hidden', next !== 'compose');
    $('#tab-classic').classList.toggle('hidden', next !== 'classic');
    if (next === 'compose') renderCompose();
    if (next === 'intro') renderElemList();
  }

  frame.addEventListener('load', () => {
    idoc = frame.contentDocument;
    makeDraggable();
    idoc.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => switchTab(b.getAttribute('data-tab'))));

    // Introduce tab
    $('#itype').addEventListener('change', toggleIntroType);
    $('#irepoint').addEventListener('change', toggleRepointLock);
    $('#isave').addEventListener('click', saveElement);
    $('#isuggest').addEventListener('click', () => suggestName($('#iname'), iSel, false));

    // Compose tab
    $('#ssave').addEventListener('click', saveSkill);

    // Classic tab
    idoc.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener('change', (e) => { kind = e.target.value; toggleKind(); }));
    $('#addField').addEventListener('click', () => { capturingField = !capturingField; $('#addField').textContent = capturingField ? 'Now click the field element…' : '+ Tag a field (click one inside an item)'; });
    $('#save').addEventListener('click', runValidate);
    $('#confirmSave').addEventListener('click', confirmSave);
    $('#cancelSave').addEventListener('click', cancelSave);
    $('#test').addEventListener('click', runTest);
    $('#suggest').addEventListener('click', () => suggestName($('#name'), selectedEl, true));
    $('.x').addEventListener('click', teardown);

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    loadElements();
  });

  window.__BA_LEARN = { restart() {}, stop: teardown };
})();
