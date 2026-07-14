// Browser Agent — skills manager.
// Two-step model (docs/skill-redesign-plan.md):
//   ELEMENTS — introduced page features (name/route/details editable here,
//   live health check against an open tab, guarded delete). Repointing is done
//   in the on-page learning overlay.
//   SKILLS — legacy one-shot skills (fully editable, unchanged) and v2 skills
//   (bundles of element references: edit name/details/pattern + the element
//   set; selectors live on the elements).

const BACKEND_URL = 'http://localhost:4000';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (path, opts) => fetch(`${BACKEND_URL}${path}`, opts).then((r) => r.json());

let SKILLS = [];
let ELEMENTS = [];
let PROMPTS = [];
let COLLECTIONS = [];   // legacy collection skills, for the clone-target dropdown
let HEALTH = {};        // elementId -> match count from the last live check
const elemById = () => new Map(ELEMENTS.map((e) => [e.elementId, e]));

async function load() {
  try {
    const [sk, el, pr] = await Promise.all([
      api('/skills'),
      api('/elements').catch(() => ({ elements: [] })),
      api('/prompts').catch(() => ({ prompts: [] })),
    ]);
    SKILLS = sk.skills || [];
    ELEMENTS = el.elements || [];
    PROMPTS = pr.prompts || [];
    $('#conn').textContent = `${SKILLS.length} skills · ${ELEMENTS.length} elements · ${PROMPTS.length} prompts`;
    $('#conn').style.color = 'var(--mut)';
  } catch {
    $('#conn').textContent = 'Backend offline';
    $('#conn').style.color = 'var(--red)';
    SKILLS = []; ELEMENTS = []; PROMPTS = [];
  }
  render();
}

const q = () => $('#search').value.trim().toLowerCase();

function filteredSkills() {
  if (!q()) return SKILLS;
  return SKILLS.filter((s) => [s.name, s.host, s.urlPattern, s.kind, s.action, s.details].some((v) => (v || '').toLowerCase().includes(q())));
}
function filteredElements() {
  if (!q()) return ELEMENTS;
  return ELEMENTS.filter((e) => [e.name, e.host, e.route, e.type, e.details].some((v) => (v || '').toLowerCase().includes(q())));
}

function render() {
  COLLECTIONS = SKILLS.filter((s) => s.kind === 'collection' && !isV2(s));
  renderPrompts();
  renderElements();
  renderSkills();
}

// ========================== SYSTEM PROMPTS panel =============================
// Standing instructions attachable to tasks. A prompt bundles skills — picking
// the prompt in the popup selects those skills too.

function renderPrompts() {
  const box = $('#prompts');
  if (!PROMPTS.length) { box.innerHTML = '<div class="empty">No system prompts yet — click “＋ New prompt”.</div>'; return; }
  box.innerHTML = PROMPTS.map((p) => `
    <div class="card prompt-card" data-id="${esc(p.promptId)}">
      <div class="row">
        <input class="input pname" value="${esc(p.name)}" placeholder="Prompt name" />
        <button class="btn xs save-prompt">Save</button>
        <button class="btn xs danger del-prompt">Delete</button>
      </div>
      <label class="pat-lbl">Instructions (sent to the planner with every task using this prompt)</label>
      <textarea class="pcontent" rows="4" placeholder="e.g. Always work on facebook.com. Prefer the collect_feed_posts skill. Never open new tabs.">${esc(p.content || '')}</textarea>
      <label class="pat-lbl">Bundled skills (auto-selected when this prompt is used)</label>
      <div class="pskills">
        ${SKILLS.map((s) => `<label class="pskill"><input type="checkbox" value="${esc(s.skillId)}" ${(p.skillIds || []).includes(s.skillId) ? 'checked' : ''}/> ${esc(s.name)}</label>`).join('') || '<span class="mut">No skills yet.</span>'}
      </div>
    </div>`).join('');
  box.querySelectorAll('.save-prompt').forEach((b) => b.addEventListener('click', () => savePrompt(b.closest('.prompt-card'))));
  box.querySelectorAll('.del-prompt').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this system prompt?')) return;
    await api(`/prompts/${b.closest('.prompt-card').getAttribute('data-id')}`, { method: 'DELETE' });
    load();
  }));
}

async function savePrompt(card) {
  const id = card.getAttribute('data-id');
  const patch = {
    name: card.querySelector('.pname').value.trim() || 'Untitled prompt',
    content: card.querySelector('.pcontent').value,
    skillIds: [...card.querySelectorAll('.pskills input:checked')].map((c) => c.value),
  };
  const btn = card.querySelector('.save-prompt');
  btn.textContent = 'Saving…';
  await api(`/prompts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  btn.textContent = 'Saved ✓';
  setTimeout(load, 500);
}

// ============================ ELEMENTS panel =================================

function healthTag(id) {
  if (!(id in HEALTH)) return '';
  const n = HEALTH[id];
  return `<span class="health ${n ? 'ok' : 'bad'}">${n ? n + '× on page' : 'BROKEN — repoint it'}</span>`;
}

function elementCard(e) {
  const byId = elemById();
  const parent = e.parentId ? byId.get(e.parentId) : null;
  const sel = (e.selectors && e.selectors[0] && (e.selectors[0].value || e.selectors[0].text)) || '';
  const extra = (e.type === 'field')
    ? `<select class="eattr">${['text', 'innerText', 'href', 'src'].map((a) => `<option ${a === e.attr ? 'selected' : ''}>${a}</option>`).join('')}</select>`
    : (e.type === 'action' || e.type === 'input')
      ? `<select class="eact">${['click', 'type', 'press', 'read', 'hover', 'scroll'].map((a) => `<option ${a === e.action ? 'selected' : ''}>${a}</option>`).join('')}</select>`
      : '';
  return `
    <div class="card el-card" data-id="${esc(e.elementId)}">
      <div class="row">
        <input class="input ename" value="${esc(e.name)}" />
        <span class="badge ${e.type === 'item' || e.type === 'container' ? 'collection' : 'action'}">${esc(e.type)}</span>
        ${extra}
        ${healthTag(e.elementId)}
        <span style="flex:1"></span>
        <button class="btn xs save-el">Save</button>
        <button class="btn xs danger del-el">Delete</button>
      </div>
      <div class="el-grid">
        <div><label class="pat-lbl">Route pattern</label><input class="input eroute" value="${esc(e.route)}" /></div>
        <div><label class="pat-lbl">Details (the planner reads this)</label><input class="input edetails" value="${esc(e.details || '')}" /></div>
      </div>
      <div class="sel mut">${parent ? `inside <b>${esc(parent.name)}</b> · ` : ''}v${e.version || 1} · <code>${esc(sel)}</code></div>
    </div>`;
}

function renderElements() {
  const box = $('#elements');
  const items = filteredElements();
  if (!items.length) {
    box.innerHTML = '<div class="empty">No elements yet. Use “Start learning session” → tab “1 · Introduce”.</div>';
    return;
  }
  const byHost = {};
  for (const e of items) (byHost[e.host] = byHost[e.host] || []).push(e);
  box.innerHTML = Object.entries(byHost).map(([host, list]) => {
    const byRoute = {};
    for (const e of list) (byRoute[e.route] = byRoute[e.route] || []).push(e);
    return `
    <div class="host-group">
      <div class="host-title">${esc(host)}
        <button class="btn xs check-host" data-host="${esc(host)}" title="Resolve every element on an open ${esc(host)} tab">🧪 Check on live tab</button>
        <span class="mut check-out" data-host="${esc(host)}"></span>
      </div>
      ${Object.entries(byRoute).map(([route, els]) => `<div class="route-title"><code>${esc(route)}</code></div>` + els.map(elementCard).join('')).join('')}
    </div>`;
  }).join('');

  box.querySelectorAll('.save-el').forEach((b) => b.addEventListener('click', () => saveElement(b.closest('.el-card'))));
  box.querySelectorAll('.del-el').forEach((b) => b.addEventListener('click', () => deleteElement(b.closest('.el-card'))));
  box.querySelectorAll('.check-host').forEach((b) => b.addEventListener('click', () => checkHost(b.getAttribute('data-host'))));
}

async function saveElement(card) {
  const id = card.getAttribute('data-id');
  const patch = {
    name: card.querySelector('.ename').value.trim(),
    route: card.querySelector('.eroute').value.trim(),
    details: card.querySelector('.edetails').value.trim(),
  };
  const attr = card.querySelector('.eattr'); if (attr) patch.attr = attr.value;
  const act = card.querySelector('.eact'); if (act) patch.action = act.value;
  const btn = card.querySelector('.save-el');
  btn.textContent = 'Saving…';
  await api(`/elements/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  btn.textContent = 'Saved ✓';
  setTimeout(load, 500);
}

async function deleteElement(card) {
  const id = card.getAttribute('data-id');
  const e = ELEMENTS.find((x) => x.elementId === id);
  if (!confirm(`Delete element "${e?.name || id}"?`)) return;
  const res = await fetch(`${BACKEND_URL}/elements/${id}`, { method: 'DELETE' });
  if (res.status === 409) {
    const j = await res.json().catch(() => ({}));
    const names = (j.skills || []).map((s) => s.name).join(', ');
    if (!confirm(`This element is used by: ${names}.\nDelete anyway and remove it from those skills?`)) return;
    await fetch(`${BACKEND_URL}/elements/${id}?force=1`, { method: 'DELETE' });
  }
  load();
}

// Live health check: resolve this host's elements on one of its open tabs.
function checkHost(host) {
  const out = document.querySelector(`.check-out[data-host="${CSS.escape(host)}"]`);
  out.textContent = 'checking…';
  const els = ELEMENTS.filter((e) => e.host === host);
  chrome.runtime.sendMessage({ type: 'RESOLVE_ELEMENTS_HOST', host, elements: els }, (r) => {
    if (!r || !r.ok) { out.textContent = (r && r.error) || 'failed'; return; }
    Object.assign(HEALTH, r.counts || {});
    const broken = els.filter((e) => !HEALTH[e.elementId]).length;
    out.textContent = `checked on ${r.url ? new URL(r.url).pathname : 'tab'} — ${broken ? broken + ' broken' : 'all resolve ✓'}`;
    renderElements();
  });
}

// ============================= SKILLS panel ==================================

const isV2 = (s) => Array.isArray(s.elements) && s.elements.length;

function renderSkills() {
  const items = filteredSkills();
  const list = $('#list');
  if (!items.length) { list.innerHTML = '<div class="empty">No skills yet. Use “Start learning session” in the popup to teach one.</div>'; return; }

  const byHost = {};
  for (const s of items) (byHost[s.host] = byHost[s.host] || []).push(s);

  list.innerHTML = Object.entries(byHost).map(([host, skills]) => `
    <div class="host-group">
      <div class="host-title">${esc(host)}</div>
      ${skills.map(skillCard).join('')}
    </div>`).join('');

  list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this skill?')) return;
    await api(`/skills/${b.getAttribute('data-del')}`, { method: 'DELETE' });
    load();
  }));
  list.querySelectorAll('.save-skill').forEach((b) => b.addEventListener('click', () => saveSkillEdits(b.closest('.card'))));
  list.querySelectorAll('.delfield').forEach((b) => b.addEventListener('click', () => b.closest('.efield').remove()));
  list.querySelectorAll('.addfield').forEach((b) => b.addEventListener('click', () => {
    const box = b.parentElement.querySelector('.efields');
    box.insertAdjacentHTML('beforeend', fieldRow({ name: 'new_field', attr: 'text', selectors: [] }));
    box.lastElementChild.querySelector('.delfield').addEventListener('click', (e) => e.target.closest('.efield').remove());
  }));
  list.querySelectorAll('.clone-btn').forEach((b) => b.addEventListener('click', () => {
    const sel = b.parentElement.querySelector('.clone-target');
    cloneToCollection(b.getAttribute('data-src'), sel.value);
  }));
  // v2: remove an element ref / add one from the host's elements
  list.querySelectorAll('.ref-del').forEach((b) => b.addEventListener('click', () => b.closest('.ref-chip').remove()));
  list.querySelectorAll('.ref-add').forEach((b) => b.addEventListener('click', () => {
    const card = b.closest('.card');
    const sel = card.querySelector('.ref-pick');
    const id = sel.value;
    if (!id) return;
    const e = elemById().get(id);
    if (!e || card.querySelector(`.ref-chip[data-eid="${CSS.escape(id)}"]`)) return;
    card.querySelector('.refs').insertAdjacentHTML('beforeend', refChip(e));
    card.querySelector(`.ref-chip[data-eid="${CSS.escape(id)}"] .ref-del`).addEventListener('click', (ev) => ev.target.closest('.ref-chip').remove());
  }));
}

// v2 skills: persist name/pattern/details + the element reference set.
// Legacy skills keep the original inline editors.
async function saveSkillEdits(card) {
  const id = card.getAttribute('data-id');
  const skill = SKILLS.find((s) => s.skillId === id);
  if (!skill) return;
  const patch = { name: card.querySelector('.name').value.trim(), urlPattern: card.querySelector('.pat').value.trim() };
  if (isV2(skill)) {
    patch.details = card.querySelector('.details').value.trim();
    patch.elements = [...card.querySelectorAll('.ref-chip')].map((c, i) => ({ elementId: c.getAttribute('data-eid'), order: i }));
    if (!patch.elements.length) { alert('A v2 skill needs at least one element.'); return; }
  } else if (skill.kind === 'collection') {
    patch.item = { selectors: [{ strategy: 'css', value: card.querySelector('.itemsel').value.trim(), score: 60 }] };
    patch.fields = [...card.querySelectorAll('.efield')].map((row) => ({
      name: (row.querySelector('.fname').value.trim() || 'field'),
      attr: row.querySelector('.fattr').value,
      selectors: [{ strategy: 'css', value: row.querySelector('.fsel').value.trim(), score: 50 }],
    })).filter((f) => f.selectors[0].value);
  } else {
    patch.action = card.querySelector('.act').value;
  }
  const btn = card.querySelector('.save-skill');
  btn.textContent = 'Saving…';
  await api(`/skills/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  btn.textContent = 'Saved ✓';
  setTimeout(load, 500);
}

// Append a legacy action skill to a legacy collection skill as a new field.
async function cloneToCollection(srcId, targetId) {
  const src = SKILLS.find((s) => s.skillId === srcId);
  const target = SKILLS.find((s) => s.skillId === targetId);
  if (!src || !target) return;
  const field = {
    name: (src.name.replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_+|_+$/g, '').slice(0, 40) || 'field'),
    attr: src.action === 'click' ? 'click' : 'text',
    selectors: src.selectors || [],
  };
  const fields = [...(target.fields || []), field];
  await api(`/skills/${targetId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
  load();
}

// One editable field row (name / attr / primary selector / remove).
function fieldRow(f) {
  const primary = (f.selectors && f.selectors[0] && f.selectors[0].value) || '';
  return `<div class="efield">
    <input class="fname" value="${esc(f.name)}" placeholder="name" />
    <select class="fattr">${['text', 'innerText', 'href', 'src', 'click'].map((a) => `<option ${a === f.attr ? 'selected' : ''}>${a}</option>`).join('')}</select>
    <input class="fsel" value="${esc(primary)}" placeholder="css selector (relative to item)" />
    <button class="delfield" title="Remove">✕</button>
  </div>`;
}

function refChip(e) {
  return `<span class="ref-chip" data-eid="${esc(e.elementId)}">
    ${esc(e.name)} <span class="ct">${esc(e.type)}${healthDotHtml(e.elementId)}</span>
    <button class="ref-del" title="Remove from skill">✕</button>
  </span>`;
}
function healthDotHtml(id) {
  if (!(id in HEALTH)) return '';
  return HEALTH[id] ? ' <b style="color:var(--green)">●</b>' : ' <b style="color:var(--red)">●</b>';
}

function skillCard(s) {
  if (isV2(s)) {
    const byId = elemById();
    const refs = s.elements
      .slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((r) => byId.get(r.elementId)).filter(Boolean);
    const addable = ELEMENTS.filter((e) => e.host === s.host);
    return `
    <div class="card" data-id="${esc(s.skillId)}">
      <div class="row">
        <input class="input name" value="${esc(s.name)}" />
        <span class="badge collection">v2 · ${refs.length} elements</span>
        <button class="btn xs save-skill">Save</button>
        <button class="btn xs danger" data-del="${esc(s.skillId)}">Delete</button>
      </div>
      <label class="pat-lbl">URL pattern</label>
      <input class="input pat" value="${esc(s.urlPattern)}" />
      <label class="pat-lbl">Details (the planner reads this)</label>
      <input class="input details" value="${esc(s.details || '')}" placeholder="What this skill is for…" />
      <label class="pat-lbl">Elements (selectors are edited on the elements above)</label>
      <div class="refs">${refs.map(refChip).join('')}</div>
      ${addable.length ? `
      <div class="clone-row">
        <span class="mut">Add element:</span>
        <select class="ref-pick clone-target">${addable.map((e) => `<option value="${esc(e.elementId)}">${esc(e.name)} (${esc(e.type)})</option>`).join('')}</select>
        <button class="btn xs ref-add">＋ Add</button>
      </div>` : ''}
    </div>`;
  }
  const editable = s.kind === 'collection' ? `
      <label class="pat-lbl">Item selector (the repeating element)</label>
      <input class="input itemsel" value="${esc(s.item?.selectors?.[0]?.value || '')}" />
      <label class="pat-lbl">Fields</label>
      <div class="efields">${(s.fields || []).map(fieldRow).join('')}</div>
      <button class="btn xs addfield">+ Add field</button>`
    : `
      <label class="pat-lbl">Action</label>
      <select class="act">${['click', 'scroll', 'type', 'press', 'read', 'hover'].map((a) => `<option ${a === s.action ? 'selected' : ''}>${a}</option>`).join('')}</select>
      <div class="sel mut">${(s.selectors || []).slice(0, 2).map((x) => `<code>${esc(x.strategy === 'css' ? x.value : x.strategy + ':' + (x.text || x.role || ''))}</code>`).join(' · ')}</div>`;
  return `
    <div class="card" data-id="${esc(s.skillId)}">
      <div class="row">
        <input class="input name" value="${esc(s.name)}" />
        <span class="badge ${s.kind}">${esc(s.kind)}</span>
        <button class="btn xs save-skill">Save</button>
        <button class="btn xs danger" data-del="${esc(s.skillId)}">Delete</button>
      </div>
      <label class="pat-lbl">URL pattern</label>
      <input class="input pat" value="${esc(s.urlPattern)}" />
      ${editable}
      ${s.kind === 'action' && COLLECTIONS.length ? `
        <div class="clone-row">
          <span class="mut">Clone into collection:</span>
          <select class="clone-target">${COLLECTIONS.map((c) => `<option value="${esc(c.skillId)}">${esc(c.name)}</option>`).join('')}</select>
          <button class="btn xs clone-btn" data-src="${esc(s.skillId)}">→ Add as field</button>
        </div>` : ''}
    </div>`;
}

$('#search').addEventListener('input', render);
$('#newPrompt').addEventListener('click', async () => {
  await api('/prompts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'New prompt', content: '', skillIds: [] }) });
  load();
});
load();
