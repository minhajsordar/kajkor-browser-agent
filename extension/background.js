// Facebook Page Scraper - background service worker (MV3)
// Orchestrates: collect links -> open each page in a new tab ->
// extract info -> close tab -> aggregate -> POST to backend.

const BACKEND_URL = 'http://localhost:4000';
let running = false;

function setStatus(patch) {
  chrome.storage.local.get(['fps_status'], (res) => {
    const status = Object.assign(
      { running, phase: 'idle', total: 0, done: 0, message: '', results: [] },
      res.fps_status || {},
      patch
    );
    chrome.storage.local.set({ fps_status: status });
  });
}

// Wait until a tab finishes loading.
function waitForTabLoad(tabId, timeout = 30000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(finish, timeout);
  });
}

// Open url in a background tab, message the content script, return the full
// response object ({ ok, details, html, ... } or { ok:false, error }).
async function extractFromUrl(url, msgType, wait = 5000, extra = {}) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabLoad(tab.id);
    // Content script is auto-injected by manifest; give it a beat to attach.
    await new Promise((r) => setTimeout(r, 800));
    // Then let the content script wait for lazy sections to render.
    const res = await chrome.tabs.sendMessage(tab.id, { type: msgType, wait, ...extra });
    return res || { ok: false, error: 'no response' };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch {}
  }
}

// Open a page in a VISIBLE tab and run the chosen actions (follow and/or send
// message) in that single visit. Closes the tab afterward.
async function fbActions(url, actions) {
  const tab = await chrome.tabs.create({ url, active: true });
  try {
    await waitForTabLoad(tab.id);
    await new Promise((r) => setTimeout(r, 2000)); // let FB hydrate
    const res = await chrome.tabs.sendMessage(tab.id, {
      type: 'FB_ACTIONS',
      doFollow: !!actions.doFollow,
      doMessage: !!actions.doMessage,
      message: actions.message
    });
    // Give it a moment to settle, then close the tab.
    await new Promise((r) => setTimeout(r, 3000));
    try { await chrome.tabs.remove(tab.id); } catch {}
    return res || { ok: false, error: 'no response' };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// Send a failed page's HTML to the backend, which saves it under sample/debug/.
// Returns the saved relative path, or '' on failure.
async function saveDebugHtml(base, url, name, html) {
  try {
    const resp = await fetch(`${base}/debug-html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, name, html })
    });
    const data = await resp.json();
    return data?.ok ? data.file : '';
  } catch {
    return '';
  }
}

// POST a list of records to a backend store, returning a status suffix.
async function postToBackend(base, path, records) {
  try {
    const resp = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages: records })
    });
    const data = await resp.json();
    if (data?.ok) return ` Backend: +${data.added} new, ${data.updated} updated, ${data.total} total.`;
    return ' Backend rejected data.';
  } catch {
    return ' Backend unreachable (is the server running?).';
  }
}

// STEP 1: scroll the feed until `target` unique links are found -> /pages,
// then AUTO-continue into visiting those links (unless stopped).
async function runCollect(sourceTabId, options) {
  running = true;
  const target = options.target || 10;
  setStatus({ running: true, phase: 'collecting', done: 0, total: target, results: [], message: `Scrolling to collect ${target} unique page links...` });

  let links = [];
  try {
    const res = await chrome.tabs.sendMessage(sourceTabId, {
      type: 'COLLECT_LINKS',
      options: { target, delay: options.delay }
    });
    links = (res && res.ok && Array.isArray(res.links)) ? res.links : [];
  } catch (e) {
    setStatus({ running: false, phase: 'error', message: 'Could not read the Facebook tab: ' + (e?.message || e) });
    running = false;
    return;
  }

  const collected = links.map((l) => ({
    url: l.url,
    name: l.label || '',
    collectedAt: new Date().toISOString()
  }));
  const backendMsg = await postToBackend(options.backendUrl || BACKEND_URL, '/pages', collected);
  setStatus({ phase: 'collected', total: links.length, done: links.length, message: `Collected ${links.length} links.${backendMsg}` });

  if (!running) { // stopped during collect — leave visiting to the manual button
    setStatus({ running: false, phase: 'stopped', message: `Stopped. Collected ${links.length} links. Use "Visit & Get Details" to continue.` });
    return;
  }

  // Auto-continue into visiting the just-collected links.
  await runVisit(options, collected);
}

// URLs we should NOT visit again: already have details, or already checked and
// found to be a non-page. Prevents re-visiting the same links on later runs.
async function getVisitedSet(base) {
  const skip = new Set();
  try {
    const pd = await fetch(`${base}/page-details`).then((r) => r.json());
    (pd.pages || []).forEach((p) => skip.add(p.url)); // already scraped as a page
  } catch {}
  try {
    const pg = await fetch(`${base}/pages`).then((r) => r.json());
    (pg.pages || []).forEach((p) => { if (p.visited) skip.add(p.url); }); // already checked
  } catch {}
  return skip;
}

// STEP 2: visit each link (provided, or all stored in /pages), keep real Pages
// -> /page-details. Skips links already visited so nothing is re-scraped.
async function runVisit(options, providedLinks) {
  running = true;
  const base = options.backendUrl || BACKEND_URL;

  let links = providedLinks;
  if (!Array.isArray(links)) {
    setStatus({ running: true, phase: 'loading', done: 0, total: 0, results: [], message: 'Loading collected links from backend...' });
    try {
      const resp = await fetch(`${base}/pages`);
      const store = await resp.json();
      links = Array.isArray(store?.pages) ? store.pages : [];
    } catch (e) {
      setStatus({ running: false, phase: 'error', message: 'Could not load links from backend: ' + (e?.message || e) });
      running = false;
      return;
    }
  }

  // Drop links we've already visited (scraped or previously found non-page).
  const visited = await getVisitedSet(base);
  const already = links.filter((l) => visited.has(l.url)).length;
  links = links.filter((l) => !visited.has(l.url));

  if (!links || links.length === 0) {
    setStatus({ running: false, phase: 'done', message: already ? `Nothing new to visit (${already} already done).` : 'No links to visit. Run "Collect Links" first.' });
    running = false;
    return;
  }

  setStatus({ phase: 'visiting', total: links.length, done: 0, results: [], message: `Visiting ${links.length} new pages${already ? ` (${already} already done)` : ''}...` });
  const results = [];
  let skipped = 0;
  for (let i = 0; i < links.length; i++) {
    if (!running) break; // stopped
    const url = links[i].url;
    const res = await extractFromUrl(url, 'EXTRACT_PAGE_DETAILS', options.wait || 5000);
    const details = res && res.ok ? res.details : null;
    if (details && details.isPage) {
      details.listLabel = links[i].name || '';
      if (res.html) {
        const file = await saveDebugHtml(base, url, details.name, res.html);
        if (file) details.debugHtml = file;
      }
      results.push(details);
      await postToBackend(base, '/page-details', [details]); // incremental save
      await postToBackend(base, '/pages', [{ url, visited: true, isPage: true }]); // mark done
    } else {
      skipped++;
      await postToBackend(base, '/pages', [{ url, visited: true, isPage: false }]); // mark checked non-page
    }
    setStatus({ done: i + 1, total: links.length, results, message: `Visited ${i + 1}/${links.length} — ${results.length} pages, ${skipped} skipped` });
  }

  running = false;
  setStatus({ running: false, phase: 'done', results, message: `Done. Saved ${results.length} page details (${skipped} non-pages skipped${already ? `, ${already} already done` : ''}).` });
}

// ======================= Agent orchestrator ================================
// Plan-and-execute. The backend plans (NL -> JSON phases) and checks the target;
// this runs each phase as a deterministic browser tool. Every state change is
// persisted to the task doc via the backend, so a power cut can be resumed.

const AGENT = {}; // taskId -> { running, tabId }  (runtime only; DB is source of truth)

const jf = (url, opts) => fetch(url, opts).then((r) => r.json());
const getTask = (base, id) => jf(`${base}/tasks/${id}`).then((j) => (j.ok ? j.task : null));
const patchTask = (base, id, fields) =>
  jf(`${base}/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
const taskEvent = (base, id, kind, msg) =>
  jf(`${base}/tasks/${id}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, msg }) });
const taskError = (base, id, phase, message) =>
  jf(`${base}/tasks/${id}/error`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phase, message }) });
const planTask = (base, id) =>
  jf(`${base}/tasks/${id}/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });

// Tab ids currently claimed by OTHER running tasks, so parallel tasks don't
// drive the same tab.
function ownedByOthers(taskId) {
  const s = new Set();
  for (const [id, st] of Object.entries(AGENT)) {
    if (id !== taskId && st.running && st.tabId != null) s.add(st.tabId);
  }
  return s;
}

// The tab this task is acting on: the one navigate opened, else the active tab.
async function currentTab(taskId) {
  const st = AGENT[taskId] || {};
  if (st.tabId != null) {
    try { const t = await chrome.tabs.get(st.tabId); if (t) return st.tabId; } catch {}
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) return tab.id;
  throw new Error('No page to act on — add a navigate phase first.');
}

// Find (or open) a Facebook feed tab for this task.
async function ensureFacebookTab(taskId) {
  const st = AGENT[taskId] || {};
  if (st.tabId != null) {
    try { const t = await chrome.tabs.get(st.tabId); if (t && /facebook\.com/.test(t.url || '')) return st.tabId; } catch {}
  }
  const others = ownedByOthers(taskId);
  const tabs = await chrome.tabs.query({ url: '*://*.facebook.com/*' });
  const free = tabs.find((t) => !others.has(t.id));
  if (free) { AGENT[taskId] = { ...st, tabId: free.id }; return free.id; }
  const created = await chrome.tabs.create({ url: 'https://www.facebook.com', active: true });
  await waitForTabLoad(created.id);
  await new Promise((r) => setTimeout(r, 1500));
  AGENT[taskId] = { ...st, tabId: created.id };
  return created.id;
}

// Merge collected links into the task doc (dedup by url), persisted immediately.
async function mergeCollected(base, taskId, items) {
  const t = await getTask(base, taskId);
  const map = new Map((t?.collected || []).map((c) => [c.url, c]));
  for (const it of items) if (it && it.url) map.set(it.url, { ...map.get(it.url), ...it });
  await patchTask(base, taskId, { collected: [...map.values()] });
}

// Project a collected/extracted object onto a schema's fields, then tag it with
// provenance so the backend can dedup + scope by task.
function schemaRecord(fields, obj, taskId) {
  const rec = {};
  for (const f of fields) rec[f.key] = obj[f.key] ?? '';
  // Records without a source URL (e.g. skill-collected posts) dedup on their
  // own field signature so re-runs update rather than duplicate.
  rec._sourceUrl = obj.url || ('sig:' + JSON.stringify(Object.values(rec)).slice(0, 160));
  rec._taskId = taskId;
  rec._collectedAt = new Date().toISOString();
  return rec;
}

// Write objects into every schema the task selected (its own collection each).
async function saveToSchemas(base, taskId, schemas, objs) {
  for (const s of (schemas || [])) {
    const records = objs.map((o) => schemaRecord(s.fields, o, taskId));
    await jf(`${base}/schemas/${s.schemaId}/records`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records }),
    });
  }
}

// Look up a learned skill by name for a host (via the backend).
async function findSkill(base, host, name) {
  const j = await jf(`${base}/skills?host=${encodeURIComponent(host)}`);
  return (j?.skills || []).find((s) => s.name === name) || null;
}

const hostOfTab = (t) => { try { return new URL(t.url).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Merge arbitrary field-object records into task.collected (dedup by signature).
async function mergeRecords(base, taskId, records) {
  const t = await getTask(base, taskId);
  const list = t?.collected || [];
  const seen = new Set(list.map((r) => JSON.stringify(Object.values(r))));
  for (const r of records) {
    const k = JSON.stringify(Object.values(r));
    if (!seen.has(k)) { list.push(r); seen.add(k); }
  }
  await patchTask(base, taskId, { collected: list });
}

// Mark one url as extracted in the task doc (incremental for crash-safety).
async function addExtracted(base, taskId, url) {
  const t = await getTask(base, taskId);
  const set = new Set(t?.extracted || []);
  set.add(url);
  await patchTask(base, taskId, { extracted: [...set] });
}

// Message a tab's content script, injecting content.js first if it isn't there
// (e.g. a tab that was open before the extension was reloaded, or reused by
// navigate). Retries once after injecting.
async function msgTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    if (!/Receiving end does not exist|Could not establish connection/i.test(e?.message || '')) throw e;
    try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }); } catch {}
    await new Promise((r) => setTimeout(r, 400));
    return await chrome.tabs.sendMessage(tabId, message);
  }
}

// Tool implementations. Names MUST match the backend TOOL_CATALOG.
async function runTool(base, taskId, phase) {
  const p = phase.params || {};

  if (phase.tool === 'navigate') {
    const url = p.url || 'https://www.facebook.com';
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}

    // Reuse an already-open tab on the same site (e.g. the Facebook tab the user
    // already has open) UNLESS the user explicitly asked for a new tab.
    let tab = null;
    if (!p.newTab && host) {
      const others = ownedByOthers(taskId);
      const tabs = await chrome.tabs.query({});
      tab = tabs.find((t) => { try { return new URL(t.url).hostname.replace(/^www\./, '') === host && !others.has(t.id); } catch { return false; } });
    }
    if (tab) {
      await chrome.tabs.update(tab.id, { active: true });
      await taskEvent(base, taskId, 'obs', `Using existing ${host} tab (no new tab opened).`);
    } else {
      tab = await chrome.tabs.create({ url, active: true });
      await waitForTabLoad(tab.id);
      await new Promise((r) => setTimeout(r, 1500));
      await taskEvent(base, taskId, 'obs', `Opened ${url}`);
    }
    AGENT[taskId] = { ...(AGENT[taskId] || {}), tabId: tab.id };
    return;
  }

  if (phase.tool === 'scroll') {
    const tabId = await currentTab(taskId);
    const res = await msgTab(tabId, { type: 'SCROLL_PAGE', times: p.times || 10, delay: p.delay || 1200, direction: p.direction || 'vertical' });
    const did = (res && res.ok) ? res.scrolled : 0;
    const t = await getTask(base, taskId);
    await patchTask(base, taskId, { scrolls: (t?.scrolls || 0) + did });
    await taskEvent(base, taskId, 'obs', `Scrolled ${did} times.`);
    return;
  }

  if (phase.tool === 'click' || phase.tool === 'hover') {
    const tabId = await currentTab(taskId);
    const res = await msgTab(tabId, {
      type: phase.tool === 'click' ? 'CLICK_ELEMENT' : 'HOVER_ELEMENT',
      selector: p.selector || '', text: p.text || '',
    });
    const t = await getTask(base, taskId);
    await patchTask(base, taskId, { actions: (t?.actions || 0) + 1 });
    const okMsg = res && res.ok ? `${phase.tool}ed ${res.matched || (p.selector || p.text)}` : `${phase.tool} failed: ${(res && res.error) || 'not found'}`;
    await taskEvent(base, taskId, res && res.ok ? 'obs' : 'err', okMsg);
    if (res && !res.ok) throw new Error(okMsg);
    return;
  }

  if (phase.tool === 'type') {
    const tabId = await currentTab(taskId);
    const t = await getTask(base, taskId);
    // Models emit placeholders like "<generated text>" — substitute the text
    // the generate_text phase produced (also used when value is omitted).
    let value = p.value || '';
    if (t?.generatedText && (!value || /^\s*<[^>]*>\s*$/.test(value) || /\bgenerated\s+(text|post|content)\b/i.test(value))) {
      value = t.generatedText;
    }
    const res = await msgTab(tabId, { type: 'TYPE_TEXT', selector: p.selector || '', text: p.text || '', value });
    await patchTask(base, taskId, { actions: (t?.actions || 0) + 1 });
    const okMsg = res && res.ok ? `Typed into ${res.matched || 'field'}: "${String(value).slice(0, 60)}"` : `type failed: ${(res && res.error) || 'no field'}`;
    await taskEvent(base, taskId, res && res.ok ? 'obs' : 'err', okMsg);
    if (res && !res.ok) throw new Error(okMsg);
    return;
  }

  if (phase.tool === 'generate_text') {
    const t = await getTask(base, taskId);
    const prompt = p.prompt || t.goal;
    // Hand the latest found/collected post text to the model as source
    // material, so "regenerate the found post" actually sees the post.
    const last = (t.collected || [])[(t.collected || []).length - 1] || null;
    const context = last ? String(last.text || last._sourceText || '').slice(0, 4000) : '';
    await taskEvent(base, taskId, 'think', `Generating text: ${String(prompt).slice(0, 80)}…${context ? ' (using the found post as source)' : ''}`);
    const gen = await jf(`${base}/ai/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: t.model, prompt, words: p.words, context }),
    }).catch(() => null);
    const text = gen && gen.ok ? gen.text : '';
    if (!text) throw new Error(`generate_text failed: ${(gen && gen.error) || 'no text produced'}`);
    await taskEvent(base, taskId, 'obs', `Generated ${text.length} chars: "${text.slice(0, 80)}${text.length > 80 ? '…' : ''}"`);
    await patchTask(base, taskId, { generatedText: text, actions: (t?.actions || 0) + 1 });
    const tabId = await currentTab(taskId);
    const res = await msgTab(tabId, { type: 'TYPE_TEXT', selector: p.selector || '', text: p.text || '', value: text });
    if (res && res.ok) { await taskEvent(base, taskId, 'obs', `Wrote generated text into ${res.matched || 'field'}.`); return; }
    // No editable field yet — common when the composer opens in a LATER click
    // phase. If a later type phase will paste the text, defer instead of failing.
    const idx = t.currentPhaseIndex || 0;
    const laterTyper = (t.plan?.phases || []).slice(idx + 1).some((ph) => ph.tool === 'type');
    if (laterTyper) {
      await taskEvent(base, taskId, 'obs', 'No editable field open yet — generated text saved for the later type phase.');
      return;
    }
    const okMsg = `type failed: ${(res && res.error) || 'no field'}`;
    await taskEvent(base, taskId, 'err', okMsg);
    throw new Error(okMsg);
  }

  if (phase.tool === 'scroll_and_collect_links') {
    const tabId = await ensureFacebookTab(taskId);
    const res = await msgTab(tabId, { type: 'COLLECT_LINKS', options: { target: p.target || 10, delay: p.delay || 1200 } });
    const links = (res && res.ok && Array.isArray(res.links)) ? res.links : [];
    const collected = links.map((l) => ({ url: l.url, name: l.label || '', collectedAt: new Date().toISOString() }));
    if (collected.length) await postToBackend(base, '/pages', collected);
    await mergeCollected(base, taskId, collected);
    const t = await getTask(base, taskId);
    if (t?.schemas?.length && collected.length) await saveToSchemas(base, taskId, t.schemas, collected);
    await taskEvent(base, taskId, 'obs', `Collected ${links.length} links.`);
    return;
  }

  if (phase.tool === 'visit_and_extract_details') {
    const t = await getTask(base, taskId);
    const collected = t?.collected || [];
    const done = new Set(t?.extracted || []);
    let n = 0;
    for (const item of collected) {
      if (!AGENT[taskId]?.running) break;
      if (done.has(item.url)) continue;
      const r = await extractFromUrl(item.url, 'EXTRACT_PAGE_DETAILS', 5000);
      const details = r && r.ok ? r.details : null;
      if (details && details.isPage) {
        details.listLabel = item.name || '';
        if (r.html) { const f = await saveDebugHtml(base, item.url, details.name, r.html); if (f) details.debugHtml = f; }
        await postToBackend(base, '/page-details', [details]);
        await postToBackend(base, '/pages', [{ url: item.url, visited: true, isPage: true }]);
        if (t?.schemas?.length) await saveToSchemas(base, taskId, t.schemas, [details]);
      } else {
        await postToBackend(base, '/pages', [{ url: item.url, visited: true, isPage: false }]);
      }
      await addExtracted(base, taskId, item.url);
      done.add(item.url); n++;
      await taskEvent(base, taskId, 'obs', `Extracted ${n}: ${item.name || item.url}`);
    }
    return;
  }

  if (phase.tool === 'use_skill') {
    const tabId = await currentTab(taskId);
    const tab = await chrome.tabs.get(tabId);
    const skill = await findSkill(base, hostOfTab(tab), p.skill);
    if (!skill) throw new Error(`No skill "${p.skill}" for ${hostOfTab(tab)}`);
    const res = await msgTab(tabId, { type: 'USE_SKILL', skill });
    await taskEvent(base, taskId, 'obs', `Ran skill "${p.skill}" (${skill.action || 'click'}): ${res && res.ok ? 'ok' : (res && res.error) || 'failed'}`);
    if (res && res.value != null) await taskEvent(base, taskId, 'obs', `Read: ${String(res.value).slice(0, 100)}`);
    return;
  }

  if (phase.tool === 'collect_by_skill') {
    const tabId = await currentTab(taskId);
    const tab = await chrome.tabs.get(tabId);
    const skill = await findSkill(base, hostOfTab(tab), p.skill);
    if (!skill || skill.kind !== 'collection') throw new Error(`No collection skill "${p.skill}" for ${hostOfTab(tab)}`);
    // First pass of the task: start from the top of the feed, dropping any
    // scroll position / collected-marks a previous task left in this tab.
    const t0 = await getTask(base, taskId);
    if (!(t0?.collected || []).length && !Number(t0?.repeats)) {
      await msgTab(tabId, { type: 'RESET_SCAN', y: 0 });
      await taskEvent(base, taskId, 'obs', 'Scrolled to the top of the feed — collecting from the first post.');
    }
    const res = await msgTab(tabId, { type: 'COLLECT_BY_SKILL', skill, target: p.target || 20, delay: p.delay || 1200, fields: p.fields || null });
    const records = (res && res.ok && Array.isArray(res.records)) ? res.records : [];
    // Keep saved data clean; keep the item HTML separately for debugging.
    const clean = records.map((r) => { const { _html, ...d } = r; return d; }); // keep _sourceText for ai_verify
    const debug = records.map((r, i) => { const { _html, _sourceText, ...d } = r; return { index: i, html: r._html || '', text: r._sourceText || '', data: d }; });
    await mergeRecords(base, taskId, clean);
    const t = await getTask(base, taskId);
    if (t?.schemas?.length && clean.length) await saveToSchemas(base, taskId, t.schemas, clean);
    await jf(`${base}/tasks/${taskId}/debug-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: debug }) });
    await taskEvent(base, taskId, 'obs', `Collected ${clean.length} records via skill "${p.skill}".`);
    return;
  }

  if (phase.tool === 'collect_text') {
    const tabId = await currentTab(taskId);
    const t0 = await getTask(base, taskId);
    if (!(t0?.collected || []).length && !Number(t0?.repeats)) {
      await msgTab(tabId, { type: 'RESET_SCAN', y: 0 });
      await taskEvent(base, taskId, 'obs', 'Scrolled to the top of the feed — collecting from the first post.');
    }
    const res = await msgTab(tabId, {
      type: 'COLLECT_TEXT', selector: p.selector || '[role="article"]', target: p.target || 20, delay: p.delay || 1200,
    });
    const records = (res && res.ok && Array.isArray(res.records)) ? res.records : [];
    const clean = records.map((r) => ({ text: r.text, url: r.url }));
    const debug = records.map((r, i) => ({ index: i, html: r._html || '', text: r.text || '', data: { text: r.text } }));
    await mergeRecords(base, taskId, clean);
    const t = await getTask(base, taskId);
    if (t?.schemas?.length && clean.length) await saveToSchemas(base, taskId, t.schemas, clean);
    await jf(`${base}/tasks/${taskId}/debug-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: debug }) });
    await taskEvent(base, taskId, 'obs', `Collected full text of ${clean.length} element(s).`);
    return;
  }

  if (phase.tool === 'find_post') {
    const tabId = await currentTab(taskId);
    const t0 = await getTask(base, taskId);
    const query = p.query || t0?.goal || '';
    const target = Number(p.target) || 1;
    const maxPosts = Number(p.maxPosts) || 40;   // per pass; the repeat loop can extend
    let found = (t0?.collected || []).length;    // resume-safe: matches already saved
    let checked = 0;
    // A NEW task starts scanning from the TOP of the feed (the tab may be left
    // scrolled by a previous task); a resumed/repeated task restores its saved
    // scroll offset and continues from there. Both clear stale marks left in
    // the tab by earlier tasks.
    const startY = Number(t0?.scanY) || 0;
    await msgTab(tabId, { type: 'RESET_SCAN', y: startY });
    await taskEvent(base, taskId, 'obs', startY
      ? `Resuming scan from saved scroll position (${startY}px).`
      : 'Scrolled to the top of the feed — scanning from the first post.');
    await taskEvent(base, taskId, 'act', `Scanning posts one by one for: "${query}"…`);
    while (found < target && checked < maxPosts) {
      if (!AGENT[taskId]?.running) break;
      const r = await msgTab(tabId, { type: 'SCAN_NEXT_POST' });
      if (!r || !r.ok) throw new Error((r && r.error) || 'post scan failed');
      if (r.y != null) await patchTask(base, taskId, { scanY: r.y }); // persist progress
      if (r.noMore) { await taskEvent(base, taskId, 'obs', 'No more posts to scan on this page.'); break; }
      checked++;
      const post = r.post || {};
      const preview = (post.text || '').slice(0, 70).replace(/\s+/g, ' ');
      const m = await jf(`${base}/ai/match-post`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: t0.model, query, text: post.text }),
      }).catch(() => null);
      if (m && m.ok === false && m.error) throw new Error(m.error);
      if (m && m.match) {
        found++;
        const rec = { text: (post.text || '').slice(0, 4000), url: post.url || '', match_reason: m.reason || '' };
        await mergeRecords(base, taskId, [rec]);
        const t = await getTask(base, taskId);
        if (t?.schemas?.length) await saveToSchemas(base, taskId, t.schemas, [rec]);
        await taskEvent(base, taskId, 'ok', `Post ${checked} MATCHES (${found}/${target}): ${preview}…`);
      } else {
        await taskEvent(base, taskId, 'obs', `Post ${checked}: no match — ${preview}…`);
      }
    }
    await taskEvent(base, taskId, 'obs', `Scanned ${checked} post(s) this pass, found ${found}/${target}.`);
    return;
  }

  if (phase.tool === 'ai_verify') {
    const t = await getTask(base, taskId);
    const records = t?.collected || [];
    if (!records.length) { await taskEvent(base, taskId, 'obs', 'AI verify: no records to check.'); return; }
    const source = p.source || pickSourceField(records);
    if (!source) { await taskEvent(base, taskId, 'obs', 'AI verify skipped: no source-text field found.'); return; }
    // Target the schema's DATA columns: verify the ones that were scraped AND
    // extract the derived/empty ones (e.g. reaction_count) from the source text.
    const schemaKeys = (t.schemas || []).flatMap((s) => s.fields.map((f) => f.key));
    const fields = (Array.isArray(p.fields) && p.fields.length) ? p.fields
      : (schemaKeys.length ? schemaKeys.filter((k) => k !== source) : null);
    const instruction = p.instruction || t.goal;
    await taskEvent(base, taskId, 'obs', `AI verifying ${records.length} record(s) against "${source}"${fields ? ` → ${fields.join(', ')}` : ''}…`);
    let checked = 0, fixed = 0;
    for (const rec of records) {
      if (!AGENT[taskId]?.running) break;
      if (rec._verified) { checked++; continue; }
      if (fields) for (const k of fields) if (!(k in rec)) rec[k] = ''; // seed empties so AI extracts them
      const r = await jf(`${base}/ai/verify-record`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: t.model, instruction, source, fields, record: rec }),
      }).catch(() => null);
      checked++;
      if (r && r.ok && r.corrected) {
        Object.assign(rec, r.corrected);
        rec._verified = true;
        if (r.changed) fixed++;
        await patchTask(base, taskId, { collected: records }); // incremental, crash-safe
      }
      if (checked % 3 === 0) await taskEvent(base, taskId, 'obs', `AI verified ${checked}/${records.length} (${fixed} corrected)…`);
    }
    // Re-save corrected values into the task's schema collection(s).
    const tt = await getTask(base, taskId);
    if (tt?.schemas?.length) {
      const clean = records.map((r) => { const { _verified, ...d } = r; return d; });
      await saveToSchemas(base, taskId, tt.schemas, clean);
    }
    await taskEvent(base, taskId, 'ok', `AI verify done: checked ${checked}, corrected ${fixed}.`);
    return;
  }

  throw new Error('Unknown tool: ' + phase.tool);
}

// Pick the record field holding the full source text: an obviously-named one, else
// the field with the longest average text across a sample.
function pickSourceField(records) {
  // collect_by_skill attaches the whole item text here — always the best source.
  if (records.some((r) => r._sourceText)) return '_sourceText';
  const sample = records.slice(0, 5);
  const keys = new Set();
  for (const r of sample) for (const k of Object.keys(r)) if (!k.startsWith('_')) keys.add(k);
  const named = [...keys].find((k) => /full|inner|source|raw|all.?text|^text$/i.test(k));
  if (named) return named;
  let best = null, bestLen = 0;
  for (const k of keys) {
    const len = sample.reduce((s, r) => s + String(r[k] ?? '').length, 0) / (sample.length || 1);
    if (len > bestLen) { bestLen = len; best = k; }
  }
  return bestLen > 40 ? best : null; // need a genuinely long text field to verify against
}

// Execute remaining phases, then check the target -> done / repeat / error.
async function executeLoop(base, taskId) {
  while (true) {
    if (!AGENT[taskId]?.running) return;
    let task = await getTask(base, taskId);
    if (!task || !task.plan) return;

    for (let i = task.currentPhaseIndex || 0; i < task.plan.phases.length; i++) {
      if (!AGENT[taskId]?.running) {
        await patchTask(base, taskId, { status: 'stopped' });
        await taskEvent(base, taskId, 'err', 'Stopped by user.');
        return;
      }
      const phase = task.plan.phases[i];
      await taskEvent(base, taskId, 'act', `Phase ${i + 1}/${task.plan.phases.length}: ${phase.tool}`);
      try {
        await runTool(base, taskId, phase);
      } catch (e) {
        await taskError(base, taskId, phase.tool, e?.message || String(e));
        await patchTask(base, taskId, { status: 'error' });
        await taskEvent(base, taskId, 'err', `${phase.tool} failed: ${e?.message || e}`);
        return; // stop on any error, per design
      }
      await patchTask(base, taskId, { currentPhaseIndex: i + 1 });
    }

    // All phases ran — check whether the target is fulfilled.
    await patchTask(base, taskId, { status: 'checking' });
    task = await getTask(base, taskId);
    const { metric, count } = task.plan.target;
    const have = metric === 'details' ? (task.extracted?.length || 0)
      : metric === 'scrolls' ? (task.scrolls || 0)
      : metric === 'actions' ? (task.actions || 0)
      : (task.collected?.length || 0);
    await taskEvent(base, taskId, 'obs', `Target check: ${have}/${count} ${metric}.`);

    // An ACTION plan that ran every phase without error IS the job done —
    // repeating it would re-click/re-type (e.g. post the same text twice).
    if (metric === 'actions' || have >= count) {
      await patchTask(base, taskId, { status: 'done', finishedAt: new Date().toISOString() });
      await taskEvent(base, taskId, 'ok', `Task complete: ${have >= count ? `${have}/${count} ${metric}` : `all ${task.plan.phases.length} phases ran`}.`);
      return;
    }

    const repeats = (task.repeats || 0) + 1;
    if (repeats > (task.maxRepeats || 3)) {
      await patchTask(base, taskId, { status: 'done', repeats, finishedAt: new Date().toISOString() });
      await taskEvent(base, taskId, 'obs', `Stopped after ${task.maxRepeats || 3} repeats: ${have}/${count} ${metric}.`);
      return;
    }
    // Not met -> repeat the plan from the top.
    await patchTask(base, taskId, { status: 'running', repeats, currentPhaseIndex: 0 });
    await taskEvent(base, taskId, 'think', `Target not met (${have}/${count}). Repeat ${repeats}.`);
  }
}

// Entry point: plan if needed (or resume), then run the execute loop.
async function runAgentTask(taskId, base = BACKEND_URL) {
  if (AGENT[taskId]?.running) return;
  AGENT[taskId] = { ...(AGENT[taskId] || {}), running: true };
  try {
    const task = await getTask(base, taskId);
    if (!task) { AGENT[taskId].running = false; return; }

    if (!task.plan) {
      await taskEvent(base, taskId, 'think', `Planning with ${task.model}…`);
      const p = await planTask(base, taskId);
      if (!p.ok) { await taskEvent(base, taskId, 'err', 'Planning failed: ' + (p.error || '')); AGENT[taskId].running = false; return; }
      await taskEvent(base, taskId, 'act', 'Executing plan…');
    } else if (['error', 'stopped', 'done'].includes(task.status)) {
      // Manual resume of a finished/failed task — continue from where it stopped.
      await patchTask(base, taskId, { status: 'running' });
      await taskEvent(base, taskId, 'think', 'Resuming task.');
    }

    await executeLoop(base, taskId);
  } catch (e) {
    await taskError(base, taskId, '', e?.message || String(e));
    await patchTask(base, taskId, { status: 'error' });
    await taskEvent(base, taskId, 'err', 'Fatal: ' + (e?.message || e));
  } finally {
    if (AGENT[taskId]) AGENT[taskId].running = false;
  }
}

// After a restart/power cut — OR after the MV3 service worker was torn down
// mid-task — re-drive any task the DB still shows as in-flight whose in-memory
// loop is gone. Returns how many tasks are (or should be) actively running.
async function resumeUnfinished(base = BACKEND_URL) {
  let active = 0;
  try {
    const j = await jf(`${base}/tasks`);
    for (const t of (j?.tasks || [])) {
      if (['running', 'checking', 'planning'].includes(t.status)) {
        active++;
        if (!AGENT[t.taskId]?.running) runAgentTask(t.taskId); // orphaned -> revive
      }
    }
  } catch {}
  if (active) startKeepAlive(); else stopKeepAlive();
  return active;
}
chrome.runtime.onStartup.addListener(() => resumeUnfinished());

// --- keepalive -------------------------------------------------------------
// MV3 kills idle service workers (~30s), which would freeze a long-running task
// and lose AGENT state. An alarm wakes the worker every ~24s; each wake re-drives
// any orphaned running task, so tasks survive worker teardown. Alarm auto-stops
// when nothing is running.
function startKeepAlive() { chrome.alarms.create('ba-keepalive', { periodInMinutes: 0.4 }); }
function stopKeepAlive() { chrome.alarms.clear('ba-keepalive'); }
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'ba-keepalive') resumeUnfinished(); });

// Every time the worker spins up (startup, reload, wake), revive orphaned tasks.
resumeUnfinished();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'START_COLLECT') {
        if (running) { sendResponse({ ok: false, error: 'Already running' }); return; }
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !/facebook\.com/.test(tab.url || '')) {
          sendResponse({ ok: false, error: 'Open a Facebook tab first' });
          return;
        }
        sendResponse({ ok: true });
        runCollect(tab.id, msg.options || {});
      } else if (msg?.type === 'START_VISIT') {
        if (running) { sendResponse({ ok: false, error: 'Already running' }); return; }
        sendResponse({ ok: true });
        runVisit(msg.options || {});
      } else if (msg?.type === 'FB_ACTIONS') {
        const res = await fbActions(msg.url, {
          doFollow: !!msg.doFollow,
          doMessage: !!msg.doMessage,
          message: msg.message
        });
        sendResponse(res);
      } else if (msg?.type === 'START_AGENT_TASK') {
        startKeepAlive();
        sendResponse({ ok: true });
        runAgentTask(msg.taskId);
      } else if (msg?.type === 'STOP_AGENT_TASK') {
        // Flip the in-memory flag AND force the DB to 'stopped' — the latter is
        // what actually cancels a task whose worker (and AGENT entry) was torn
        // down, and it stops resumeUnfinished from reviving it.
        if (AGENT[msg.taskId]) AGENT[msg.taskId].running = false;
        try {
          await patchTask(BACKEND_URL, msg.taskId, { status: 'stopped', finishedAt: new Date().toISOString() });
          await taskEvent(BACKEND_URL, msg.taskId, 'err', 'Stopped by user.');
        } catch {}
        sendResponse({ ok: true });
      } else if (msg?.type === 'START_LEARN') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || /^(chrome|edge|about|chrome-extension):/.test(tab.url || '')) {
          sendResponse({ ok: false, error: 'Open a normal web page first.' });
          return;
        }
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['learn.js'] });
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: e?.message || 'Injection failed' });
        }
      } else if (msg?.type === 'RESUME_TASKS') {
        resumeUnfinished();
        sendResponse({ ok: true });
      } else if (msg?.type === 'STOP_SCRAPE') {
        running = false;
        setStatus({ running: false, phase: 'stopped', message: 'Stopped by user.' });
        sendResponse({ ok: true });
      } else if (msg?.type === 'GET_STATUS') {
        const { fps_status } = await chrome.storage.local.get('fps_status');
        sendResponse({ ok: true, status: fps_status || null });
      } else {
        sendResponse({ ok: false, error: 'UNKNOWN_MESSAGE' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();
  return true;
});
