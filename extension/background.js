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

  if (phase.tool === 'wait') {
    const t = await getTask(base, taskId);
    if (p.selector || p.text) {
      const tabId = await currentTab(taskId);
      const res = await msgTab(tabId, { type: 'WAIT_FOR', selector: p.selector || '', text: p.text || '', timeout: (Number(p.seconds) || 30) * 1000 });
      const okMsg = res && res.ok ? `Waited — "${res.matched}" appeared.` : `wait failed: ${(res && res.error) || 'timeout'}`;
      await taskEvent(base, taskId, res && res.ok ? 'obs' : 'err', okMsg);
      if (res && !res.ok) throw new Error(okMsg);
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
        await taskError(base, taskId, phase.tool, lastErr?.message || String(lastErr));
        await patchTask(base, taskId, { status: 'error' });
        await taskEvent(base, taskId, 'err', `${phase.tool} failed: ${lastErr?.message || lastErr}`);
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
