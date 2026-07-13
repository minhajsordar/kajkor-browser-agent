// Browser Agent — task dashboard.
// Lists all tasks from the backend and previews one: plan, live event log,
// errors, and the collected-data list (with a filter box). Read-only over the
// same MongoDB the agent writes to; adds task delete.

const BACKEND_URL = 'http://localhost:4000';
const $ = (s) => document.querySelector(s);

const BADGE = { planning: 'waiting', running: 'running', checking: 'waiting', done: 'done', error: 'error', stopped: 'stopped' };
const TERMINAL = new Set(['done', 'error', 'stopped']);

let TASKS = [];
let selectedId = null;
let detailsByUrl = new Map();   // url -> page-details (for extracted rows)
let dataFilter = '';            // collected-data filter text
let refreshTimer = null;

const api = (path, opts) => fetch(`${BACKEND_URL}${path}`, opts).then((r) => r.json());
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const timeOf = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const dateOf = (at) => new Date(at).toLocaleString();

function badgeClass(status) { return 'badge ' + (BADGE[status] || ''); }

function haveOf(t) {
  const m = t.plan?.target?.metric;
  if (m === 'details') return t.extracted?.length || 0;
  if (m === 'scrolls') return t.scrolls || 0;
  if (m === 'actions') return t.actions || 0;
  return t.collected?.length || 0;
}

// --- load ------------------------------------------------------------------

async function loadTasks() {
  try {
    const [tasksRes, pd] = await Promise.all([api('/tasks'), api('/page-details').catch(() => ({ pages: [] }))]);
    TASKS = tasksRes.tasks || [];
    detailsByUrl = new Map((pd.pages || []).map((p) => [p.url, p]));
    $('#conn').textContent = `${TASKS.length} tasks`;
    $('#conn').style.color = 'var(--mut)';
  } catch {
    $('#conn').textContent = 'Backend offline';
    $('#conn').style.color = 'var(--red)';
    TASKS = [];
  }
  renderList();
  if (selectedId) {
    const t = TASKS.find((x) => x.taskId === selectedId);
    if (t) renderPreview(t);
  }
}

// --- list ------------------------------------------------------------------

function filteredTasks() {
  const q = $('#search').value.trim().toLowerCase();
  const sf = $('#statusFilter').value;
  return TASKS.filter((t) => {
    if (sf && t.status !== sf) return false;
    if (q && !(t.goal || '').toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderList() {
  const list = $('#taskList');
  const items = filteredTasks();
  if (!items.length) { list.innerHTML = '<li class="empty">No tasks.</li>'; return; }
  list.innerHTML = items.map((t) => {
    const tg = t.plan?.target;
    const prog = tg ? `${haveOf(t)}/${tg.count} ${tg.metric}` : t.mode;
    return `
      <li class="task-item ${t.taskId === selectedId ? 'active' : ''}" data-id="${esc(t.taskId)}">
        <div class="task-goal">${esc(t.goal)}</div>
        <div class="task-meta">
          <span class="${badgeClass(t.status)}">${esc(t.status)}</span>
          <span>${esc(prog)}</span>
          <span class="grow"></span>
          <span>${esc(t.model)}</span>
        </div>
      </li>`;
  }).join('');
  list.querySelectorAll('.task-item').forEach((li) => {
    li.addEventListener('click', () => selectTask(li.getAttribute('data-id')));
  });
}

// --- preview ---------------------------------------------------------------

async function selectTask(id) {
  selectedId = id;
  dataFilter = '';
  renderList();
  const t = TASKS.find((x) => x.taskId === id) || (await api(`/tasks/${id}`)).task;
  if (t) renderPreview(t);
  scheduleRefresh(t);
}

function scheduleRefresh(t) {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  if (t && !TERMINAL.has(t.status)) {
    refreshTimer = setInterval(loadTasks, 2000); // live-follow a running task
  }
}

function collectedRows(t) {
  const q = dataFilter.trim().toLowerCase();
  const extracted = new Set(t.extracted || []);
  return (t.collected || [])
    .map((c) => ({ ...c, ...(detailsByUrl.get(c.url) || {}), _extracted: extracted.has(c.url) }))
    .filter((r) => {
      if (!q) return true;
      return [r.name, r.url, r.phone, r.email, r.website, r.category, r.address]
        .some((v) => (v || '').toLowerCase().includes(q));
    });
}

function renderPreview(t) {
  const tg = t.plan?.target;
  const end = t.finishedAt ? new Date(t.finishedAt).getTime() : Date.now();
  const elapsed = Math.max(0, Math.round((end - new Date(t.createdAt).getTime()) / 1000));

  const phases = (t.plan?.phases || [])
    .map((p, i) => `<span class="chip"><span class="i">${i + 1}</span>${esc(p.tool)}</span>`).join('') || '<span class="chip">not planned yet</span>';

  const events = (t.events || []).map((e) =>
    `<li class="${esc(e.kind)}"><span class="t">${timeOf(e.at)}</span><span class="m">${esc(e.msg)}</span></li>`).join('');

  const errorsCard = (t.errors && t.errors.length) ? `
    <div class="card errbox">
      <p class="section-title">Errors (${t.errors.length})</p>
      <ul class="timeline">${t.errors.map((e) => `<li class="err"><span class="t">${timeOf(e.at)}</span><span class="m">${esc(e.phase)}: ${esc(e.message)}</span></li>`).join('')}</ul>
    </div>` : '';

  const useSchema = !!(t.schemas && t.schemas.length);
  let dataCard;
  if (useSchema) {
    // Records live in the task's schema collection(s); loaded async below.
    dataCard = `
      <div class="card">
        <div class="data-head">
          <p class="section-title">Collected data — ${esc(t.schemas.map((s) => s.name).join(', '))}</p>
          <span class="grow"></span>
          <input id="dataFilter" class="input" style="max-width:220px" placeholder="Filter records…" value="${esc(dataFilter)}" />
        </div>
        <div id="schemaData" class="table-wrap"><span class="mut">Loading…</span></div>
      </div>`;
  } else {
    const rows = collectedRows(t);
    const hasDetails = rows.some((r) => r.phone || r.email || r.website);
    dataCard = `
      <div class="card">
        <div class="data-head">
          <p class="section-title">Collected data</p>
          <span class="count-pill">${rows.length} shown</span>
          <span class="grow"></span>
          <input id="dataFilter" class="input" style="max-width:220px" placeholder="Filter collected…" value="${esc(dataFilter)}" />
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Name</th><th>URL</th>${hasDetails ? '<th>Phone</th><th>Email</th><th>Website</th>' : ''}<th></th>
            </tr></thead>
            <tbody>
              ${rows.map((r) => `<tr>
                <td>${esc(r.name || '')}</td>
                <td><a href="${esc(r.url)}" target="_blank">${esc((r.url || '').replace(/^https?:\/\/(www\.)?/, ''))}</a></td>
                ${hasDetails ? `<td>${esc(r.phone || '')}</td><td>${esc(r.email || '')}</td><td>${r.website ? `<a href="${esc(r.website)}" target="_blank">link</a>` : ''}</td>` : ''}
                <td>${r._extracted ? '<span class="tag ex">extracted</span>' : '<span class="tag">link</span>'}</td>
              </tr>`).join('') || `<tr><td colspan="6" class="mut">No collected items${dataFilter ? ' match the filter' : ' yet'}.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  $('#preview').innerHTML = `
    <div class="card">
      <div class="p-head">
        <div>
          <div class="p-goal">${esc(t.goal)}</div>
          <div class="p-sub">
            <span>${esc(t.model)}</span>
            <span>${esc(t.mode)}</span>
            <span>${elapsed}s</span>
            ${tg ? `<span>${haveOf(t)}/${tg.count} ${esc(tg.metric)}</span>` : ''}
            ${useSchema ? `<span>schema: ${esc(t.schemas.map((s) => s.name).join(', '))}</span>` : ''}
            <span>${dateOf(t.createdAt)}</span>
          </div>
        </div>
        <span class="${badgeClass(t.status)}">${esc(t.status)}</span>
        <button id="deleteBtn" class="btn sm danger">Delete</button>
      </div>
    </div>

    <div class="card">
      <p class="section-title">Plan (${(t.plan?.phases || []).length} phases)</p>
      <div class="phases">${phases}</div>
    </div>

    ${errorsCard}

    <div class="card">
      <p class="section-title">Activity</p>
      <ul class="timeline">${events || '<li class="mut">No activity.</li>'}</ul>
    </div>

    ${dataCard}

    <div class="card" id="debugCard">
      <div class="data-head">
        <p class="section-title">Debug — matched items</p>
        <span class="grow"></span>
        <button id="debugToggle" class="btn sm">Load</button>
      </div>
      <div id="debugData"><span class="mut">Each collected item's extracted row next to its raw HTML. Click Load.</span></div>
    </div>
  `;

  const fi = $('#dataFilter');
  if (fi) {
    fi.addEventListener('input', (e) => {
      dataFilter = e.target.value;
      if (useSchema) loadSchemaData(t);                                   // just refilter the records table
      else renderPreview(TASKS.find((x) => x.taskId === selectedId) || t); // generic path re-renders
    });
    // keep focus/caret while typing across re-renders
    fi.focus(); fi.setSelectionRange(fi.value.length, fi.value.length);
  }
  $('#deleteBtn').addEventListener('click', () => deleteTask(t.taskId));
  $('#debugToggle').addEventListener('click', () => loadDebugItems(t.taskId));

  if (useSchema) loadSchemaData(t);
}

// --- debug view ------------------------------------------------------------
// Per-task: each matched item's extracted row next to a collapsible HTML snippet.
async function loadDebugItems(taskId) {
  const el = document.getElementById('debugData');
  if (!el) return;
  el.innerHTML = '<span class="mut">Loading…</span>';
  let items = [];
  try {
    const j = await api(`/tasks/${taskId}/debug-items`);
    items = j.items || j.debugItems || [];
  } catch { el.innerHTML = '<span class="err-txt">Failed to load.</span>'; return; }
  if (!items.length) {
    el.innerHTML = '<span class="mut">No debug items. Run a collect_by_skill task, then reload.</span>';
    return;
  }
  el.innerHTML = items.map((it) => {
    const data = it.data || {};
    const keys = Object.keys(data);
    const rows = keys.length
      ? keys.map((k) => `<tr><td class="dk">${esc(k)}</td><td>${data[k] === '' || data[k] == null ? '<span class="empty-cell">— empty</span>' : esc(data[k])}</td></tr>`).join('')
      : '<tr><td colspan="2" class="empty-cell">— no fields extracted</td></tr>';
    const sourceBlock = it.text ? `
        <details class="html-det" open>
          <summary>Container inner text · _sourceText (${it.text.length} chars)</summary>
          <pre class="html-pre src">${esc(it.text)}</pre>
        </details>` : '';
    return `
      <div class="debug-item">
        <div class="debug-head">#${it.index}</div>
        <table class="kv"><tbody>${rows}</tbody></table>
        ${sourceBlock}
        <details class="html-det">
          <summary>Raw HTML (${(it.html || '').length} chars)</summary>
          <pre class="html-pre">${esc(it.html || '')}</pre>
        </details>
      </div>`;
  }).join('');
}

// Render the task's schema record table(s) into #schemaData (respects the filter).
const isHttpUrl = (s) => /^https?:\/\//i.test(s);
const looksImage = (s) => isHttpUrl(s) && (/\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/i.test(s) || /scontent|fbcdn|cdninstagram|\/image|imgur/i.test(s));

// A short, human title for a link (last path segment / ?id=… / hostname).
function linkTitle(u) {
  try {
    const url = new URL(u);
    if (url.searchParams.get('id')) return 'id=' + url.searchParams.get('id');
    let seg = url.pathname.split('/').filter(Boolean).pop() || url.hostname.replace(/^www\./, '');
    seg = decodeURIComponent(seg).replace(/\.(php|html?)$/i, '');
    return seg.length > 32 ? seg.slice(0, 32) + '…' : seg;
  } catch { return String(u).slice(0, 32); }
}

function schemaCell(f, v) {
  if (v == null || v === '') return '';
  const s = String(v);
  const isImg = f.type === 'image' || /image|photo|picture|avatar|thumb/i.test(f.key || '') || looksImage(s);
  if (isImg && isHttpUrl(s)) {
    return `<a class="imgcell" href="${esc(s)}" target="_blank" title="Open image"><img src="${esc(s)}" loading="lazy" alt="" /></a>`;
  }
  if (f.type === 'url' || f.type === 'link' || isHttpUrl(s)) {
    return `<span class="linkcell"><a href="${esc(s)}" target="_blank" title="${esc(s)}">${esc(linkTitle(s))}</a>` +
      `<button class="copybtn" data-copy="${esc(s)}" title="Copy link">⧉</button></span>`;
  }
  if (f.type === 'email') return `<a href="mailto:${esc(s)}">${esc(s)}</a>`;
  return esc(s);
}

async function loadSchemaData(t) {
  const el = document.getElementById('schemaData');
  if (!el) return;
  const q = dataFilter.trim().toLowerCase();
  const blocks = [];
  for (const s of t.schemas) {
    let recs = [], fields = s.fields;
    try {
      const j = await api(`/schemas/${s.schemaId}/records?taskId=${encodeURIComponent(t.taskId)}`);
      recs = j.records || []; fields = j.fields || s.fields;
    } catch {}
    const rows = recs.filter((r) => !q || fields.some((f) => String(r[f.key] ?? '').toLowerCase().includes(q)));
    const head = `<tr>${fields.map((f) => `<th>${esc(f.label || f.key)}</th>`).join('')}</tr>`;
    const body = rows.map((r) => `<tr>${fields.map((f) => `<td>${schemaCell(f, r[f.key])}</td>`).join('')}</tr>`).join('')
      || `<tr><td colspan="${fields.length}" class="mut">No records${dataFilter ? ' match the filter' : ' yet'}.</td></tr>`;
    const title = t.schemas.length > 1
      ? `<p class="section-title" style="margin-top:6px">${esc(s.name)} — ${rows.length}</p>`
      : `<div class="count-pill" style="margin-bottom:6px">${rows.length} records</div>`;
    blocks.push(title + `<table><thead>${head}</thead><tbody>${body}</tbody></table>`);
  }
  el.innerHTML = blocks.join('');
}

async function deleteTask(id) {
  if (!confirm('Delete this task and its saved state? (Collected pages in the CRM are not removed.)')) return;
  await api(`/tasks/${id}`, { method: 'DELETE' });
  if (selectedId === id) { selectedId = null; $('#preview').innerHTML = '<div class="empty">Select a task to preview.</div>'; }
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
  loadTasks();
}

// --- boot ------------------------------------------------------------------

$('#search').addEventListener('input', renderList);
$('#statusFilter').addEventListener('change', renderList);
$('#refreshBtn').addEventListener('click', loadTasks);

// Copy-link buttons (delegated — the data table re-renders often).
document.addEventListener('click', async (e) => {
  const b = e.target.closest('.copybtn');
  if (!b) return;
  e.preventDefault();
  try { await navigator.clipboard.writeText(b.getAttribute('data-copy') || ''); } catch {}
  const prev = b.textContent; b.textContent = '✓'; b.classList.add('ok');
  setTimeout(() => { b.textContent = prev; b.classList.remove('ok'); }, 1000);
});

loadTasks();
