// Leads CRM — joins scraped page-details with CRM pipeline state and drives
// outreach (WhatsApp / Email / Messenger) with per-lead activity logging.

const BACKEND_URL = 'http://localhost:4000';
const STATUSES = ['new', 'welcomed', 'proposed', 'replied', 'followup', 'won', 'lost', 'not_lead', 'has_website'];
const RANK = { new: 0, welcomed: 1, proposed: 2, replied: 3, followup: 4, won: 5, lost: 5, not_lead: 5, has_website: 5 };
const STATUS_LABEL = {
  new: 'New', welcomed: 'Welcomed', proposed: 'Proposed', replied: 'Replied',
  followup: 'Follow-up', won: 'Won', lost: 'Lost', not_lead: 'Not a lead',
  has_website: 'Already Have Website'
};
const label = (s) => STATUS_LABEL[s] || s;

let LEADS = [];              // merged page-details + crm, by url
let selectedUrl = null;      // lead shown in the detail pane
const checked = new Set();   // urls ticked for bulk actions
let bulkStatusVal = '';      // remembered bulk-status dropdown choice
let bulkTemplateVal = '';    // remembered bulk-template dropdown choice
let actMessage = true;       // bulk action: send FB message
let actFollow = false;       // bulk action: follow on FB

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// CSP forbids inline onerror handlers, so wire image fallbacks in JS.
// data-imgfallback="none" hides via display:none; anything else via visibility.
function wireImgFallbacks(root) {
  root.querySelectorAll('img[data-imgfallback]').forEach((img) => {
    img.addEventListener('error', () => {
      if (img.dataset.imgfallback === 'none') img.style.display = 'none';
      else img.style.visibility = 'hidden';
    });
  });
}

function setConn(text, ok) {
  const el = $('#conn');
  el.textContent = text;
  el.style.color = ok ? 'var(--green)' : 'var(--red)';
}

// --- data ------------------------------------------------------------------

async function loadData() {
  setConn('Loading…', true);
  try {
    const [pd, crm] = await Promise.all([
      fetch(`${BACKEND_URL}/page-details`).then((r) => r.json()),
      fetch(`${BACKEND_URL}/crm`).then((r) => r.json())
    ]);
    const crmByUrl = new Map((crm.pages || []).map((c) => [c.url, c]));
    LEADS = (pd.pages || []).map((p) => {
      const c = crmByUrl.get(p.url) || {};
      return { ...p, status: c.status || 'new', notes: c.notes || '', activities: c.activities || [] };
    });
    setConn(`${LEADS.length} leads`, true);
  } catch (e) {
    setConn('Backend offline', false);
    LEADS = [];
  }
  renderStats();
  renderList();
  if (selectedUrl) renderDetail(LEADS.find((l) => l.url === selectedUrl));
}

// Raw POST — updates local state but does NOT re-render (used in bulk loops).
async function postCrmRaw(patch) {
  const res = await fetch(`${BACKEND_URL}/crm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  }).then((r) => r.json()).catch(() => null);
  if (res && res.ok) {
    const lead = LEADS.find((l) => l.url === patch.url);
    if (lead) {
      lead.status = res.record.status;
      lead.notes = res.record.notes;
      lead.activities = res.record.activities;
    }
  }
  return res;
}

async function postCrm(patch) {
  const res = await postCrmRaw(patch);
  if (res && res.ok) {
    renderStats();
    renderList();
    if (selectedUrl === patch.url) renderDetail(LEADS.find((l) => l.url === patch.url));
  }
  return res;
}

// --- list + stats ----------------------------------------------------------

function renderStats() {
  const counts = {};
  for (const s of STATUSES) counts[s] = 0;
  for (const l of LEADS) counts[l.status] = (counts[l.status] || 0) + 1;
  $('#stats').innerHTML = `<span class="chip">Total ${LEADS.length}</span>` +
    STATUSES.map((s) => `<span class="chip">${label(s)} ${counts[s]}</span>`).join('');
}

function filteredLeads() {
  const q = $('#search').value.trim().toLowerCase();
  const sf = $('#statusFilter').value;
  return LEADS.filter((l) => {
    if (sf && l.status !== sf) return false;
    if (!q) return true;
    return [l.name, l.category, l.phone, l.email, l.website, l.address]
      .some((v) => (v || '').toLowerCase().includes(q));
  });
}

function renderList() {
  const list = $('#leadList');
  const items = filteredLeads();
  list.innerHTML = items.map((l) => `
    <li class="lead-item ${l.url === selectedUrl ? 'active' : ''}" data-url="${esc(l.url)}">
      <input type="checkbox" class="lead-check" data-url="${esc(l.url)}" ${checked.has(l.url) ? 'checked' : ''} />
      <img class="lead-logo" src="${esc(l.logo || '')}" alt="" data-imgfallback="hide"/>
      <div class="lead-main">
        <div class="lead-name">${esc(l.name || l.url)}</div>
        <div class="lead-sub">${esc(l.category || '')}${l.followers ? ' · ' + esc(l.followers) : ''}</div>
      </div>
      <span class="badge ${l.status}">${esc(label(l.status))}</span>
    </li>`).join('') || '<li class="empty">No leads match.</li>';

  wireImgFallbacks(list);

  list.querySelectorAll('.lead-item[data-url]').forEach((li) => {
    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('lead-check')) return; // checkbox handled separately
      selectedUrl = li.getAttribute('data-url');
      renderList();
      renderDetail(LEADS.find((l) => l.url === selectedUrl));
    });
  });

  list.querySelectorAll('.lead-check').forEach((cb) => {
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', (e) => {
      const url = cb.getAttribute('data-url');
      if (e.target.checked) checked.add(url); else checked.delete(url);
      renderBulkBar();
    });
  });

  renderBulkBar();
}

// --- bulk actions ----------------------------------------------------------

function renderBulkBar() {
  const bar = $('#bulkBar');
  const n = checked.size;
  const visible = filteredLeads();
  const allChecked = visible.length > 0 && visible.every((l) => checked.has(l.url));

  if (!bulkTemplateVal) bulkTemplateVal = TEMPLATE_ORDER[0];
  const statusOptsBulk = STATUSES.map((s) => `<option value="${s}" ${s === bulkStatusVal ? 'selected' : ''}>${label(s)}</option>`).join('');
  const tmplOpts = TEMPLATE_ORDER.map((k) => `<option value="${k}" ${k === bulkTemplateVal ? 'selected' : ''}>${esc(TEMPLATES[k].label)}</option>`).join('');

  bar.innerHTML = `
    <label class="bulk-all"><input type="checkbox" id="selectAll" ${allChecked ? 'checked' : ''}/> Select all</label>
    <span class="bulk-count">${n} selected</span>
    <div style="flex:1"></div>
    <div class="row">
      <select id="bulkStatus" class="select"><option value="">Set status…</option>${statusOptsBulk}</select>
      <button id="bulkStatusBtn" class="btn sm" ${n ? '' : 'disabled'}>Apply</button>
    </div>
    <div class="row">
      <select id="bulkTemplate" class="select">${tmplOpts}</select>
    </div>
    <div class="row bulk-actions">
      <label><input type="checkbox" id="actMessage" ${actMessage ? 'checked' : ''}/> Send FB Message</label>
      <label><input type="checkbox" id="actFollow" ${actFollow ? 'checked' : ''}/> Follow on FB</label>
      <button id="bulkRunBtn" class="btn primary sm" ${n ? '' : 'disabled'}>Run Action (${n})</button>
    </div>
    <span id="bulkProgress" class="hint"></span>
  `;

  $('#selectAll').addEventListener('change', (e) => {
    if (e.target.checked) visible.forEach((l) => checked.add(l.url));
    else visible.forEach((l) => checked.delete(l.url));
    renderList();
  });

  $('#bulkStatus').addEventListener('change', (e) => { bulkStatusVal = e.target.value; });
  $('#bulkTemplate').addEventListener('change', (e) => { bulkTemplateVal = e.target.value; });
  $('#actMessage').addEventListener('change', (e) => { actMessage = e.target.checked; });
  $('#actFollow').addEventListener('change', (e) => { actFollow = e.target.checked; });
  $('#bulkStatusBtn').addEventListener('click', bulkSetStatus);
  $('#bulkRunBtn').addEventListener('click', bulkRun);
}

async function bulkSetStatus() {
  const status = bulkStatusVal || $('#bulkStatus').value;
  if (!status || !checked.size) return;
  const urls = [...checked];
  $('#bulkProgress').textContent = `Updating ${urls.length}…`;
  for (const url of urls) {
    await postCrmRaw({ url, status, activity: { channel: 'status', note: 'Bulk status → ' + status } });
  }
  $('#bulkProgress').textContent = `Updated ${urls.length}.`;
  renderStats();
  renderList();
  if (selectedUrl) renderDetail(LEADS.find((l) => l.url === selectedUrl));
}

// Run the selected FB actions (message and/or follow) on each checked lead.
// Both actions happen in ONE page visit per lead.
async function bulkRun() {
  if (!checked.size) return;
  if (!actMessage && !actFollow) { alert('Select at least one action (Send FB Message and/or Follow on FB).'); return; }
  const key = bulkTemplateVal || $('#bulkTemplate').value;
  const urls = filteredLeads().map((l) => l.url).filter((u) => checked.has(u));
  const acts = [actMessage ? 'Send Message' : null, actFollow ? 'Follow' : null].filter(Boolean).join(' + ');
  if (!confirm(`Run "${acts}" on ${urls.length} lead(s)? This performs real actions on Facebook.`)) return;

  const btn = $('#bulkRunBtn');
  btn.disabled = true;
  let ok = 0, fail = 0;
  for (let i = 0; i < urls.length; i++) {
    const lead = LEADS.find((l) => l.url === urls[i]);
    $('#bulkProgress').textContent = `Processing ${i + 1}/${urls.length} — ${lead?.name || ''}`;
    const message = actMessage ? renderMessage(key, lead).body : '';
    const res = await chrome.runtime.sendMessage({
      type: 'FB_ACTIONS', url: lead.url, doMessage: actMessage, doFollow: actFollow, message
    });
    const success = res && res.ok && (!actMessage || res.sent);
    if (success) {
      ok++;
      let status = lead.status;
      const notes = [];
      if (actMessage) { status = nextStatus(status, TEMPLATES[key]?.stage || ''); notes.push('Sent message'); }
      if (actFollow) notes.push('Follow: ' + (res.followAction || 'done'));
      await postCrmRaw({ url: lead.url, status, activity: { channel: 'messenger', type: actMessage ? key : '', note: 'Bulk — ' + notes.join(', ') } });
    } else {
      fail++;
    }
  }
  $('#bulkProgress').textContent = `Done. OK ${ok}, failed ${fail}.`;
  btn.disabled = false;
  renderStats();
  renderList();
}

// --- channel links ---------------------------------------------------------

// Normalize a Bangladeshi phone to international digits for wa.me.
function waDigits(phone) {
  let d = (phone || '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.startsWith('880')) return d;
  if (d.startsWith('0')) return '88' + d;      // 01XXXXXXXXX -> 8801XXXXXXXXX
  if (d.length === 10 && d.startsWith('1')) return '880' + d;
  return d;
}

function openWhatsApp(lead, body) {
  const d = waDigits(lead.whatsapp || lead.phone);
  if (!d) { alert('No phone/WhatsApp number for this lead.'); return false; }
  window.open(`https://wa.me/${d}?text=${encodeURIComponent(body)}`, '_blank');
  return true;
}

function openEmail(lead, subject, body) {
  if (!lead.email) { alert('No email for this lead.'); return false; }
  window.open(`mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  return true;
}

function openMessenger(lead) {
  // Open the page so you can hit Message. m.me works only for vanity usernames.
  const m = lead.url.match(/facebook\.com\/([^/?]+)/);
  const uname = m && m[1] !== 'profile.php' ? m[1] : '';
  window.open(uname ? `https://m.me/${uname}` : lead.url, '_blank');
  return true;
}

// Advance status forward only (never regress a further-along lead).
function nextStatus(current, stage) {
  if (!stage) return current;
  return (RANK[stage] ?? 0) > (RANK[current] ?? 0) ? stage : current;
}

// --- detail ----------------------------------------------------------------

function contactRows(l) {
  const rows = [];
  const add = (k, v) => v && rows.push(`<div class="k">${k}</div><div>${v}</div>`);
  add('Followers', esc(l.followers));
  add('Phone', l.phone ? `<a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>` : '');
  add('WhatsApp', esc(l.whatsapp));
  add('Email', l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : '');
  add('Website', l.website ? `<a href="${esc(l.website)}" target="_blank">${esc(l.website)}</a>` : '');
  add('Address', esc(l.address));
  add('Instagram', l.instagram ? `<a href="${esc(l.instagram)}" target="_blank">${esc(l.instagram)}</a>` : '');
  add('TikTok', l.tiktok ? `<a href="${esc(l.tiktok)}" target="_blank">${esc(l.tiktok)}</a>` : '');
  add('Facebook', `<a href="${esc(l.url)}" target="_blank">Open page</a>`);
  return rows.join('');
}

function renderDetail(lead) {
  const pane = $('#detail');
  if (!lead) { pane.innerHTML = '<div class="empty">Select a lead to view details.</div>'; return; }

  const tmplOptions = TEMPLATE_ORDER.map((k) => `<option value="${k}">${esc(TEMPLATES[k].label)}</option>`).join('');
  const statusOptions = STATUSES.map((s) => `<option value="${s}" ${s === lead.status ? 'selected' : ''}>${label(s)}</option>`).join('');

  pane.innerHTML = `
    <div class="detail-card">
      ${lead.cover ? `<img class="cover" src="${esc(lead.cover)}" data-imgfallback="none"/>` : ''}
      <div class="head-row">
        <img class="avatar" src="${esc(lead.logo || '')}" data-imgfallback="hide"/>
        <div>
          <div class="head-name">${esc(lead.name || lead.url)}</div>
          <div class="head-cat">${esc(lead.category || '')}</div>
        </div>
        <div style="flex:1"></div>
        <span class="badge ${lead.status}">${esc(label(lead.status))}</span>
      </div>
      ${lead.bio ? `<p class="mut" style="font-size:13px;margin:10px 0 0">${esc(lead.bio)}</p>` : ''}
      <div class="kv">${contactRows(lead)}</div>
    </div>

    <div class="detail-card">
      <p class="section-title">Outreach</p>
      <div class="row" style="margin-bottom:8px">
        <label class="hint">Template</label>
        <select id="tmpl" class="select">${tmplOptions}</select>
        <button id="fillBtn" class="btn sm">↻ Reset text</button>
      </div>
      <input id="subject" class="subject" placeholder="Email subject" />
      <textarea id="msg" class="msg-box"></textarea>
      <div class="row" style="margin-top:10px">
        <button id="waBtn" class="btn green">WhatsApp</button>
        <button id="emailBtn" class="btn primary">Email</button>
        <button id="msgrBtn" class="btn">Messenger</button>
        <button id="copyBtn" class="btn">Copy</button>
        <div style="flex:1"></div>
        <button id="repliedBtn" class="btn sm">Mark replied</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button id="fbBtn" class="btn primary">Send Message On Facebook</button>
        <span class="hint">Opens the page, opens chat, and pastes the message (does not send).</span>
      </div>
    </div>

    <div class="detail-card">
      <p class="section-title">Status & notes</p>
      <div class="row" style="margin-bottom:8px">
        <label class="hint">Status</label>
        <select id="statusSel" class="select">${statusOptions}</select>
      </div>
      <textarea id="notes" class="notes" placeholder="Private notes…">${esc(lead.notes)}</textarea>
    </div>

    <div class="detail-card">
      <p class="section-title">Activity</p>
      <ul class="timeline" id="timeline"></ul>
    </div>
  `;

  wireImgFallbacks(pane);

  const fill = () => {
    const key = $('#tmpl').value;
    const { subject, body } = renderMessage(key, lead);
    $('#subject').value = subject;
    $('#msg').value = body;
  };
  fill();
  $('#tmpl').addEventListener('change', fill);
  $('#fillBtn').addEventListener('click', fill);

  const currentType = () => $('#tmpl').value;
  const body = () => $('#msg').value;
  const subject = () => $('#subject').value;
  const logSend = (channel) => {
    const type = currentType();
    const stage = TEMPLATES[type]?.stage || '';
    postCrm({
      url: lead.url,
      status: nextStatus(lead.status, stage),
      activity: { channel, type, note: subject() || TEMPLATES[type]?.label || '' }
    });
  };

  $('#waBtn').addEventListener('click', () => { if (openWhatsApp(lead, body())) logSend('whatsapp'); });
  $('#emailBtn').addEventListener('click', () => { if (openEmail(lead, subject(), body())) logSend('email'); });
  $('#msgrBtn').addEventListener('click', () => { openMessenger(lead); logSend('messenger'); });
  $('#copyBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(body());
    $('#copyBtn').textContent = 'Copied ✓';
    setTimeout(() => ($('#copyBtn').textContent = 'Copy'), 1200);
  });

  $('#fbBtn').addEventListener('click', async () => {
    const btn = $('#fbBtn');
    btn.disabled = true; btn.textContent = 'Opening Facebook…';
    const res = await chrome.runtime.sendMessage({ type: 'FB_ACTIONS', url: lead.url, doMessage: true, doFollow: false, message: body() });
    if (res && res.ok && res.sent) {
      btn.textContent = 'Sent on Facebook ✓';
      const stage = TEMPLATES[currentType()]?.stage || '';
      postCrm({ url: lead.url, status: nextStatus(lead.status, stage), activity: { channel: 'messenger', type: currentType(), note: 'Sent on Facebook' } });
    } else if (res && res.ok) {
      btn.textContent = `Not sent — ${res.messageError || 'error'}`;
      postCrm({ url: lead.url, activity: { channel: 'messenger', type: currentType(), note: 'FB message not sent' } });
    } else {
      btn.textContent = (res && res.error) ? res.error : 'Failed';
    }
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Send Message On Facebook'; }, 2500);
  });

  $('#repliedBtn').addEventListener('click', () =>
    postCrm({ url: lead.url, status: 'replied', activity: { channel: 'note', note: 'Marked as replied' } }));

  $('#statusSel').addEventListener('change', (e) =>
    postCrm({ url: lead.url, status: e.target.value, activity: { channel: 'status', note: 'Status → ' + e.target.value } }));

  $('#notes').addEventListener('blur', (e) => {
    if (e.target.value !== lead.notes) postCrm({ url: lead.url, notes: e.target.value });
  });

  renderTimeline(lead);
}

function renderTimeline(lead) {
  const tl = $('#timeline');
  if (!lead.activities || !lead.activities.length) { tl.innerHTML = '<li class="mut">No activity yet.</li>'; return; }
  tl.innerHTML = [...lead.activities].reverse().map((a) => {
    const when = new Date(a.at).toLocaleString();
    const label = [a.type, a.note].filter(Boolean).join(' — ');
    return `<li><span class="tl-channel">${esc(a.channel)}</span> ${esc(label)}<div class="meta">${esc(when)}</div></li>`;
  }).join('');
}

// --- boot ------------------------------------------------------------------

$('#search').addEventListener('input', renderList);
$('#statusFilter').addEventListener('change', renderList);
$('#reloadBtn').addEventListener('click', loadData);
loadData();
