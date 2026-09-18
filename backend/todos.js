// Daily todos — routines → per-day todo lists → items.
// Plan: plans/partially-done/daily-todos-scheduler.md
//
// A GENERAL work engine. An item is "one instruction the agent runs" and
// nothing more; this module never knows what the work IS. The recurring job may
// be posts, price checks, a research question, a /run host command or a launch —
// `POST /tasks` already routes on the instruction text, so the todo engine does
// not need to care.
//
// This module is PURE (no DB, no network) so materialisation, rotation and
// template filling are unit-testable — the same reason `lessons.js` and
// `feedback-triage.js` are separate files: `require('./server.js')` boots Mongo
// and calls app.listen (the desktop app embeds the backend by requiring it), so
// logic that needs deterministic tests cannot live in there.

const crypto = require('crypto');

const TRIGGERS = new Set(['schedule', 'schedule-todo', 'manual', 'interval']);
const ITEM_STATUSES = new Set(['todo', 'queued', 'running', 'done', 'failed', 'skipped']);
// Statuses an item may be started from. `queued`/`running` are excluded on
// purpose: starting one twice is the double-post failure this whole design is
// built to prevent.
const STARTABLE = new Set(['todo', 'failed', 'skipped']);

const HHMM_RX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

const str = (v, max = 500) => String(v == null ? '' : v).slice(0, max);
const clampInt = (v, lo, hi, dflt) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

// The LOCAL calendar date, as a string. Deliberately not a Date object: day
// comparisons happen across DST boundaries, where "+24h" is not "tomorrow".
// Compare 'YYYY-MM-DD' strings; compare times as 'HH:MM' strings.
function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function localTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
// 0 = Sunday … 6 = Saturday (JS convention, kept so the UI can map directly).
const localDow = (d = new Date()) => d.getDay();

function daysBetween(isoA, isoB) {
  const a = Date.parse(isoA), b = Date.parse(isoB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  return Math.abs(b - a) / 86400000;
}

// ---------------------------------------------------------------- templates --
// `{key}` placeholders are filled from the input row's values. An UNKNOWN
// placeholder is left verbatim rather than blanked: a half-filled instruction
// that still reads like a sentence hides the bug, while a visible `{topic}` in
// the todo list is caught before the item ever runs. (The runtime guard against
// typing a placeholder into a page — PROJECT_MEMORY 2026-07-19 — is the backstop
// if one slips through anyway.)
function fillTemplate(tpl, values = {}) {
  return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, (m, key) => (
    Object.prototype.hasOwnProperty.call(values, key) && values[key] != null
      ? String(values[key])
      : m
  ));
}

// Which placeholders a template still has unfilled — surfaced in the UI so a
// mis-keyed input row is obvious in the list, not at run time.
function unfilledPlaceholders(text) {
  const out = [];
  String(text || '').replace(/\{(\w+)\}/g, (m, key) => { if (!out.includes(key)) out.push(key); return m; });
  return out;
}

// ------------------------------------------------------------- normalisation --
function cleanTemplate(t, prev = null) {
  if (!t || typeof t !== 'object') return null;
  // Generous: an instruction is prose the user writes, and they write long ones.
  const instruction = str(t.instruction, 8000).trim();
  if (!instruction) return null;
  return {
    templateId: str(t.templateId || prev?.templateId || crypto.randomUUID(), 64),
    label: str(t.label, 80).trim() || instruction.slice(0, 60),
    instruction,
    skillIds: Array.isArray(t.skillIds) ? t.skillIds.slice(0, 20).map((s) => str(s, 64)) : [],
    // 'auto' may run unattended; 'draft' prepares and waits for a human. In
    // phases 1-2 every run is manual, so this is stored and shown but does not
    // gate anything yet — the clock (phase 3) is what will read it.
    mode: t.mode === 'auto' ? 'auto' : 'draft',
    capPerDay: clampInt(t.capPerDay, 1, 100, 10),
    enabled: t.enabled !== false,
  };
}

function cleanInputRow(r) {
  if (!r || typeof r !== 'object') return null;
  const src = r.values && typeof r.values === 'object' ? r.values : r;
  const values = {};
  for (const [k, v] of Object.entries(src)) {
    if (['id', 'values', 'lastUsedAt', 'useCount'].includes(k)) continue;
    if (!/^\w+$/.test(k)) continue;              // keys are placeholder names
    const val = str(v, 2000).trim();
    if (!val) continue;                          // an empty value fills nothing
    values[k] = val;
  }
  if (!Object.keys(values).length) return null;
  return {
    id: str(r.id || crypto.randomUUID(), 64),
    values,
    lastUsedAt: r.lastUsedAt || null,
    useCount: clampInt(r.useCount, 0, 1e6, 0),
  };
}

function cleanSchedule(s) {
  const sc = s && typeof s === 'object' ? s : {};
  const dows = Array.isArray(sc.daysOfWeek)
    ? [...new Set(sc.daysOfWeek.map((n) => clampInt(n, 0, 6, -1)).filter((n) => n >= 0))].sort()
    : [1, 2, 3, 4, 5];
  const win = sc.window && typeof sc.window === 'object' ? sc.window : {};
  return {
    daysOfWeek: dows,
    materialiseAt: HHMM_RX.test(sc.materialiseAt) ? sc.materialiseAt : '08:30',
    window: {
      from: HHMM_RX.test(win.from) ? win.from : '09:00',
      to: HHMM_RX.test(win.to) ? win.to : '18:00',
    },
    jitterMin: clampInt(sc.jitterMin, 0, 180, 15),
    // `interval` trigger: run every N minutes (the "every 1h / every 5h" timer).
    // 5 min floor — anything faster is a poll, not a todo, and this drives real
    // browser work on a single Chrome.
    everyMinutes: clampInt(sc.everyMinutes, 5, 10080, 60),
    // How late an item may still AUTO-run. Past this it stays manually runnable
    // (see `missedButRunnable`) — it does not disappear.
    graceHours: clampInt(sc.graceHours, 0, 24, 4),
  };
}

// Whitelist + coerce a routine from request input. Same shape as
// `cleanProjectSettings` in server.js: anything not listed here cannot be
// written by a client.
function cleanRoutine(body, prev = null) {
  const b = body && typeof body === 'object' ? body : {};
  const p = prev || {};
  const templates = Array.isArray(b.templates)
    ? b.templates.map((t, i) => cleanTemplate(t, (p.templates || [])[i])).filter(Boolean).slice(0, 30)
    : (p.templates || []);
  const inb = b.inputs && typeof b.inputs === 'object' ? b.inputs : (p.inputs || {});
  const rows = Array.isArray(inb.rows)
    ? inb.rows.map(cleanInputRow).filter(Boolean).slice(0, 500)
    : ((p.inputs || {}).rows || []);
  return {
    name: str(b.name != null ? b.name : p.name, 120).trim() || 'Untitled routine',
    projectId: b.projectId !== undefined ? (b.projectId ? str(b.projectId, 64) : null) : (p.projectId || null),
    trigger: TRIGGERS.has(b.trigger) ? b.trigger : (TRIGGERS.has(p.trigger) ? p.trigger : 'manual'),
    schedule: cleanSchedule(b.schedule !== undefined ? b.schedule : p.schedule),
    templates,
    inputs: {
      perDay: clampInt(inb.perDay, 1, 100, 5),
      cooldownDays: clampInt(inb.cooldownDays, 0, 365, 14),
      source: ['inline', 'schema', 'none'].includes(inb.source) ? inb.source : (rows.length ? 'inline' : 'none'),
      rows,
      schemaId: inb.schemaId ? str(inb.schemaId, 64) : null,
      fields: Array.isArray(inb.fields) ? inb.fields.slice(0, 20).map((f) => str(f, 60)) : [],
    },
    active: b.active !== undefined ? b.active !== false : (p.active !== false),
  };
}

// ------------------------------------------------------------------ rotation --
// Round-robin over the input rows: never-used first, then least-recently-used.
// NOT random — random repeats, and repeating yesterday's work is the single most
// visible way this feature can look broken.
//
// The cooldown is a preference, not a hard stop: if too few rows are outside it,
// we fall back to the oldest ones and SAY SO (`reused: true`), because producing
// a short list silently is worse than producing a repeat the user can see.
function pickInputRows(rows, perDay, cooldownDays, now = new Date()) {
  const all = (rows || []).filter(Boolean);
  if (!all.length) return { rows: [], reused: false };
  const nowIso = now.toISOString();
  const byAge = [...all].sort((a, b) => {
    if (!a.lastUsedAt && !b.lastUsedAt) return (a.useCount || 0) - (b.useCount || 0);
    if (!a.lastUsedAt) return -1;
    if (!b.lastUsedAt) return 1;
    return String(a.lastUsedAt).localeCompare(String(b.lastUsedAt));
  });
  const fresh = byAge.filter((r) => !r.lastUsedAt || daysBetween(r.lastUsedAt, nowIso) >= cooldownDays);
  const picked = fresh.slice(0, perDay);
  let reused = false;
  if (picked.length < perDay) {
    for (const r of byAge) {
      if (picked.length >= perDay) break;
      if (picked.includes(r)) continue;
      picked.push(r);
      reused = true;
    }
  }
  return { rows: picked, reused };
}

// ------------------------------------------------------------ materialisation --
// Build one day's items: the cross-product of chosen input rows × enabled
// templates, row-major (all of row 1's work, then row 2's) so a day reads as
// "topic by topic" rather than "tool by tool".
//
// With no inputs (`source:'none'` or an empty list) a template still produces
// ONE item — the plain "do this daily job" case. A routine that produced nothing
// would look identical to a broken one.
function buildItems(routine, opts = {}) {
  const now = opts.now || new Date();
  const makeId = opts.makeId || (() => crypto.randomUUID());
  const templates = (routine.templates || []).filter((t) => t && t.enabled !== false);
  const inputs = routine.inputs || {};
  const useRows = inputs.source !== 'none' && (inputs.rows || []).length;
  const { rows, reused } = useRows
    ? pickInputRows(inputs.rows, inputs.perDay || 5, inputs.cooldownDays || 0, now)
    : { rows: [], reused: false };
  const carriers = rows.length ? rows : [null];

  const items = [];
  const perTemplate = {};
  for (const row of carriers) {
    for (const t of templates) {
      const used = perTemplate[t.templateId] || 0;
      if (used >= (t.capPerDay || 10)) continue;   // hard cap, backend-side
      perTemplate[t.templateId] = used + 1;
      const values = row ? row.values : {};
      const instruction = fillTemplate(t.instruction, values);
      items.push({
        itemId: makeId(),
        templateId: t.templateId,
        label: t.label,
        instruction,
        inputId: row ? row.id : null,
        values,
        mode: t.mode || 'draft',
        skillIds: t.skillIds || [],
        runAt: null,                 // phase 3 (the clock) fills this
        status: 'todo',
        taskId: null,
        startedAt: null,
        finishedAt: null,
        note: '',
        reason: '',
        missing: unfilledPlaceholders(instruction),
      });
    }
  }
  return { items, usedRowIds: rows.map((r) => r.id), reused };
}

function buildList(routine, opts = {}) {
  const now = opts.now || new Date();
  const date = opts.date && DATE_RX.test(opts.date) ? opts.date : localDate(now);
  const { items, usedRowIds, reused } = buildItems(routine, { ...opts, now });
  return {
    list: {
      listId: (opts.makeId || (() => crypto.randomUUID()))(),
      routineId: routine.routineId || null,
      projectId: routine.projectId || null,
      date,
      occurrenceKey: opts.occurrenceKey || occurrenceKey(routine, now),
      title: `${routine.name || 'Todos'} — ${date}`,
      items,
      note: reused ? 'Some inputs were reused inside their cooldown — the pool is smaller than the daily count.' : '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    usedRowIds,
  };
}

// What "one occurrence" of a routine is. A daily routine has one per DATE; an
// interval routine ("every 5 hours") has one per fire, keyed to the minute. This
// string is the unique key that makes materialising idempotent — asking twice
// returns the same list instead of building a second one.
function occurrenceKey(routine, now = new Date()) {
  const date = localDate(now);
  return routine && routine.trigger === 'interval' ? `${date}T${localTime(now)}` : date;
}

// Is an interval routine due? Fires when `everyMinutes` have passed since the
// last fire. If the machine was off for a day, this fires ONCE on wake and then
// resumes — it does not replay the twelve fires that were missed. A backlog
// stampede of real browser work is never what the user wanted.
function intervalDue(routine, now = new Date()) {
  if (!routine || routine.trigger !== 'interval') return false;
  const every = (routine.schedule || {}).everyMinutes || 60;
  const last = routine.lastFiredAt ? Date.parse(routine.lastFiredAt) : NaN;
  if (!Number.isFinite(last)) return true;                  // never fired → fire now
  return (now.getTime() - last) >= every * 60000;
}

// Should this routine build a list right now? Used by the manual "Build today's
// list" button (with `manualOk`) and by the tick loop in phase 3.
function shouldMaterialise(routine, now = new Date(), opts = {}) {
  if (!routine) return { yes: false, why: 'no routine' };
  if (routine.active === false) return { yes: false, why: 'routine is paused' };
  if (!(routine.templates || []).some((t) => t.enabled !== false)) return { yes: false, why: 'no enabled templates' };
  if (opts.manual) return { yes: true, why: '' };            // the user pressed the button
  if (routine.trigger === 'manual') return { yes: false, why: 'manual routine — build it yourself' };
  if (routine.trigger === 'interval') {
    return intervalDue(routine, now)
      ? { yes: true, why: '' }
      : { yes: false, why: `not due — every ${(routine.schedule || {}).everyMinutes || 60} min` };
  }
  if (routine.lastMaterialisedDate === localDate(now)) return { yes: false, why: 'already built for today' };
  const sc = routine.schedule || {};
  if (Array.isArray(sc.daysOfWeek) && sc.daysOfWeek.length && !sc.daysOfWeek.includes(localDow(now))) {
    return { yes: false, why: 'not scheduled today' };
  }
  if (sc.materialiseAt && localTime(now) < sc.materialiseAt) return { yes: false, why: `not until ${sc.materialiseAt}` };
  return { yes: true, why: '' };
}

// ------------------------------------------------- missed runs stay runnable --
// The computer was off at 09:00. When it comes back on, the 09:00 item must
// still be there and still be pressable — that is the entire point of a todo
// list, and it is the user's explicit requirement (2026-07-28).
//
// So lateness gates AUTO-running ONLY. Past the grace window we stop firing it
// unattended (nobody wants yesterday's 09:00 job going off at 23:00 on its own),
// but the item stays `todo` and the ▶ button stays live until the NEXT
// occurrence of that routine supersedes it. An item is never auto-skipped.
function canAutoRun(item, now = new Date(), graceHours = 4) {
  if (!item || item.status !== 'todo' || !item.runAt) return false;
  const t = localTime(now);
  if (t < item.runAt) return false;                          // not yet
  if (!graceHours) return true;
  const [h, m] = item.runAt.split(':').map(Number);
  const due = new Date(now); due.setHours(h, m, 0, 0);
  return (now.getTime() - due.getTime()) <= graceHours * 3600000;
}

// Late, so it will not fire by itself — but the user can still press it.
function missedButRunnable(item, now = new Date(), graceHours = 4) {
  return !!(item && item.status === 'todo' && item.runAt && !canAutoRun(item, now, graceHours) && localTime(now) >= item.runAt);
}

// Reset items so a list can be run again before its next occurrence. `scope`:
// 'failed' (retry what broke — the common case), 'unfinished' (failed + skipped)
// or 'all' (run the whole list again). Returns a NEW items array; the caller
// persists it. Never touches an item that is currently running.
function resetItems(items, scope = 'failed') {
  const targets = scope === 'all'
    ? ['done', 'failed', 'skipped']
    : scope === 'unfinished' ? ['failed', 'skipped'] : ['failed'];
  return (items || []).map((i) => (
    targets.includes(i.status)
      ? { ...i, status: 'todo', taskId: null, startedAt: null, finishedAt: null, note: '', reason: '' }
      : i
  ));
}

// An item mirrors its task. `waiting` is not terminal — a browse task sits in
// planning/running for minutes while the extension executes it over polls.
function itemStatusFromTask(taskStatus) {
  switch (String(taskStatus || '')) {
    case 'done': return 'done';
    case 'error': return 'failed';
    case 'stopped': return 'skipped';
    case 'planning': case 'running': case 'checking': case 'waiting': return 'running';
    default: return null;                        // unknown → leave the item alone
  }
}

module.exports = {
  TRIGGERS, ITEM_STATUSES, STARTABLE, HHMM_RX, DATE_RX,
  localDate, localTime, localDow, daysBetween,
  fillTemplate, unfilledPlaceholders,
  cleanTemplate, cleanInputRow, cleanSchedule, cleanRoutine,
  pickInputRows, buildItems, buildList,
  occurrenceKey, intervalDue, shouldMaterialise,
  canAutoRun, missedButRunnable, resetItems, itemStatusFromTask,
};
