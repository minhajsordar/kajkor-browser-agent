// Integration suite for the daily-todos API.
// Run via `npm run test:api` (boots a second backend on port 4010 — never the
// user's 34730), or against any already-running instance with
// BASE=http://127.0.0.1:<port>. Every document it creates is deleted at the
// end, but it does write to the real shared Mongo.
//
// Items use "open chrome" instructions on purpose: that routes through
// detectLaunch, which needs NO Ollama and NO executor, so the whole
// claim → create task → reconcile chain is exercised deterministically.
const BASE = process.env.BASE || 'http://127.0.0.1:4010';
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', n, extra ?? ''); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
const j = async (p, opts) => {
  const r = await fetch(BASE + p, { headers: { 'content-type': 'application/json' }, ...opts });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const created = { routines: [], lists: [], tasks: [] };

(async () => {
  // ---- routines CRUD ----
  let r = await j('/routines', { method: 'POST', body: JSON.stringify({
    name: 'SCRATCH affiliate', trigger: 'schedule-todo',
    templates: [
      { label: 'Launch A', instruction: 'open chrome', mode: 'auto' },
      { label: 'Launch B', instruction: 'open chrome for {topic}', mode: 'draft' },
    ],
    inputs: { perDay: 2, cooldownDays: 0, rows: [{ topic: 'alpha' }, { topic: 'beta' }, { topic: 'gamma' }] },
  }) });
  ok('create routine', r.status === 200 && r.body.ok, r.body.error);
  const routineId = r.body.routine.routineId;
  created.routines.push(routineId);
  eq('routine kept both templates', r.body.routine.templates.length, 2);

  r = await j(`/routines/${routineId}`);
  ok('get routine', r.body.routine?.routineId === routineId);

  r = await j(`/routines/${routineId}`, { method: 'PATCH', body: JSON.stringify({ name: 'SCRATCH renamed' }) });
  eq('patch renames', r.body.routine.name, 'SCRATCH renamed');
  eq('patch keeps templates (merge, not replace)', r.body.routine.templates.length, 2);
  eq('patch keeps input rows', r.body.routine.inputs.rows.length, 3);

  // ---- materialise ----
  r = await j(`/routines/${routineId}/materialise`, { method: 'POST', body: '{}' });
  ok('materialise builds a list', r.body.ok, r.body.error);
  const list = r.body.list;
  created.lists.push(list.listId);
  eq('2 rows × 2 templates = 4 items', list.items.length, 4);
  eq('row-major order', list.items.map((i) => i.label), ['Launch A', 'Launch B', 'Launch A', 'Launch B']);
  ok('placeholders filled', !list.items[1].instruction.includes('{topic}'), list.items[1].instruction);
  eq('all items start todo', [...new Set(list.items.map((i) => i.status))], ['todo']);

  r = await j(`/routines/${routineId}/materialise`, { method: 'POST', body: '{}' });
  ok('materialise twice is idempotent (same list)', r.body.already === true && r.body.list.listId === list.listId);

  r = await j(`/routines/${routineId}`);
  const usedRows = r.body.routine.inputs.rows.filter((x) => x.lastUsedAt);
  eq('rotation stamped exactly the rows used', usedRows.length, 2);
  ok('lastFiredAt stamped', !!r.body.routine.lastFiredAt);

  // ---- run one item ----
  const item0 = list.items[0];
  r = await j(`/todolists/${list.listId}/items/${item0.itemId}/run`, { method: 'POST', body: JSON.stringify({ model: 'scratch-model' }) });
  ok('run item returns a taskId', r.body.ok && !!r.body.taskId, r.body.error);
  created.tasks.push(r.body.taskId);
  const ranItem = r.body.list.items.find((i) => i.itemId === item0.itemId);
  eq('item is running', ranItem.status, 'running');
  ok('item carries its taskId', ranItem.taskId === r.body.taskId);

  // the launch task is created 'done', so the next GET should reconcile it
  r = await j(`/todolists/${list.listId}`);
  eq('reconcile mirrors the task status onto the item', r.body.list.items[0].status, 'done');
  ok('finishedAt stamped', !!r.body.list.items[0].finishedAt);

  // ---- double-start is impossible ----
  r = await j(`/todolists/${list.listId}/items/${item0.itemId}/run`, { method: 'POST', body: JSON.stringify({ model: 'scratch-model' }) });
  eq('a done item will NOT re-run without force', r.status, 409);
  r = await j(`/todolists/${list.listId}/items/${item0.itemId}/run`, { method: 'POST', body: JSON.stringify({ model: 'scratch-model', force: true }) });
  ok('…but force:true re-runs it (manual test press)', r.body.ok, r.body.error);
  created.tasks.push(r.body.taskId);

  // ---- skip / reset ----
  const item1 = list.items[1];
  r = await j(`/todolists/${list.listId}/items/${item1.itemId}/skip`, { method: 'POST', body: '{}' });
  eq('skip works', r.body.list.items.find((i) => i.itemId === item1.itemId).status, 'skipped');

  // reset refuses while anything is still running — reconcile the forced re-run first
  r = await j(`/todolists/${list.listId}/reset`, { method: 'POST', body: JSON.stringify({ scope: 'all' }) });
  eq('reset refuses while an item is running', r.status, 409);
  await j(`/todolists/${list.listId}`);            // GET reconciles it to done
  r = await j(`/todolists/${list.listId}/reset`, { method: 'POST', body: JSON.stringify({ scope: 'all' }) });
  ok('reset all puts every finished item back to todo', r.body.list.items.every((i) => i.status === 'todo'), JSON.stringify(r.body.list.items.map((i) => i.status)));

  // ---- edit an item ----
  r = await j(`/todolists/${list.listId}/items/${item1.itemId}`, { method: 'PATCH', body: JSON.stringify({ instruction: 'open chrome edited', runAt: '09:30' }) });
  const edited = r.body.list.items.find((i) => i.itemId === item1.itemId);
  eq('instruction edited', edited.instruction, 'open chrome edited');
  eq('runAt set', edited.runAt, '09:30');
  r = await j(`/todolists/${list.listId}/items/${item1.itemId}`, { method: 'PATCH', body: JSON.stringify({ runAt: 'nope' }) });
  eq('bad runAt rejected (kept)', r.body.list.items.find((i) => i.itemId === item1.itemId).runAt, '09:30');

  // ---- run all is SEQUENTIAL ----
  r = await j(`/todolists/${list.listId}/run`, { method: 'POST', body: JSON.stringify({ model: 'scratch-model' }) });
  ok('run all accepted', r.body.ok, r.body.error);
  let running = r.body.list.items.filter((i) => ['running', 'queued'].includes(i.status));
  eq('exactly ONE item started, not all four', running.length, 1);
  running.forEach((i) => created.tasks.push(i.taskId));

  // each GET advances the chain by at most one item
  for (let n = 0; n < 6; n++) {
    r = await j(`/todolists/${list.listId}`);
    const live = r.body.list.items.filter((i) => ['running', 'queued'].includes(i.status));
    if (live.length > 1) { ok('never more than one item at a time', false, JSON.stringify(r.body.list.items.map((i) => i.status))); break; }
    live.forEach((i) => { if (!created.tasks.includes(i.taskId)) created.tasks.push(i.taskId); });
    if (!r.body.list.autoRun) break;
  }
  ok('autoRun clears when the list is finished', r.body.list.autoRun === false,
    JSON.stringify(r.body.list.items.map((i) => [i.status, i.note])));
  eq('every item ended done', [...new Set(r.body.list.items.map((i) => i.status))], ['done']);
  if (r.body.list.items.some((i) => i.status === 'failed')) console.log('   notes:', JSON.stringify(r.body.list.items.map((i) => [i.label, i.status, i.note])));

  // ---- run-now (the test button) ----
  r = await j(`/routines/${routineId}/run-now`, { method: 'POST', body: JSON.stringify({ model: 'scratch-model', scope: 'first', reset: 'all' }) });
  ok('run-now reuses today\'s list', r.body.list.listId === list.listId, r.body.error);
  eq('run-now scope:first starts exactly one', r.body.started, 1);
  ok('run-now scope:first does not leave autoRun on', r.body.list.autoRun === false);
  r.body.list.items.forEach((i) => { if (i.taskId && !created.tasks.includes(i.taskId)) created.tasks.push(i.taskId); });

  // ---- interval routine: one occurrence per fire, not per day ----
  r = await j('/routines', { method: 'POST', body: JSON.stringify({
    name: 'SCRATCH interval', trigger: 'interval',
    schedule: { everyMinutes: 60 },
    templates: [{ label: 'Tick', instruction: 'open chrome' }],
  }) });
  const intId = r.body.routine.routineId;
  created.routines.push(intId);
  eq('everyMinutes stored', r.body.routine.schedule.everyMinutes, 60);
  r = await j(`/routines/${intId}/materialise`, { method: 'POST', body: '{}' });
  const l1 = r.body.list; created.lists.push(l1.listId);
  ok('interval list keyed to the minute', String(l1.occurrenceKey).includes('T'), l1.occurrenceKey);

  // ---- ad-hoc list, no routine ----
  r = await j('/todolists', { method: 'POST', body: JSON.stringify({ title: 'SCRATCH adhoc', items: [{ label: 'one', instruction: 'open chrome' }, { instruction: '' }] }) });
  ok('ad-hoc list created', r.body.ok, r.body.error);
  created.lists.push(r.body.list.listId);
  eq('empty instruction dropped', r.body.list.items.length, 1);
  eq('ad-hoc has no occurrence key', r.body.list.occurrenceKey, null);
  r = await j('/todolists', { method: 'POST', body: JSON.stringify({ items: [] }) });
  eq('ad-hoc with no items refused', r.status, 400);

  // ---- listing ----
  r = await j(`/todolists?routineId=${routineId}`);
  ok('list by routine', r.body.lists.length >= 1);

  // ---- guards ----
  r = await j('/routines/nope/materialise', { method: 'POST', body: '{}' });
  eq('unknown routine 404s', r.status, 404);
  r = await j(`/todolists/${list.listId}/items/nope/run`, { method: 'POST', body: '{}' });
  eq('unknown item 409s', r.status, 409);
  r = await j('/routines', { method: 'POST', body: JSON.stringify({ name: 'SCRATCH empty' }) });
  created.routines.push(r.body.routine.routineId);
  r = await j(`/routines/${r.body.routine.routineId}/materialise`, { method: 'POST', body: '{}' });
  eq('a routine with no templates refuses to build', r.status, 400);

  // ---- cleanup (Mongo is the real shared DB) ----
  for (const id of created.tasks) if (id) await j(`/tasks/${id}`, { method: 'DELETE' });
  for (const id of created.lists) await j(`/todolists/${id}`, { method: 'DELETE' });
  for (const id of created.routines) await j(`/routines/${id}`, { method: 'DELETE' });
  const left = await j('/routines');
  ok('cleanup: no SCRATCH routines left', !left.body.routines.some((x) => x.name.startsWith('SCRATCH')),
    JSON.stringify(left.body.routines.map((x) => x.name)));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE CRASHED', e); process.exit(1); });
