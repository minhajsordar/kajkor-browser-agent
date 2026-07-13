// Browser Agent — popup frontend.
// Multi-task: the composer (home) is always reachable and lists live tasks;
// clicking one opens its session view. Starting a task launches it in the
// background (which runs tasks in parallel) and opens its session to watch.
// All real state lives in MongoDB (crash-safe).

const $ = (id) => document.getElementById(id);
const BACKEND_URL = 'http://localhost:4000';

const els = {
  composer: $('composer'),
  session: $('session'),
  taskInput: $('taskInput'),
  repeat: $('repeat'),
  sendBtn: $('sendBtn'),
  active: $('active'),
  recent: $('recent'),
  schemaSelect: $('schemaSelect'),
  schemaBtn: $('schemaBtn'),
  manageSchemas: $('manageSchemas'),
  skillSelect: $('skillSelect'),
  skillBtn: $('skillBtn'),
  manageSkills2: $('manageSkills2'),
  learnBtn: $('learnBtn'),
  model: $('model'),
  modelRefresh: $('modelRefresh'),
  modelHint: $('modelHint'),
  // session
  sessTask: $('sessTask'),
  sessBadge: $('sessBadge'),
  sessElapsed: $('sessElapsed'),
  sessSteps: $('sessSteps'),
  sessMode: $('sessMode'),
  log: $('log'),
  backBtn: $('backBtn'),
  continueBtn: $('continueBtn'),
  stopBtn: $('stopBtn'),
  fbLink: $('fbLink'),
  dashLink: $('dashLink'),
  skillsLink: $('skillsLink'),
};

const KEYS = { recent: 'ba_recent', model: 'ba_model' };
const MAX_RECENT = 5;
const TERMINAL = new Set(['done', 'error', 'stopped']);
const BADGE = { planning: 'waiting', running: 'running', checking: 'waiting', done: 'done', error: 'error', stopped: 'stopped' };

let viewTaskId = null;      // task currently shown in the session view (or null on home)
let sessionPoll = null;     // polls the viewed task
let homePoll = null;        // polls the active-tasks list on the composer
let autoCloseTimer = null;

// --- storage ---------------------------------------------------------------

const get = (key) => new Promise((r) => chrome.storage.local.get([key], (o) => r(o[key])));
const set = (key, val) => new Promise((r) => chrome.storage.local.set({ [key]: val }, r));

// --- backend ---------------------------------------------------------------

const api = (path, opts) => fetch(`${BACKEND_URL}${path}`, opts).then((r) => r.json());

function haveOf(t) {
  const m = t.plan?.target?.metric;
  if (m === 'details') return t.extracted?.length || 0;
  if (m === 'scrolls') return t.scrolls || 0;
  return t.collected?.length || 0;
}

// --- helpers ---------------------------------------------------------------

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fmtElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
const timeOf = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

// --- ollama models (via backend) -------------------------------------------

function setModelHint(msg) {
  if (!msg) { els.modelHint.classList.add('hidden'); els.modelHint.textContent = ''; return; }
  els.modelHint.textContent = msg;
  els.modelHint.classList.remove('hidden');
}

async function loadModels() {
  els.modelRefresh.classList.add('spin');
  els.model.innerHTML = '<option value="">Loading models…</option>';
  els.sendBtn.disabled = true;

  let res;
  try {
    res = await api('/models');
  } catch {
    els.model.innerHTML = '<option value="">Backend offline</option>';
    setModelHint('Backend not reachable at localhost:4000. Start it: `npm start` in /backend.');
    els.modelRefresh.classList.remove('spin');
    return;
  }
  els.modelRefresh.classList.remove('spin');

  const names = (res.models || []).map((m) => m.name);
  if (!names.length) {
    els.model.innerHTML = '<option value="">No tool-calling models</option>';
    setModelHint(res.ok === false && res.error ? res.error + ' — start it with `ollama serve`.'
      : 'No installed model supports tool calling. Try `ollama pull llama3.1`.');
    els.sendBtn.disabled = true;
    return;
  }

  setModelHint('');
  const saved = await get(KEYS.model);
  // "auto" lets the backend pick a size-appropriate model per task complexity.
  const options = ['auto', ...names];
  const selected = options.includes(saved) ? saved : 'auto';
  const label = (n) => n === 'auto' ? '🔮 Auto (best for the task)' : escapeHtml(n);
  els.model.innerHTML = options
    .map((n) => `<option value="${escapeHtml(n)}"${n === selected ? ' selected' : ''}>${label(n)}</option>`)
    .join('');
  await set(KEYS.model, selected);
  els.sendBtn.disabled = false;
}

// --- schemas & skills (multi-select dropdowns) -------------------------------

function updateMsdLabel(panel, btn) {
  const label = btn.querySelector('.msd-label');
  const checked = [...panel.querySelectorAll('input[type=checkbox]:checked')];
  const names = checked.map((c) => c.closest('.msd-opt').dataset.name);
  if (!names.length) {
    label.textContent = 'None';
    label.classList.add('mut');
  } else {
    label.textContent = names.length <= 2 ? names.join(', ') : `${names.length} selected`;
    label.classList.remove('mut');
  }
}

function setupMsd(panel, btn) {
  const wrap = btn.closest('.msd');
  btn.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    wrap.classList.toggle('open', !panel.classList.contains('hidden'));
  });
  panel.addEventListener('change', () => updateMsdLabel(panel, btn));
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) {
      panel.classList.add('hidden');
      wrap.classList.remove('open');
    }
  });
}

async function loadSchemas() {
  let schemas = [];
  try { schemas = (await api('/schemas')).schemas || []; } catch {}
  if (!schemas.length) {
    els.schemaSelect.innerHTML = '<span class="msd-empty">No schemas yet — click “Manage schemas” to create one. Tasks run fine without one.</span>';
  } else {
    els.schemaSelect.innerHTML = schemas.map((s) =>
      `<label class="msd-opt" data-name="${escapeHtml(s.name)}"><input type="checkbox" value="${escapeHtml(s.schemaId)}"/> ${escapeHtml(s.name)} <span class="mut">(${s.fields.length})</span></label>`
    ).join('');
  }
  updateMsdLabel(els.schemaSelect, els.schemaBtn);
}

function selectedSchemaIds() {
  return [...els.schemaSelect.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value);
}

async function loadSkills() {
  let skills = [];
  try { skills = (await api('/skills')).skills || []; } catch {}
  const coll = skills.filter((s) => s.kind === 'collection');
  if (!coll.length) {
    els.skillSelect.innerHTML = '<span class="msd-empty">No collection skills yet — teach one with “Start learning session”.</span>';
  } else {
    els.skillSelect.innerHTML = coll.map((s) =>
      `<label class="msd-opt" data-name="${escapeHtml(s.name)}"><input type="checkbox" value="${escapeHtml(s.skillId)}"/> ${escapeHtml(s.name)} <span class="mut">(${(s.fields || []).length}f)</span></label>`
    ).join('');
  }
  updateMsdLabel(els.skillSelect, els.skillBtn);
}

function selectedSkillIds() {
  return [...els.skillSelect.querySelectorAll('input[type=checkbox]:checked')].map((c) => c.value);
}

// --- views -----------------------------------------------------------------

function showComposer() {
  stopSessionPoll();
  cancelAutoClose();
  viewTaskId = null;
  els.session.classList.add('hidden');
  els.composer.classList.remove('hidden');
  renderRecent();
  startHomePoll();
}

function showSession(taskId) {
  stopHomePoll();
  viewTaskId = taskId;
  els.composer.classList.add('hidden');
  els.session.classList.remove('hidden');
  startSessionPoll();
}

// --- home: active-tasks list -----------------------------------------------

async function renderActive() {
  let tasks = [];
  try { tasks = (await api('/tasks')).tasks || []; } catch { els.active.innerHTML = ''; return; }
  const active = tasks.filter((t) => !TERMINAL.has(t.status));
  const recentDone = tasks.filter((t) => TERMINAL.has(t.status)).slice(0, 3);
  const rows = [...active, ...recentDone];
  if (!rows.length) { els.active.innerHTML = ''; return; }

  const title = active.length ? `Running (${active.length})` : 'Recent tasks';
  els.active.innerHTML = `<div class="recent-title">${title}</div>` + rows.map((t) => {
    const tg = t.plan?.target;
    const prog = tg ? `${haveOf(t)}/${tg.count} ${tg.metric}` : '';
    return `<div class="active-item" data-id="${escapeHtml(t.taskId)}">
        <span class="badge ${BADGE[t.status] || ''}">${escapeHtml(t.status)}</span>
        <span class="txt">${escapeHtml(t.goal)}</span>
        <span class="prog">${escapeHtml(prog)}</span>
      </div>`;
  }).join('');
  els.active.querySelectorAll('.active-item').forEach((el) => {
    el.addEventListener('click', () => showSession(el.getAttribute('data-id')));
  });
}

function startHomePoll() {
  stopHomePoll();
  renderActive();
  homePoll = setInterval(renderActive, 2000);
}
function stopHomePoll() { if (homePoll) { clearInterval(homePoll); homePoll = null; } }

// --- recent (goal quick-fill) ----------------------------------------------

async function renderRecent() {
  const recent = (await get(KEYS.recent)) || [];
  if (!recent.length) { els.recent.innerHTML = ''; return; }
  els.recent.innerHTML = `<div class="recent-title">Recent commands</div>` +
    recent.map((tk) => `<div class="recent-item" data-task="${escapeHtml(tk)}"><span class="txt">${escapeHtml(tk)}</span></div>`).join('');
  els.recent.querySelectorAll('.recent-item').forEach((el) => {
    el.addEventListener('click', () => { els.taskInput.value = el.getAttribute('data-task'); els.taskInput.focus(); });
  });
}
async function pushRecent(task) {
  let recent = (await get(KEYS.recent)) || [];
  recent = [task, ...recent.filter((t) => t !== task)].slice(0, MAX_RECENT);
  await set(KEYS.recent, recent);
}

// --- session view ----------------------------------------------------------

function renderTask(t) {
  if (!t) return;
  els.sessTask.textContent = t.goal;
  els.sessBadge.textContent = t.status;
  els.sessBadge.className = 'badge ' + (BADGE[t.status] || '');

  const end = t.finishedAt ? new Date(t.finishedAt).getTime() : Date.now();
  els.sessElapsed.textContent = fmtElapsed(end - new Date(t.createdAt).getTime());

  const nPhases = t.plan?.phases?.length || 0;
  els.sessSteps.textContent = nPhases ? `phase ${Math.min(t.currentPhaseIndex || 0, nPhases)}/${nPhases}` : 'planning';

  const tg = t.plan?.target;
  els.sessMode.textContent = tg ? `${haveOf(t)}/${tg.count} ${tg.metric}` : (t.mode === 'repeat' ? 'repetitive' : 'once');

  renderLog(t.events || []);

  const terminal = TERMINAL.has(t.status);
  els.stopBtn.disabled = terminal;
  els.continueBtn.disabled = !terminal;
}

function renderLog(events) {
  if (!events.length) { els.log.innerHTML = '<div class="log-empty">Waiting for the agent…</div>'; return; }
  els.log.innerHTML = events.map((e) =>
    `<div class="log-line ${e.kind}"><span class="t">${timeOf(e.at)}</span><span class="m">${escapeHtml(e.msg)}</span></div>`
  ).join('');
  els.log.scrollTop = els.log.scrollHeight;
}

function startSessionPoll() {
  stopSessionPoll();
  const tick = async () => {
    if (!viewTaskId) return;
    try {
      const j = await api(`/tasks/${viewTaskId}`);
      if (!j.ok) return;
      renderTask(j.task);
      if (TERMINAL.has(j.task.status)) {
        stopSessionPoll();
        // Auto-return home shortly after done; leave error/stopped for review.
        if (j.task.status === 'done' && !autoCloseTimer) {
          autoCloseTimer = setTimeout(() => { autoCloseTimer = null; showComposer(); }, 2500);
        }
      }
    } catch {}
  };
  tick();
  sessionPoll = setInterval(tick, 1500);
}
function stopSessionPoll() { if (sessionPoll) { clearInterval(sessionPoll); sessionPoll = null; } }
function cancelAutoClose() { if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; } }

// --- actions ---------------------------------------------------------------

async function startTask() {
  const goal = els.taskInput.value.trim();
  if (!goal) { els.taskInput.focus(); return; }
  const model = els.model.value;
  if (!model) { setModelHint('Select a tool-calling model first.'); return; }
  const mode = els.repeat.checked ? 'repeat' : 'once';

  els.sendBtn.disabled = true;
  let created;
  try {
    created = await api('/tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, model, mode, schemas: selectedSchemaIds(), useSkills: selectedSkillIds() }),
    });
  } catch {
    setModelHint('Backend not reachable — start it in /backend.');
    els.sendBtn.disabled = false;
    return;
  }
  els.sendBtn.disabled = false;
  if (!created.ok) { setModelHint(created.error || 'Could not create task.'); return; }

  await pushRecent(goal);
  els.taskInput.value = '';
  chrome.runtime.sendMessage({ type: 'START_AGENT_TASK', taskId: created.task.taskId });
  showSession(created.task.taskId); // watch it; others keep running in the background
}

function stopTask() {
  if (!viewTaskId) return;
  chrome.runtime.sendMessage({ type: 'STOP_AGENT_TASK', taskId: viewTaskId });
}

function continueTask() {
  if (!viewTaskId) return;
  cancelAutoClose();
  chrome.runtime.sendMessage({ type: 'START_AGENT_TASK', taskId: viewTaskId });
  startSessionPoll();
}

// --- wiring ----------------------------------------------------------------

els.sendBtn.addEventListener('click', startTask);
els.backBtn.addEventListener('click', showComposer);
els.stopBtn.addEventListener('click', stopTask);
els.continueBtn.addEventListener('click', continueTask);
els.model.addEventListener('change', () => set(KEYS.model, els.model.value));
els.modelRefresh.addEventListener('click', loadModels);
els.taskInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') startTask();
});
els.fbLink.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('legacy/fb.html') }); });
els.dashLink.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') }); });
els.manageSchemas.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('schemas/schemas.html') }); });
els.skillsLink.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('skills/skills.html') }); });
els.manageSkills2.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('skills/skills.html') }); });
setupMsd(els.schemaSelect, els.schemaBtn);
setupMsd(els.skillSelect, els.skillBtn);
els.learnBtn.addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'START_LEARN' });
  if (!res?.ok) { setModelHint(res?.error || 'Could not start learning here.'); return; }
  window.close(); // let the user interact with the page; overlay lives in the tab
});

// --- boot ------------------------------------------------------------------

(async function boot() {
  await Promise.all([loadModels(), loadSchemas(), loadSkills()]);
  showComposer(); // always land on home; live tasks are listed and clickable
})();
