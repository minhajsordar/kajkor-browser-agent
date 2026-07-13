// Browser Agent — learning overlay (injected on demand by the background).
// Point-and-click teaching: highlight on hover, click to select an element,
// then save it as a reusable "skill". Selectors are computed DETERMINISTICALLY
// from stable anchors (aria-label / role / text / href / data-*).
//
// The control panel lives in an IFRAME (not a shadow root) so keystrokes typed
// into its inputs never reach the host page's keyboard-shortcut handlers —
// otherwise sites like Facebook swallow characters.

(() => {
  if (window.__BA_LEARN) { window.__BA_LEARN.restart(); return; }

  const BACKEND = 'http://localhost:4000';
  const host = location.hostname.replace(/^www\./, '');
  const firstSeg = location.pathname.split('/').filter(Boolean)[0];
  const defaultPattern = `${host}/${firstSeg ? firstSeg + '/*' : '*'}`;

  const cssEsc = (v) => String(v).replace(/["\\]/g, '\\$&');
  const cssId = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : v);
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
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
  // dynamic (contains a name/free text, e.g. "React with Like to <NAME>'s post"
  // or an author name on an avatar). Action labels keep only their stable prefix.
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
    // 1) common repeating roles (Facebook posts are role="article").
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
  frame.style.cssText = 'position:fixed;right:16px;bottom:16px;width:340px;height:520px;max-height:92vh;border:none;border-radius:12px;box-shadow:0 12px 44px rgba(0,0,0,.5);z-index:2147483647;background:transparent;';
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>
    :root{color-scheme:dark}
    *{box-sizing:border-box}
    body{margin:0;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#16181f;color:#e7e9ee;border:1px solid #2a2f3a;border-radius:12px;overflow:hidden}
    .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#1d2029;border-bottom:1px solid #2a2f3a;font-weight:600}
    .hd .host{color:#8b90a0;font-weight:400;font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .hd .x{cursor:pointer;background:none;border:none;color:#8b90a0;font-size:15px}
    .body{padding:12px;max-height:calc(92vh - 44px);overflow:auto}
    .hint{color:#8b90a0}
    .preview{font:11px ui-monospace,monospace;background:#0e0f13;border:1px solid #2a2f3a;border-radius:7px;padding:7px;margin-bottom:10px;word-break:break-word;max-height:70px;overflow:auto}
    label{display:block;font-size:12px;color:#c7ccd8;margin:8px 0 4px}
    input,select{width:100%;padding:6px 8px;background:#1d2029;color:#e7e9ee;border:1px solid #2a2f3a;border-radius:7px;font:inherit}
    input:focus,select:focus{outline:none;border-color:#6d8bff}
    .row-inline{display:flex;gap:6px;align-items:flex-end}
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
  </style></head><body>
    <div class="hd">🎓 Learning <span class="host">${host}</span><button class="x" title="Exit">✕</button></div>
    <div class="body">
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
  </body></html>`;
  document.documentElement.appendChild(frame);

  // ---- session state ----
  let idoc = null;
  let selectedEl = null, kind = 'action', itemSelector = null, fields = [], capturingField = false, hoverEl = null;
  const outlined = [];
  const $ = (s) => idoc.querySelector(s);
  const clearOutlines = () => { outlined.forEach((el) => el.classList.remove('__ba_match')); outlined.length = 0; };

  function onMove(e) {
    if (e.target === frame) { hi.style.display = 'none'; return; }
    hoverEl = e.target;
    const r = e.target.getBoundingClientRect();
    hi.style.display = 'block'; hi.style.left = r.left + 'px'; hi.style.top = r.top + 'px'; hi.style.width = r.width + 'px'; hi.style.height = r.height + 'px';
  }
  function onClick(e) {
    if (e.target === frame) return;      // clicks inside the panel never reach here anyway
    e.preventDefault(); e.stopImmediatePropagation();
    const el = hoverEl || e.target;
    if (capturingField) { addField(el); return; }
    selectElement(el);
  }

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
    // <img> is plain HTML, <image> is the SVG image tag — both hold picture URLs.
    // A wrapper (e.g. div/span) is often what's actually clickable, so if the
    // clicked element has no text of its own but contains an image, treat it as src.
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
      // Save the tagged item's HTML so selectors can be debugged later.
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
  async function suggestName() {
    if (!selectedEl) return;
    let model = ''; try { model = (await new Promise((r) => chrome.storage.local.get(['ba_model'], (o) => r(o.ba_model)))) || ''; } catch {}
    if (!model) { $('#msg').textContent = 'No model set (pick one in the popup).'; return; }
    $('#msg').textContent = 'Thinking…';
    try {
      const r = await fetch(`${BACKEND}/skills/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature: signatureOf(selectedEl), model }) }).then((x) => x.json());
      if (r.ok && r.name) { $('#name').value = r.name; if (r.kind === 'action' || r.kind === 'collection') { kind = r.kind; $(`input[value="${kind}"]`).checked = true; toggleKind(); } $('#msg').textContent = ''; }
      else $('#msg').textContent = r.error || 'No suggestion.';
    } catch { $('#msg').textContent = 'Suggest failed.'; }
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

  frame.addEventListener('load', () => {
    idoc = frame.contentDocument;
    idoc.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener('change', (e) => { kind = e.target.value; toggleKind(); }));
    $('#addField').addEventListener('click', () => { capturingField = !capturingField; $('#addField').textContent = capturingField ? 'Now click the field element…' : '+ Tag a field (click one inside an item)'; });
    $('#save').addEventListener('click', runValidate);
    $('#confirmSave').addEventListener('click', confirmSave);
    $('#cancelSave').addEventListener('click', cancelSave);
    $('#test').addEventListener('click', runTest);
    $('#suggest').addEventListener('click', suggestName);
    $('.x').addEventListener('click', teardown);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
  });

  window.__BA_LEARN = { restart() {}, stop: teardown };
})();
