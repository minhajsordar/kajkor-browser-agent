// Browser Agent — skills manager. View / rename / re-scope / delete learned
// page skills. (Teaching happens in the in-page learning overlay.)

const BACKEND_URL = 'http://localhost:4000';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (path, opts) => fetch(`${BACKEND_URL}${path}`, opts).then((r) => r.json());

let SKILLS = [];
let COLLECTIONS = [];   // collection skills, for the clone-target dropdown

async function load() {
  try { SKILLS = (await api('/skills')).skills || []; $('#conn').textContent = `${SKILLS.length} skills`; $('#conn').style.color = 'var(--mut)'; }
  catch { $('#conn').textContent = 'Backend offline'; $('#conn').style.color = 'var(--red)'; SKILLS = []; }
  render();
}

function filtered() {
  const q = $('#search').value.trim().toLowerCase();
  if (!q) return SKILLS;
  return SKILLS.filter((s) => [s.name, s.host, s.urlPattern, s.kind, s.action].some((v) => (v || '').toLowerCase().includes(q)));
}

function render() {
  const items = filtered();
  COLLECTIONS = SKILLS.filter((s) => s.kind === 'collection');
  if (!items.length) { $('#list').innerHTML = '<div class="empty">No skills yet. Use “Start learning session” in the popup to teach one.</div>'; return; }

  // group by host
  const byHost = {};
  for (const s of items) (byHost[s.host] = byHost[s.host] || []).push(s);

  $('#list').innerHTML = Object.entries(byHost).map(([host, list]) => `
    <div class="host-group">
      <div class="host-title">${esc(host)}</div>
      ${list.map(skillCard).join('')}
    </div>`).join('');

  $('#list').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this skill?')) return;
    await api(`/skills/${b.getAttribute('data-del')}`, { method: 'DELETE' });
    load();
  }));
  $('#list').querySelectorAll('.save-skill').forEach((b) => b.addEventListener('click', () => saveSkillEdits(b.closest('.card'))));
  $('#list').querySelectorAll('.delfield').forEach((b) => b.addEventListener('click', () => b.closest('.efield').remove()));
  $('#list').querySelectorAll('.addfield').forEach((b) => b.addEventListener('click', () => {
    const box = b.parentElement.querySelector('.efields');
    box.insertAdjacentHTML('beforeend', fieldRow({ name: 'new_field', attr: 'text', selectors: [] }));
    box.lastElementChild.querySelector('.delfield').addEventListener('click', (e) => e.target.closest('.efield').remove());
  }));
  $('#list').querySelectorAll('.clone-btn').forEach((b) => b.addEventListener('click', () => {
    const sel = b.parentElement.querySelector('.clone-target');
    cloneToCollection(b.getAttribute('data-src'), sel.value);
  }));
}

// Persist inline edits: name, urlPattern, item selector, fields (or action).
async function saveSkillEdits(card) {
  const id = card.getAttribute('data-id');
  const skill = SKILLS.find((s) => s.skillId === id);
  if (!skill) return;
  const patch = { name: card.querySelector('.name').value.trim(), urlPattern: card.querySelector('.pat').value.trim() };
  if (skill.kind === 'collection') {
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

// Append an action skill to a collection skill as a new field.
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

function skillCard(s) {
  const editable = s.kind === 'collection' ? `
      <label class="pat-lbl">Item selector (the repeating element)</label>
      <input class="input itemsel" value="${esc(s.item?.selectors?.[0]?.value || '')}" />
      <label class="pat-lbl">Fields</label>
      <div class="efields">${(s.fields || []).map(fieldRow).join('')}</div>
      <button class="btn xs addfield">+ Add field</button>`
    : `
      <label class="pat-lbl">Action</label>
      <select class="act">${['click', 'scroll', 'type', 'read', 'hover'].map((a) => `<option ${a === s.action ? 'selected' : ''}>${a}</option>`).join('')}</select>
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
load();
