// Browser Agent — schema manager.
// Create named data schemas (each becomes its own Mongo collection) and delete
// them. Tasks pick schemas to save collected data into; a task with none gets
// one auto-created by the planner.

const BACKEND_URL = 'http://localhost:4000';
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const api = (path, opts) => fetch(`${BACKEND_URL}${path}`, opts).then((r) => r.json());

const TYPES = ['text', 'url', 'email', 'phone', 'number', 'date'];
const FB_PRESET = [
  ['name', 'Name', 'text'], ['url', 'Facebook URL', 'url'], ['category', 'Category', 'text'],
  ['followers', 'Followers', 'text'], ['phone', 'Phone', 'phone'], ['email', 'Email', 'email'],
  ['website', 'Website', 'url'], ['address', 'Address', 'text'], ['bio', 'Bio', 'text'],
  ['instagram', 'Instagram', 'url'], ['tiktok', 'TikTok', 'url'],
];

function fieldRow(key = '', label = '', type = 'text') {
  const row = document.createElement('div');
  row.className = 'field-row';
  row.innerHTML = `
    <input class="input f-key" placeholder="key" value="${esc(key)}" />
    <input class="input f-label" placeholder="label" value="${esc(label)}" />
    <select class="select f-type">${TYPES.map((t) => `<option ${t === type ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <button class="btn xs f-del" title="Remove">✕</button>`;
  row.querySelector('.f-del').addEventListener('click', () => row.remove());
  return row;
}

function readFields() {
  return [...document.querySelectorAll('#fields .field-row')].map((r) => ({
    key: r.querySelector('.f-key').value.trim(),
    label: r.querySelector('.f-label').value.trim(),
    type: r.querySelector('.f-type').value,
  })).filter((f) => f.key);
}

function setFields(rows) {
  const box = $('#fields');
  box.innerHTML = '';
  rows.forEach(([k, l, t]) => box.appendChild(fieldRow(k, l, t)));
}

// --- create ----------------------------------------------------------------

async function createSchema() {
  const name = $('#name').value.trim();
  const fields = readFields();
  const msg = $('#formMsg');
  if (!name) { msg.textContent = 'Name required.'; return; }
  if (!fields.length) { msg.textContent = 'Add at least one field.'; return; }
  msg.textContent = 'Creating…';
  const res = await api('/schemas', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, fields }),
  }).catch(() => null);
  if (res && res.ok) {
    msg.textContent = 'Created ✓';
    $('#name').value = '';
    setFields([['', '', 'text']]);
    loadSchemas();
    setTimeout(() => (msg.textContent = ''), 1500);
  } else {
    msg.textContent = (res && res.error) || 'Failed.';
  }
}

// --- list ------------------------------------------------------------------

async function loadSchemas() {
  let schemas = [];
  try { schemas = (await api('/schemas')).schemas || []; $('#conn').textContent = `${schemas.length} schemas`; }
  catch { $('#conn').textContent = 'Backend offline'; }

  // fetch record counts in parallel
  const counts = await Promise.all(schemas.map((s) =>
    api(`/schemas/${s.schemaId}/records`).then((r) => (r.records || []).length).catch(() => 0)));

  const list = $('#list');
  if (!schemas.length) { list.innerHTML = '<div class="empty">No schemas yet.</div>'; return; }
  list.innerHTML = schemas.map((s, i) => `
    <div class="schema-card">
      <div class="sc-head">
        <div class="sc-name">${esc(s.name)}</div>
        <span class="sc-count">${counts[i]} records</span>
        <button class="btn xs danger" data-id="${esc(s.schemaId)}">Delete</button>
      </div>
      <div class="sc-coll">${esc(s.dataCollection)}</div>
      <div class="sc-fields">${s.fields.map((f) => `<span class="chip">${esc(f.key)}<span class="ct">${esc(f.type)}</span></span>`).join('')}</div>
    </div>`).join('');
  list.querySelectorAll('.danger[data-id]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('Delete this schema and all its collected records?')) return;
      await api(`/schemas/${b.getAttribute('data-id')}`, { method: 'DELETE' });
      loadSchemas();
    });
  });
}

// --- boot ------------------------------------------------------------------

$('#addField').addEventListener('click', () => $('#fields').appendChild(fieldRow()));
$('#presetFb').addEventListener('click', () => { $('#name').value = $('#name').value || 'FB Pages'; setFields(FB_PRESET); });
$('#createBtn').addEventListener('click', createSchema);
setFields([['', '', 'text']]);
loadSchemas();
