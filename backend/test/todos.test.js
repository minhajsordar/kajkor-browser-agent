// Unit suite for backend/todos.js (pure module).
const t = require('../todos');
const { eq, ok } = require('./helpers');

// --- template filling ---
eq('fill: simple', t.fillTemplate('Post about {topic} link {link}', { topic: 'AI', link: 'x.co' }), 'Post about AI link x.co');
eq('fill: unknown placeholder is LEFT VISIBLE', t.fillTemplate('Post {topic} {nope}', { topic: 'AI' }), 'Post AI {nope}');
eq('fill: null value left visible', t.fillTemplate('a {b}', { b: null }), 'a {b}');
eq('unfilled lists only unknowns', t.unfilledPlaceholders('a {x} b {y} c {x}'), ['x', 'y']);

// --- routine cleaning ---
const r1 = t.cleanRoutine({
  name: '  Daily  ', trigger: 'bogus', templates: [
    { label: 'FB', instruction: 'post {topic}', mode: 'auto', capPerDay: 999 },
    { label: 'no instruction' },
  ],
  inputs: { perDay: 3, rows: [{ topic: 'a' }, { values: { topic: 'b' } }, { junk: null }] },
});
eq('clean: name trimmed', r1.name, 'Daily');
eq('clean: unknown trigger → manual', r1.trigger, 'manual');
eq('clean: template without instruction dropped', r1.templates.length, 1);
eq('clean: cap clamped', r1.templates[0].capPerDay, 100);
eq('clean: rows normalised', r1.inputs.rows.length, 2);
eq('clean: bare row wrapped into values', r1.inputs.rows[0].values, { topic: 'a' });
eq('clean: source inferred inline', r1.inputs.source, 'inline');
ok('clean: interval is a valid trigger', t.cleanRoutine({ trigger: 'interval' }).trigger === 'interval');
eq('clean: everyMinutes floor 5', t.cleanRoutine({ schedule: { everyMinutes: 1 } }).schedule.everyMinutes, 5);
eq('clean: everyMinutes default 60', t.cleanRoutine({}).schedule.everyMinutes, 60);
eq('clean: mode defaults to draft (never auto by accident)', t.cleanRoutine({ templates: [{ instruction: 'x' }] }).templates[0].mode, 'draft');
// PATCH semantics: a body that omits a field keeps the previous value.
const r2 = t.cleanRoutine({ name: 'Renamed' }, r1);
eq('patch: templates preserved when omitted', r2.templates.length, 1);
eq('patch: rows preserved when omitted', r2.inputs.rows.length, 2);

// --- rotation ---
const day = (n) => new Date(Date.UTC(2026, 6, n)).toISOString();
const rows = [
  { id: 'a', values: { topic: 'A' }, lastUsedAt: day(27) },   // yesterday
  { id: 'b', values: { topic: 'B' }, lastUsedAt: day(1) },    // long ago
  { id: 'c', values: { topic: 'C' }, lastUsedAt: null },      // never
];
const now = new Date(Date.UTC(2026, 6, 28, 9));
const p1 = t.pickInputRows(rows, 2, 14, now);
eq('rotate: never-used first, then oldest', p1.rows.map((r) => r.id), ['c', 'b']);
ok('rotate: no reuse flag when cooldown satisfied', p1.reused === false);
const p2 = t.pickInputRows(rows, 3, 14, now);
eq('rotate: falls back inside cooldown rather than short list', p2.rows.length, 3);
ok('rotate: and SAYS it reused', p2.reused === true);
eq('rotate: empty pool', t.pickInputRows([], 5, 14, now).rows, []);

// --- materialisation ---
const routine = t.cleanRoutine({
  name: 'Affiliate', trigger: 'schedule-todo',
  templates: [
    { label: 'FB', instruction: 'post {topic} on facebook', mode: 'auto' },
    { label: 'Pin', instruction: 'pin {topic}', mode: 'draft' },
  ],
  inputs: { perDay: 2, cooldownDays: 0, rows },
});
let n = 0;
const built = t.buildList({ ...routine, routineId: 'R1' }, { now, makeId: () => `id${++n}` });
eq('build: rows × templates', built.list.items.length, 4);
eq('build: row-major order', built.list.items.map((i) => i.label), ['FB', 'Pin', 'FB', 'Pin']);
ok('build: instruction filled', built.list.items[0].instruction.includes('post '));
ok('build: no placeholder left', !built.list.items[0].instruction.includes('{topic}'));
eq('build: every item starts todo', [...new Set(built.list.items.map((i) => i.status))], ['todo']);
eq('build: mode carried per template', built.list.items[1].mode, 'draft');
eq('build: usedRowIds reported', built.usedRowIds.length, 2);
eq('build: date is local', built.list.date, t.localDate(now));

// cap
const capped = t.buildList({
  ...t.cleanRoutine({ templates: [{ instruction: 'x {topic}', capPerDay: 2 }], inputs: { perDay: 5, cooldownDays: 0, rows } }),
  routineId: 'R2',
}, { now });
eq('build: capPerDay truncates', capped.list.items.length, 2);

// no inputs at all → still ONE item per template
const plain = t.buildList(t.cleanRoutine({ templates: [{ instruction: 'run the daily backup' }] }), { now });
eq('build: no inputs still produces an item', plain.list.items.length, 1);
eq('build: and leaves values empty', plain.list.items[0].values, {});

// disabled template excluded
const off = t.buildList(t.cleanRoutine({ templates: [{ instruction: 'a', enabled: false }, { instruction: 'b' }] }), { now });
eq('build: disabled template excluded', off.list.items.length, 1);

// --- occurrence keys ---
eq('occurrence: daily = date', t.occurrenceKey({ trigger: 'schedule' }, now), t.localDate(now));
ok('occurrence: interval includes time', t.occurrenceKey({ trigger: 'interval' }, now).includes('T'));

// --- interval due ---
ok('interval: never fired → due', t.intervalDue({ trigger: 'interval', schedule: { everyMinutes: 60 } }, now) === true);
ok('interval: 30min after a 60min fire → not due',
  t.intervalDue({ trigger: 'interval', schedule: { everyMinutes: 60 }, lastFiredAt: new Date(now - 30 * 60000).toISOString() }, now) === false);
ok('interval: 90min after a 60min fire → due',
  t.intervalDue({ trigger: 'interval', schedule: { everyMinutes: 60 }, lastFiredAt: new Date(now - 90 * 60000).toISOString() }, now) === true);
ok('interval: a day off fires ONCE, not a backlog',
  t.intervalDue({ trigger: 'interval', schedule: { everyMinutes: 300 }, lastFiredAt: new Date(now - 26 * 3600000).toISOString() }, now) === true);
ok('interval: non-interval routine never interval-due', t.intervalDue({ trigger: 'schedule' }, now) === false);

// --- shouldMaterialise ---
const live = { ...routine, routineId: 'R', templates: routine.templates };
ok('materialise: manual button always wins', t.shouldMaterialise({ ...live, trigger: 'manual' }, now, { manual: true }).yes === true);
ok('materialise: paused routine never', t.shouldMaterialise({ ...live, active: false }, now, { manual: true }).yes === false);
ok('materialise: no enabled templates never', t.shouldMaterialise({ ...live, templates: [] }, now, { manual: true }).yes === false);
ok('materialise: already built today', t.shouldMaterialise({ ...live, lastMaterialisedDate: t.localDate(now) }, now).yes === false);
ok('materialise: before materialiseAt', t.shouldMaterialise({ ...live, schedule: { ...live.schedule, materialiseAt: '23:59' } }, now).yes === false);

// --- missed runs stay runnable (the user's requirement) ---
const at = (h, m = 0) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d; };
const item = { status: 'todo', runAt: '09:00' };
ok('auto: before its time → no', t.canAutoRun(item, at(8), 4) === false);
ok('auto: at its time → yes', t.canAutoRun(item, at(9, 1), 4) === true);
ok('auto: 2h late, inside grace → yes', t.canAutoRun(item, at(11), 4) === true);
ok('auto: 8h late → will NOT fire by itself', t.canAutoRun(item, at(17), 4) === false);
ok('missed: 8h late is flagged as missed-but-runnable', t.missedButRunnable(item, at(17), 4) === true);
ok('missed: it is still status todo (never auto-skipped)', item.status === 'todo');
ok('missed: a done item is not "missed"', t.missedButRunnable({ status: 'done', runAt: '09:00' }, at(17), 4) === false);
ok('auto: an item with no runAt never auto-fires', t.canAutoRun({ status: 'todo', runAt: null }, at(17), 4) === false);

// --- reset (re-run before the next occurrence) ---
const mixed = [{ status: 'done' }, { status: 'failed' }, { status: 'skipped' }, { status: 'todo' }];
eq('reset failed', t.resetItems(mixed, 'failed').map((i) => i.status), ['done', 'todo', 'skipped', 'todo']);
eq('reset unfinished', t.resetItems(mixed, 'unfinished').map((i) => i.status), ['done', 'todo', 'todo', 'todo']);
eq('reset all', t.resetItems(mixed, 'all').map((i) => i.status), ['todo', 'todo', 'todo', 'todo']);
eq('reset clears the old taskId', t.resetItems([{ status: 'failed', taskId: 'x' }], 'failed')[0].taskId, null);
eq('reset leaves a running item alone', t.resetItems([{ status: 'running' }], 'all')[0].status, 'running');

// --- task → item status ---
eq('status: done', t.itemStatusFromTask('done'), 'done');
eq('status: error → failed', t.itemStatusFromTask('error'), 'failed');
eq('status: stopped → skipped', t.itemStatusFromTask('stopped'), 'skipped');
eq('status: running stays running', t.itemStatusFromTask('planning'), 'running');
eq('status: unknown → null (leave the item alone)', t.itemStatusFromTask('weird'), null);
