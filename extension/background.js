// Facebook Page Scraper - background service worker (MV3)
// Orchestrates: collect links -> open each page in a new tab ->
// extract info -> close tab -> aggregate -> POST to backend.

const BACKEND_URL = 'http://localhost:34730';
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

// Open a URL in a BACKGROUND tab, run one content-script message against it,
// then always close the tab. Used by read_pages to visit result links.
async function readUrl(url, message, { settle = 2500, timeout = 30000 } = {}) {
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await waitForTabLoad(tab.id, timeout);
    await new Promise((r) => setTimeout(r, settle)); // let client-rendered text land
    return (await msgTab(tab.id, message)) || { ok: false, error: 'no response' };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    if (tab) { try { await chrome.tabs.remove(tab.id); } catch {} }
  }
}

// ======================= Agent orchestrator ================================
// Plan-and-execute. The backend plans (NL -> JSON phases) and checks the target;
// this runs each phase as a deterministic browser tool. Every state change is
// persisted to the task doc via the backend, so a power cut can be resumed.

const AGENT = {}; // taskId -> { running, tabId }  (runtime only; DB is source of truth)
// Clicks that put something live — these get verified, never assumed.
const PUBLISH_WORD = /\b(post|publish|share|tweet|send|submit)\b/i;
// taskId -> true when the next successful click came out of a recovery, and is
// therefore worth offering to save as a learned element.
const LEARN = {};

// Run generated JS on the page and bring back its return value.
//
// Vehicle: chrome.scripting into the MAIN world. The snippet is compiled with
// `new Function` INSIDE the page's realm, so a strict page CSP can refuse it —
// that failure is reported plainly rather than silently swallowed. (The clean
// upgrade is chrome.userScripts, which ignores page CSP but needs the user to
// switch on "Allow user scripts".)
//
// Read-only is enforced HERE, not just asked for in the prompt: the helpers
// expose no mutators and the page-modifying APIs are shadowed inside the
// snippet's scope.
async function runPageCode(tabId, code, timeoutMs = 20000) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [String(code), Number(timeoutMs)],
    func: (src, limit) => {
      const t0 = Date.now();
      const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
      const vis = (el) => {
        if (!el || el.offsetParent === null) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      // Elements are handed out through a proxy that refuses the mutating
      // members. Without this, read-only is only a promise in the prompt —
      // `BA.$('.x').click()` would simply work.
      const MUTATORS = new Set([
        'click', 'submit', 'focus', 'blur', 'remove', 'requestSubmit',
        'setAttribute', 'removeAttribute', 'insertAdjacentHTML', 'append',
        'prepend', 'appendChild', 'removeChild', 'replaceWith', 'scrollIntoView',
      ]);
      const WRITABLE = new Set(['value', 'innerHTML', 'outerHTML', 'textContent', 'checked', 'src', 'href']);
      const ro = (el) => {
        if (!el || typeof el !== 'object') return el;
        return new Proxy(el, {
          get(target, prop) {
            if (typeof prop === 'string' && MUTATORS.has(prop)) {
              return () => { throw new Error(`${prop}() is not allowed — this tool is read-only`); };
            }
            const v = target[prop];
            return typeof v === 'function' ? v.bind(target) : v;
          },
          set(target, prop) {
            if (typeof prop === 'string' && WRITABLE.has(prop)) {
              throw new Error(`setting .${prop} is not allowed — this tool is read-only`);
            }
            throw new Error('modifying the page is not allowed — this tool is read-only');
          },
        });
      };
      const BA = {
        $: (s, root) => { const e = (root || document).querySelector(s); return e ? ro(e) : null; },
        $$: (s, root) => [...(root || document).querySelectorAll(s)].map(ro),
        text: (el) => norm(el && (el.innerText || el.textContent)),
        attr: (el, n) => (el ? el.getAttribute(n) : null),
        visible: vis,
        byText: (t, sel) => [...document.querySelectorAll(sel || '*')]
          .filter((e) => norm(e.textContent).toLowerCase().includes(String(t).toLowerCase()))
          .map(ro),
      };
      // A read-only stand-in for `document`, so code that bypasses BA and calls
      // document.querySelector(...) directly still gets guarded elements.
      const roDocument = {
        querySelector: (s) => BA.$(s),
        querySelectorAll: (s) => BA.$$(s),
        getElementById: (id) => { const e = document.getElementById(id); return e ? ro(e) : null; },
        getElementsByClassName: (c) => [...document.getElementsByClassName(c)].map(ro),
        getElementsByTagName: (t) => [...document.getElementsByTagName(t)].map(ro),
        get title() { return document.title; },
        get URL() { return document.URL; },
        get body() { return ro(document.body); },
      };
      try {
        // Shadow the obvious escape hatches inside the snippet's scope. This is
        // a guard rail for a well-meaning model, not a security boundary —
        // MAIN-world code shares the page's realm by definition.
        // NB: "eval" cannot be a parameter name under "use strict" — it is a
        // SyntaxError that would reject every snippet. eval is left to the
        // page's own CSP and the server-side static check.
        const fn = new Function(
          'BA', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket',
          'localStorage', 'sessionStorage', 'indexedDB',
          `"use strict";\n${src}`
        );
        const blocked = () => { throw new Error('not allowed in read-only code'); };
        const out = fn(BA, roDocument, blocked, blocked, blocked, undefined, undefined, undefined);
        let data;
        try {
          data = JSON.parse(JSON.stringify(out === undefined ? null : out));
        } catch {
          data = String(out).slice(0, 20000); // not serializable — keep something
        }
        const json = JSON.stringify(data);
        if (json && json.length > 100000) {
          return { ok: false, error: `result too large (${json.length} bytes) — narrow what you return` };
        }
        return { ok: true, data, ms: Date.now() - t0 };
      } catch (e) {
        const msg = String((e && e.message) || e);
        return {
          ok: false,
          error: /unsafe-eval|Content Security Policy/i.test(msg)
            ? `this page's Content Security Policy blocks generated code (${msg})`
            : msg,
        };
      }
    },
  });
  return res?.result || { ok: false, error: 'no result from the page' };
}

// A compact description of the page for the code generator: structure it can
// actually target, rather than a full DOM dump.
async function pageDigestFor(tabId) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const vis = (el) => {
        if (!el || el.offsetParent === null) return false;
        const r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
      };
      const sig = (el) => {
        const cls = (el.className && typeof el.className === 'string')
          ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        const role = el.getAttribute('role') ? `[role="${el.getAttribute('role')}"]` : '';
        const test = el.getAttribute('data-testid') ? `[data-testid="${el.getAttribute('data-testid')}"]` : '';
        return el.tagName.toLowerCase() + (test || role || cls);
      };
      // Repeating structures are what most extraction targets look like.
      const counts = new Map();
      for (const el of document.querySelectorAll('body *')) {
        if (!vis(el)) continue;
        const s = sig(el);
        if (!s || s.length > 90) continue;
        const c = counts.get(s) || { n: 0, sample: '' };
        c.n++;
        if (!c.sample) c.sample = norm(el.innerText).slice(0, 90);
        counts.set(s, c);
      }
      const repeating = [...counts.entries()]
        .filter(([, c]) => c.n >= 3)
        .sort((a, b) => b[1].n - a[1].n)
        .slice(0, 18)
        .map(([s, c]) => `${s}  ×${c.n}  e.g. "${c.sample}"`);
      return {
        url: location.href.slice(0, 200),
        title: norm(document.title).slice(0, 120),
        repeating,
        headings: [...document.querySelectorAll('h1,h2,h3')].filter(vis).slice(0, 10).map((h) => norm(h.innerText).slice(0, 70)),
      };
    },
  });
  const d = res?.result;
  if (!d) return 'page structure unavailable';
  return [
    `URL: ${d.url}`,
    `TITLE: ${d.title}`,
    d.headings.length ? `HEADINGS: ${d.headings.join(' | ')}` : '',
    d.repeating.length ? `REPEATING ELEMENTS (selector ×count, sample text):\n${d.repeating.join('\n')}` : 'No obvious repeating structure found.',
  ].filter(Boolean).join('\n');
}

// Find an open tab by host, URL fragment or title text. Prefers the ACTIVE tab
// when several match (e.g. two Facebook tabs), then the most recently used.
async function findTabByMatch(match) {
  const m = String(match || '').toLowerCase().trim();
  if (!m) return null;
  const tabs = await chrome.tabs.query({});
  const hits = tabs.filter((t) => {
    const url = (t.url || '').toLowerCase();
    const title = (t.title || '').toLowerCase();
    if (/^(chrome|edge|about|devtools):/i.test(url)) return false;
    return url.includes(m) || title.includes(m) || hostOfTab(t).includes(m);
  });
  if (!hits.length) return null;
  return hits.find((t) => t.active) || hits[hits.length - 1];
}

// hostOfTab(tab) takes a tab object; this takes an id.
async function hostOfTabId(tabId) {
  try { return hostOfTab(await chrome.tabs.get(tabId)); } catch { return ''; }
}

async function urlOfTabId(tabId) {
  try { return (await chrome.tabs.get(tabId)).url || ''; } catch { return ''; }
}

// Ask the user whether to remember an element. Never writes it directly.
async function proposeElement(base, taskId, payload, summary) {
  if (!payload.host) return;
  try {
    await jf(`${base}/tasks/${taskId}/propose`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'element.create',
        summary,
        detail: `Selector: ${payload.selectors?.[0]?.value || ''}`,
        payload,
      }),
    });
    await taskEvent(base, taskId, 'think', `${summary} — waiting for your approval.`);
  } catch { /* proposing is best-effort; never fail the task over it */ }
}

const jf = (url, opts) => fetch(url, opts).then((r) => r.json());
const getTask = (base, id) => jf(`${base}/tasks/${id}`).then((j) => (j.ok ? j.task : null));
const patchTask = (base, id, fields) =>
  jf(`${base}/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
// `chat` also posts the message as an assistant turn in the transcript. Reserve
// it for the handful of events the user needs to see without opening the event
// log — a round finishing or failing.
const taskEvent = (base, id, kind, msg, chat = false) =>
  jf(`${base}/tasks/${id}/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, msg, chat }) });
// Record a descriptor that actually resolved, so a run that works can later be
// promoted into a skill. Best-effort: a failed record must never fail the task.
const recordResolution = (base, id, entry) =>
  jf(`${base}/tasks/${id}/resolution`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }).catch(() => {});
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

// Look up a learned skill by name for a host (via the backend). resolve=1
// hydrates v2 skills (element references) into the legacy runtime shape.
async function findSkill(base, host, name) {
  const j = await jf(`${base}/skills?host=${encodeURIComponent(host)}&resolve=1`);
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

// A phase failure that carries the finder's structured `diagnosis` (see
// findByDescriptor in content.js). The message still reads the same, so
// executeLoop's TRANSIENT regex is unaffected; the extra field rides along so
// rethink can be told WHY the lookup missed instead of guessing from a string.
function failureWithDiagnosis(msg, res) {
  const err = new Error(msg);
  if (res && res.diagnosis) err.diagnosis = res.diagnosis;
  return err;
}

// Tool implementations. Names MUST match the backend TOOL_CATALOG.
async function runTool(base, taskId, phase) {
  const p = phase.params || {};

  if (phase.tool === 'navigate') {
    const url = p.url;
    if (!url) throw new Error('navigate needs a url');
    let host = '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}

    // Reuse an already-open tab on the same site (so repeated tasks don't pile
    // up tabs) UNLESS the user explicitly asked for a new tab.
    let tab = null;
    if (!p.newTab && host) {
      const others = ownedByOthers(taskId);
      const tabs = await chrome.tabs.query({});
      tab = tabs.find((t) => { try { return new URL(t.url).hostname.replace(/^www\./, '') === host && !others.has(t.id); } catch { return false; } });
    }
    if (tab) {
      // CRITICAL: reusing a tab must still LOAD the requested URL. The query
      // often lives in the URL (e.g. /search?q=…), so merely focusing a stale
      // tab would silently run the task against the PREVIOUS page's content.
      const sameUrl = (() => {
        try {
          const a = new URL(tab.url), b = new URL(url);
          return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
        } catch { return false; }
      })();
      await chrome.tabs.update(tab.id, { active: true, ...(sameUrl ? {} : { url }) });
      if (sameUrl) {
        await taskEvent(base, taskId, 'obs', `Reusing the ${host} tab — already on this page.`);
      } else {
        await waitForTabLoad(tab.id);
        await new Promise((r) => setTimeout(r, 1500));
        await taskEvent(base, taskId, 'obs', `Loaded ${url} in the existing ${host} tab.`);
      }
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
    // Clamp the delay: models emit values like delay:1, which would turn a
    // 5-second scroll into 5000 steps. 250ms is about the fastest a scroll
    // still reads as scrolling rather than teleporting.
    const delay = Math.min(Math.max(Number(p.delay) || 1200, 250), 10000);
    // "scroll for 5 seconds" is a duration: scroll until the time is up,
    // rather than taking a step count from the number of seconds.
    const seconds = Number(p.seconds) > 0 ? Number(p.seconds) : 0;
    const times = Math.min(seconds ? Math.max(1, Math.round((seconds * 1000) / delay)) : (Number(p.times) || 10), 200);
    const res = await msgTab(tabId, { type: 'SCROLL_PAGE', times, delay, direction: p.direction || 'vertical' });
    const did = (res && res.ok) ? res.scrolled : 0;
    const t = await getTask(base, taskId);
    await patchTask(base, taskId, { scrolls: (t?.scrolls || 0) + did });
    await taskEvent(base, taskId, 'obs', seconds
      ? `Scrolled for ${seconds}s (${did} steps).`
      : `Scrolled ${did} times.`);
    return;
  }

  if (phase.tool === 'close_tab') {
    const tab = p.match ? await findTabByMatch(p.match) : null;
    const tabId = p.match ? tab?.id : AGENT[taskId]?.tabId;
    if (!tabId) throw new Error(p.match ? `no tab found matching "${p.match}"` : 'no tab to close — this task has not opened one');
    let label = '';
    try { label = hostOfTab(await chrome.tabs.get(tabId)); } catch {}
    try {
      await chrome.tabs.remove(tabId);
    } catch (e) {
      throw new Error(`could not close the tab: ${e.message || e}`);
    }
    // The tab is gone; later phases must not try to use it.
    if (AGENT[taskId]?.tabId === tabId) AGENT[taskId] = { ...(AGENT[taskId] || {}), tabId: null };
    const t = await getTask(base, taskId);
    await patchTask(base, taskId, { actions: (t?.actions || 0) + 1 });
    await taskEvent(base, taskId, 'obs', `Closed the ${label || 'task'} tab.`);
    return;
  }

  if (phase.tool === 'solve_with_code') {
    const tabId = await currentTab(taskId);
    const t0 = await getTask(base, taskId);
    const goal = p.goal || t0?.currentInstruction || t0?.goal || '';
    const expect = p.expect || '';
    const attempts = [];
    let solved = null;

    for (let attempt = 1; attempt <= 4 && !solved; attempt++) {
      const digest = await pageDigestFor(tabId);
      await taskEvent(base, taskId, 'think', `Writing code for "${String(goal).slice(0, 60)}" (attempt ${attempt}/4)…`);

      const gen = await jf(`${base}/ai/codegen`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: t0.model, goal, expect, digest, attempts }),
      }).catch(() => null);
      if (!gen?.ok) {
        attempts.push({ code: gen?.code || '', error: gen?.error || 'code generation failed' });
        await taskEvent(base, taskId, 'err', `Could not write code: ${gen?.error || 'model unavailable'}`);
        continue;
      }

      const run = await runPageCode(tabId, gen.code, 20000);
      if (!run.ok) {
        attempts.push({ code: gen.code, error: run.error });
        await taskEvent(base, taskId, 'obs', `Attempt ${attempt} failed: ${String(run.error).slice(0, 140)}`);
        continue;
      }

      // Deterministic checks first — cheap, and they catch the common "returned
      // nothing" case without spending a model call.
      const data = run.data;
      const rows = Array.isArray(data) ? data.length : (data && typeof data === 'object' ? Object.keys(data).length : (data ? 1 : 0));
      if (!rows) {
        attempts.push({ code: gen.code, error: 'returned an empty result' });
        await taskEvent(base, taskId, 'obs', `Attempt ${attempt} returned nothing.`);
        continue;
      }

      const sample = JSON.stringify(data).slice(0, 2000);
      const v = await jf(`${base}/ai/verify-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: t0.model, goal, expect, sample }),
      }).catch(() => ({ ok: true, pass: true }));

      if (v?.pass) {
        solved = { data, rows, code: gen.code, ms: run.ms };
      } else {
        attempts.push({ code: gen.code, error: v?.reason || 'did not satisfy the check', note: v?.hint });
        await taskEvent(base, taskId, 'obs', `Attempt ${attempt} rejected: ${String(v?.reason || '').slice(0, 140)}`);
      }
    }

    if (!solved) {
      throw new Error(`code attempts exhausted (4 tries) — last problem: ${attempts[attempts.length - 1]?.error || 'unknown'}`);
    }

    // Save like any other collection tool so the data lands in the session.
    const records = Array.isArray(solved.data)
      ? solved.data.map((d) => (d && typeof d === 'object' ? d : { value: d }))
      : [(solved.data && typeof solved.data === 'object') ? solved.data : { value: solved.data }];
    await mergeRecords(base, taskId, records);
    const tsk = await getTask(base, taskId);
    if (tsk?.schemas?.length && records.length) await saveToSchemas(base, taskId, tsk.schemas, records);
    await taskEvent(base, taskId, 'ok',
      `Code worked on attempt ${attempts.length + 1}: ${solved.rows} result(s) in ${solved.ms}ms.`);
    await taskEvent(base, taskId, 'obs', `Code used:\n${String(solved.code).slice(0, 600)}`);
    return;
  }

  if (phase.tool === 'switch_tab') {
    const match = String(p.match || '').trim();
    if (!match) throw new Error('switch_tab needs a `match` (host, URL fragment or title)');
    const tab = await findTabByMatch(match);
    if (!tab) throw new Error(`no open tab found matching "${match}"`);
    await chrome.tabs.update(tab.id, { active: true });
    try { await chrome.windows.update(tab.windowId, { focused: true }); } catch {}
    AGENT[taskId] = { ...(AGENT[taskId] || {}), tabId: tab.id };
    await taskEvent(base, taskId, 'obs', `Switched to "${(tab.title || '').slice(0, 60)}" (${hostOfTab(tab)}).`);
    return;
  }

  if (phase.tool === 'list_tabs') {
    const tabs = await chrome.tabs.query({});
    const list = tabs
      .filter((t) => !/^(chrome|edge|about|devtools):/i.test(t.url || ''))
      .map((t) => `- ${(t.title || '(untitled)').slice(0, 70)} — ${(t.url || '').slice(0, 120)}`);
    await taskEvent(base, taskId, 'obs', `${list.length} tab(s) open:\n${list.join('\n')}`.slice(0, 4000));
    return;
  }

  if (phase.tool === 'reload_tab') {
    const tabId = await currentTab(taskId);
    await chrome.tabs.reload(tabId);
    await waitForTabLoad(tabId);
    await new Promise((r) => setTimeout(r, 1000));
    await taskEvent(base, taskId, 'obs', 'Reloaded the page.');
    return;
  }

  if (phase.tool === 'go_back') {
    const tabId = await currentTab(taskId);
    try { await chrome.tabs.goBack(tabId); } catch (e) { throw new Error(`cannot go back: ${e.message || e}`); }
    await waitForTabLoad(tabId);
    await new Promise((r) => setTimeout(r, 800));
    let where = '';
    try { where = hostOfTab(await chrome.tabs.get(tabId)); } catch {}
    await taskEvent(base, taskId, 'obs', `Went back${where ? ` to ${where}` : ''}.`);
    return;
  }

  if (phase.tool === 'click' || phase.tool === 'hover') {
    const tabId = await currentTab(taskId);
    const res = await msgTab(tabId, {
      type: phase.tool === 'click' ? 'CLICK_ELEMENT' : 'HOVER_ELEMENT',
      selector: p.selector || '', text: p.text || '', descriptor: p.descriptor || null,
    });
    const t = await getTask(base, taskId);
    await patchTask(base, taskId, { actions: (t?.actions || 0) + 1 });
    const okMsg = res && res.ok ? `${phase.tool}ed ${res.matched || (p.selector || p.text)}` : `${phase.tool} failed: ${(res && res.error) || 'not found'}`;
    await taskEvent(base, taskId, res && res.ok ? 'obs' : 'err', okMsg);
    if (res && !res.ok) throw failureWithDiagnosis(okMsg, res);
    if (p.descriptor) {
      await recordResolution(base, taskId, {
        tool: phase.tool, descriptor: p.descriptor, matched: res.matched,
        selectorHint: res.selectorHint, depth: res.depth, url: await urlOfTabId(tabId),
      });
    }

    // This click came out of a recovery, and it worked — offer to REMEMBER it
    // as a named element so the next run does not have to rediscover it. Only
    // ever a proposal: the user approves before anything is written.
    if (phase.tool === 'click' && res?.ok && LEARN[taskId] && res.selectorHint) {
      const host = await hostOfTabId(tabId);
      LEARN[taskId] = false; // one proposal per recovery
      await proposeElement(base, taskId, {
        host,
        name: res.matched || p.text || 'Recovered control',
        type: 'action',
        action: 'click',
        selectors: [{ strategy: 'css', value: res.selectorHint, score: 80 }],
        details: `Found while recovering a failed step on ${host}.`,
      }, `Remember "${res.matched}" on ${host} as a reusable element`);
    }

    // A PUBLISH click must be verified. Clicking something is not the same as
    // publishing: a mis-matched button still "succeeds", and the task would
    // report complete while the post sat unsent in the composer.
    // Gate on ANY draft text, not just generate_text output. Keying on
    // generatedText alone meant a user-supplied post skipped verification
    // entirely: a run that clicked "Add to your post" instead of "Post" left
    // the draft unsent and still reported "Task complete".
    const draftText = t?.generatedText || t?.lastTypedText || '';
    if (phase.tool === 'click' && PUBLISH_WORD.test(String(p.text || '')) && draftText) {
      // POLL, don't check once. A single check at 2.5s produced a FALSE
      // "publish did not go through" on a post that HAD published — Facebook
      // leaves the text in the composer briefly while it submits. The false
      // alarm then sent the task into a recovery that clicked a carousel arrow
      // and finally the Like button on the user's own post. A false negative
      // here is far more expensive than waiting a few more seconds.
      let check = null;
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 2500 : 2000));
        check = await msgTab(tabId, { type: 'DRAFT_STILL_OPEN', text: draftText }).catch(() => null);
        if (!check || !check.ok || !check.open) break; // cleared — it went through
      }
      if (check && check.ok && check.open) {
        const msg = `Publish did not go through — the text is still in the composer (clicked "${res.matched || p.text}", which was probably the wrong control).`;
        await taskEvent(base, taskId, 'err', msg);
        throw new Error(msg);
      }
      await taskEvent(base, taskId, 'ok', 'Verified: the composer is empty — the post went through.');
    }
    return;
  }

  if (phase.tool === 'wait') {
    const t = await getTask(base, taskId);
    if (p.selector || p.text) {
      const tabId = await currentTab(taskId);
      const res = await msgTab(tabId, { type: 'WAIT_FOR', selector: p.selector || '', text: p.text || '', descriptor: p.descriptor || null, op: p.op || 'click', timeout: (Number(p.seconds) || 30) * 1000 });
      const okMsg = res && res.ok ? `Waited — "${res.matched}" appeared.` : `wait failed: ${(res && res.error) || 'timeout'}`;
      await taskEvent(base, taskId, res && res.ok ? 'obs' : 'err', okMsg);
      if (res && !res.ok) throw failureWithDiagnosis(okMsg, res);
    } else {
      const secs = Math.min(Number(p.seconds) || 3, 300);
      await taskEvent(base, taskId, 'obs', `Waiting ${secs}s…`);
      await new Promise((r) => setTimeout(r, secs * 1000));
    }
    await patchTask(base, taskId, { actions: (t?.actions || 0) + 1 });
    return;
  }

  if (phase.tool === 'screenshot') {
    const tabId = await currentTab(taskId);
    const tab = await chrome.tabs.get(tabId);
    // captureVisibleTab shoots the ACTIVE tab of the window — focus ours first.
    await chrome.tabs.update(tabId, { active: true });
    await new Promise((r) => setTimeout(r, 400));
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });
    if (!dataUrl) throw new Error('screenshot failed: nothing captured');
    await jf(`${base}/tasks/${taskId}/screenshot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, url: tab.url || '' }),
    });
    const t = await getTask(base, taskId);
    await patchTask(base, taskId, { actions: (t?.actions || 0) + 1 });
    await taskEvent(base, taskId, 'ok', 'Screenshot captured — view it in the dashboard.');
    return;
  }

  if (phase.tool === 'ask_user') {
    const t0 = await getTask(base, taskId);
    const question = p.question || 'Continue with the next step?';
    await patchTask(base, taskId, { pendingQuestion: { question, askedAt: new Date().toISOString() }, status: 'waiting' });
    await taskEvent(base, taskId, 'think', `⏸ Waiting for your confirmation: ${question}`);
    // Poll until answered (popup/dashboard call POST /tasks/:id/answer).
    const deadline = Date.now() + 10 * 60 * 1000; // 10 minutes
    let answer = null;
    while (Date.now() < deadline) {
      if (!AGENT[taskId]?.running) return;
      await new Promise((r) => setTimeout(r, 2000));
      const t = await getTask(base, taskId);
      if (t?.pendingQuestion?.answer) { answer = t.pendingQuestion.answer; break; }
      if (t && ['stopped', 'error'].includes(t.status)) return;
    }
    await patchTask(base, taskId, { pendingQuestion: null, status: 'running', actions: (t0?.actions || 0) + 1 });
    if (!answer) throw new Error('ask_user timed out — no answer within 10 minutes');
    if (/^(no|n|cancel|stop|decline)/i.test(answer)) throw new Error('User declined the confirmation');
    await taskEvent(base, taskId, 'ok', `Confirmed (“${answer}”) — continuing.`);
    return;
  }

  if (phase.tool === 'press_key') {
    const tabId = await currentTab(taskId);
    const key = p.key || 'Enter';
    const res = await msgTab(tabId, { type: 'PRESS_KEY', selector: p.selector || '', text: p.text || '', key });
    const t = await getTask(base, taskId);
    await patchTask(base, taskId, { actions: (t?.actions || 0) + 1 });
    const okMsg = res && res.ok ? `Pressed ${key} on ${res.matched || 'field'}` : `press_key failed: ${(res && res.error) || 'no field'}`;
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
    const isPlaceholder = /^\s*<[^>]*>\s*$/.test(value) || /\bgenerated\s+(text|post|content)\b/i.test(value);
    if (t?.generatedText && (!value || isPlaceholder)) {
      value = t.generatedText;
    } else if (isPlaceholder || !value) {
      // The planner emitted a placeholder ("<the post text>") but nothing ever
      // produced real text — no generate_text phase ran and the user gave none.
      // Typing it literally PUBLISHES "<the post text>" to a live account and
      // then reports success, which is the worst outcome available here. Fail
      // loudly instead. Worded to avoid the TRANSIENT regex: waiting and
      // retrying cannot conjure text that was never written.
      const msg = value
        ? `type has no real text to enter — params.value is still the placeholder "${String(value).slice(0, 40)}" and no generate_text step produced anything. Say what should be written, or plan a generate_text phase.`
        : 'type has no text to enter — params.value is empty and no generate_text step produced anything.';
      await taskEvent(base, taskId, 'err', msg);
      throw new Error(msg);
    }
    const res = await msgTab(tabId, { type: 'TYPE_TEXT', selector: p.selector || '', text: p.text || '', descriptor: p.descriptor || null, value });
    // Remember what was typed: the publish check below needs SOME draft text to
    // look for, and user-supplied text never sets generatedText.
    await patchTask(base, taskId, { actions: (t?.actions || 0) + 1, ...(res?.ok && value ? { lastTypedText: value } : {}) });
    const okMsg = res && res.ok ? `Typed into ${res.matched || 'field'}: "${String(value).slice(0, 60)}"` : `type failed: ${(res && res.error) || 'no field'}`;
    await taskEvent(base, taskId, res && res.ok ? 'obs' : 'err', okMsg);
    if (res && !res.ok) throw failureWithDiagnosis(okMsg, res);
    if (p.descriptor) {
      await recordResolution(base, taskId, {
        tool: 'type', descriptor: p.descriptor, matched: res.matched,
        selectorHint: res.selectorHint, depth: res.depth, url: await urlOfTabId(tabId),
      });
    }
    return;
  }

  if (phase.tool === 'generate_text') {
    const t = await getTask(base, taskId);
    const prompt = p.prompt || t.goal;
    // Source material, best first: research this task already synthesized (so
    // "research X then post about it" writes FROM the findings), else the last
    // collected post ("regenerate the found post" should see that post).
    let context = '';
    let sourceLabel = '';
    if (t.summary) {
      context = String(t.summary).slice(0, 4000);
      sourceLabel = ' (from this task\'s research)';
    } else {
      const last = (t.collected || [])[(t.collected || []).length - 1] || null;
      context = last ? String(last.text || last._sourceText || '').slice(0, 4000) : '';
      if (context) sourceLabel = ' (using the found post as source)';
    }
    await taskEvent(base, taskId, 'think', `Generating text: ${String(prompt).slice(0, 80)}…${sourceLabel}`);
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

  if (phase.tool === 'run_skill') {
    const tabId = await currentTab(taskId);
    const tab = await chrome.tabs.get(tabId);
    const skill = await findSkill(base, hostOfTab(tab), p.skill);
    if (!skill) throw new Error(`No skill "${p.skill}" for ${hostOfTab(tab)}`);
    const t = await getTask(base, taskId);
    // v2 multi-action skills resolve with an ordered `steps` list; a single
    // action skill runs as one step.
    const steps = (Array.isArray(skill.steps) && skill.steps.length)
      ? skill.steps
      : [{ name: skill.name, action: skill.action || 'click', selectors: skill.selectors || [] }];
    let done = 0;
    await taskEvent(base, taskId, 'act', `Running skill "${p.skill}" (${steps.length} step${steps.length > 1 ? 's' : ''})…`);
    for (const step of steps) {
      if (!AGENT[taskId]?.running) break;
      // "type" steps get explicit text, else whatever generate_text produced.
      const value = step.action === 'type' ? (p.text || t?.generatedText || '') : '';
      const r = await msgTab(tabId, { type: 'RUN_STEP', step, value });
      await taskEvent(base, taskId, r && r.ok ? 'obs' : 'err',
        `Step "${step.name}" (${step.action}): ${r && r.ok ? 'ok' : (r && r.error) || 'failed'}`);
      if (r && r.value != null) await taskEvent(base, taskId, 'obs', `Read: ${String(r.value).slice(0, 100)}`);
      if (!r || !r.ok) throw new Error(`run_skill step "${step.name}" failed: ${(r && r.error) || 'not found'}`);
      done++;
      await new Promise((res) => setTimeout(res, 700)); // let the page react between steps
    }
    await patchTask(base, taskId, { actions: (t?.actions || 0) + done });
    await taskEvent(base, taskId, 'ok', `Skill "${p.skill}" ran ${done}/${steps.length} steps.`);
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

  if (phase.tool === 'collect_links') {
    const tabId = await currentTab(taskId);
    const res = await msgTab(tabId, { type: 'COLLECT_LINKS', options: { target: p.target || 10 } });
    if (!res || !res.ok) throw new Error((res && res.error) || 'no result links found on this page');
    const links = Array.isArray(res.links) ? res.links : [];
    const collected = links.map((l, i) => ({ index: i + 1, url: l.url, title: l.title || '', collectedAt: new Date().toISOString() }));
    await mergeRecords(base, taskId, collected);
    const t = await getTask(base, taskId);
    if (t?.schemas?.length && collected.length) await saveToSchemas(base, taskId, t.schemas, collected);
    await taskEvent(base, taskId, collected.length ? 'ok' : 'err', `Collected ${collected.length} result link(s).`);
    return;
  }

  // Visit each collected link and attach its readable content to that record,
  // turning links into SOURCES. Saves after every page so a crash keeps progress,
  // and a page that blocks/times out is skipped rather than failing the task.
  if (phase.tool === 'read_pages') {
    const t0 = await getTask(base, taskId);
    const list = (t0?.collected || []).slice();
    const limit = Number(p.target) || list.length;
    let read = 0, failed = 0;
    for (let i = 0; i < list.length && read < limit; i++) {
      if (!AGENT[taskId]?.running) break;
      const rec = list[i];
      if (!rec || !rec.url || rec.text) continue;         // nothing to read, or already read
      const r = await readUrl(rec.url, { type: 'EXTRACT_ARTICLE', maxChars: Number(p.maxChars) || 8000 });
      if (r && r.ok && r.article) {
        list[i] = { ...rec, title: rec.title || r.article.title || '', text: r.article.text || '', images: r.article.images || [] };
        read++;
        await taskEvent(base, taskId, 'obs', `Read ${read}/${limit}: ${String(list[i].title || rec.url).slice(0, 70)}`);
      } else {
        list[i] = { ...rec, readError: (r && r.error) || 'unreadable' };
        failed++;
        await taskEvent(base, taskId, 'err', `Skipped ${String(rec.url).slice(0, 60)} — ${(r && r.error) || 'unreadable'}`);
      }
      await patchTask(base, taskId, { collected: list });  // incremental, crash-safe
    }
    const t = await getTask(base, taskId);
    const withText = list.filter((x) => x && x.text);
    if (t?.schemas?.length && withText.length) await saveToSchemas(base, taskId, t.schemas, withText);
    await taskEvent(base, taskId, read ? 'ok' : 'err', `Read ${read} page(s)${failed ? `, ${failed} unreadable` : ''}.`);
    return;
  }

  // Final research step: the BACKEND does the map-reduce summarization (it owns
  // the model) and writes the cited answer into the session transcript.
  if (phase.tool === 'synthesize') {
    const t0 = await getTask(base, taskId);
    const question = p.question || t0?.currentInstruction || t0?.goal || '';
    await taskEvent(base, taskId, 'act', 'Reading the sources and writing the answer…');
    const r = await jf(`${base}/tasks/${taskId}/synthesize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    }).catch(() => null);
    if (!r || !r.ok) throw new Error((r && r.error) || 'synthesize failed');
    await taskEvent(base, taskId, 'ok', `Answer written from ${r.used}/${r.total} source(s).`);
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
// Has the task been cancelled server-side (desktop-app Stop button)? Network
// hiccups must NOT read as cancelled, or a blip would kill a healthy run.
async function isCancelled(base, taskId) {
  try {
    const t = await getTask(base, taskId);
    return !!t && ['stopped', 'error'].includes(t.status);
  } catch {
    return false;
  }
}

// A phase failed. Observe the live page, ask the backend what to do instead,
// and apply the decision by rewriting the plan.
// Returns 'retry' (plan rewritten — re-run this index), 'skip', or 'abort'.
async function rethink(base, taskId, phase, index, err) {
  let snapshot = null;
  try {
    const tabId = await currentTab(taskId);
    const r = await msgTab(tabId, { type: 'PAGE_SNAPSHOT', limit: 40 });
    if (r && r.ok) snapshot = r.snapshot;
  } catch { /* no page to look at — the model still gets the error */ }

  await taskEvent(base, taskId, 'think', `"${phase.tool}" failed — looking at the page to work out what to do instead…`);

  let decision = null;
  try {
    const r = await jf(`${base}/tasks/${taskId}/rethink`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        failedPhase: phase, phaseIndex: index, error: err?.message || String(err), snapshot,
        // Why the lookup missed: copy changed (nearest), text found but nothing
        // actionable above it (ascentRejected), or the scope was never open
        // (scopeEmpty). Without this the model only sees "not found".
        diagnosis: err?.diagnosis || null,
      }),
    });
    decision = r?.decision || null;
  } catch { /* fall through to abort */ }
  if (!decision) return 'abort';

  if (decision.action === 'skip') {
    await taskEvent(base, taskId, 'obs', `Skipping this step: ${decision.reason}`);
    return 'skip';
  }
  if (decision.action !== 'replace') {
    await taskEvent(base, taskId, 'err', `Giving up: ${decision.reason}`);
    return 'abort';
  }

  // Swap the failed phase for the recovery phases, keeping the rest of the plan.
  const task = await getTask(base, taskId);
  const phases = (task?.plan?.phases || []).slice();
  phases.splice(index, 1, ...decision.phases);
  await patchTask(base, taskId, { plan: { ...task.plan, phases }, currentPhaseIndex: index });
  await taskEvent(base, taskId, 'act',
    `New approach: ${decision.phases.map((p) => p.tool).join(' → ')} — ${decision.reason}`);
  LEARN[taskId] = true; // if the new approach works, offer to remember it
  return 'retry';
}

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
      // Stop can also arrive from the desktop app, which only flips the status
      // in the DB — this worker has no in-memory signal for that. Re-read it
      // between phases so Stop halts the run instead of waiting for the plan
      // to finish. (Never mid-phase: a fired side effect must not be retried.)
      if (await isCancelled(base, taskId)) {
        if (AGENT[taskId]) AGENT[taskId].running = false;
        await taskEvent(base, taskId, 'obs', 'Stopped — halting before the next phase.');
        return;
      }
      const phase = task.plan.phases[i];
      await taskEvent(base, taskId, 'act', `Phase ${i + 1}/${task.plan.phases.length}: ${phase.tool}`);
      // Transient failures (element/dialog not rendered yet, content script not
      // attached) retry with exponential backoff — 1s, 2s, 4s, 8s — before the
      // task is failed. These errors mean NOTHING happened, so retrying is safe.
      const TRANSIENT = /not found|no element|no editable field|no field|did not open|Receiving end|Could not establish|scan failed|No page to act on/i;
      let lastErr = null;
      for (let attempt = 0; attempt <= 4; attempt++) {
        if (attempt) {
          const wait = 1000 * Math.pow(2, attempt - 1);
          await taskEvent(base, taskId, 'think', `Element not ready — retry ${attempt}/4 for ${phase.tool} in ${wait / 1000}s…`);
          await new Promise((r) => setTimeout(r, wait));
        }
        if (!AGENT[taskId]?.running) { lastErr = null; break; }
        try { await runTool(base, taskId, phase); lastErr = null; break; }
        catch (e) {
          lastErr = e;
          if (!TRANSIENT.test(e?.message || '')) break; // real failure — don't retry blindly
        }
      }
      if (lastErr) {
        // A declined confirmation is a clean stop, not a failure.
        if (/User declined/i.test(lastErr?.message || '')) {
          await patchTask(base, taskId, { status: 'stopped', finishedAt: new Date().toISOString() });
          await taskEvent(base, taskId, 'err', 'Stopped — you declined the confirmation.');
          return;
        }
        // THINK instead of giving up: look at what is actually on the page and
        // decide what to do instead. Capped server-side so a task cannot loop.
        const recovered = await rethink(base, taskId, phase, i, lastErr);
        if (recovered === 'retry') {
          task = await getTask(base, taskId); // plan was rewritten — reload it
          i--;                                // re-run this index (now the new step)
          continue;
        }
        if (recovered === 'skip') {
          await patchTask(base, taskId, { currentPhaseIndex: i + 1 });
          continue;
        }
        await taskError(base, taskId, phase.tool, lastErr?.message || String(lastErr));
        await patchTask(base, taskId, { status: 'error' });
        await taskEvent(base, taskId, 'err', `${phase.tool} failed: ${lastErr?.message || lastErr}`, true);
        return; // stop on unrecoverable error, per design
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

    // Repeating is ONLY safe for pure collection plans. A plan that clicked,
    // typed or published already fired side effects, so re-running it from the
    // top would post the same thing twice — even when the collection half fell
    // short of its target (a chained "research N sources then post" plan is
    // metric "links", so the metric check alone does not cover it).
    const SIDE_EFFECT = ['click', 'type', 'press_key', 'generate_text', 'use_skill', 'run_skill', 'ask_user'];
    const acted = task.plan.phases.some((p) => SIDE_EFFECT.includes(p.tool));
    if (metric === 'actions' || acted || have >= count) {
      await patchTask(base, taskId, { status: 'done', finishedAt: new Date().toISOString() });
      const why = have >= count ? `${have}/${count} ${metric}`
        : acted && metric !== 'actions' ? `all ${task.plan.phases.length} phases ran (${have}/${count} ${metric}; not repeating — the plan already acted on a page)`
        : `all ${task.plan.phases.length} phases ran`;
      await taskEvent(base, taskId, 'ok', `Task complete: ${why}.`, true);
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
      if (['running', 'checking', 'planning', 'waiting'].includes(t.status)) {
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
// Standing poll (always on, MV3 minimum interval): external frontends — the
// desktop app — create tasks purely through the backend API, so this is what
// notices and starts them even when no extension UI was ever opened.
chrome.alarms.create('ba-task-poll', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'ba-keepalive' || a.name === 'ba-task-poll') resumeUnfinished(); });

// Every time the worker spins up (startup, reload, wake), revive orphaned tasks.
resumeUnfinished();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'START_AGENT_TASK') {
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
      } else if (msg?.type === 'RESOLVE_ELEMENTS_HOST') {
        // Health check for the skills page: resolve elements on an open tab of
        // their host and report per-element match counts.
        const host = String(msg.host || '').replace(/^www\./, '');
        const tabs = await chrome.tabs.query({ url: [`*://${host}/*`, `*://*.${host}/*`] });
        const tab = tabs[0];
        if (!tab) { sendResponse({ ok: false, error: `No open tab on ${host} — open one first.` }); return; }
        const r = await msgTab(tab.id, { type: 'RESOLVE_ELEMENTS', elements: msg.elements || [] });
        sendResponse({ ...(r || { ok: false, error: 'no response' }), url: tab.url });
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
