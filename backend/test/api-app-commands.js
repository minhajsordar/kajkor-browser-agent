// Integration suite: /todo and /routine chat commands end-to-end.
// Run via `npm run test:api` (boots a second backend on port 4010), or against
// any already-running instance with BASE=http://127.0.0.1:<port>.
// Cleans up every document it creates — but it does write to the shared Mongo.
const BASE = process.env.BASE || 'http://127.0.0.1:4010';
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', n, extra ?? ''); } };
const eq = (n, x, y) => ok(n, JSON.stringify(x) === JSON.stringify(y), `got ${JSON.stringify(x)} want ${JSON.stringify(y)}`);
const j = async (p, opts) => {
  const r = await fetch(BASE + p, { headers: { 'content-type': 'application/json' }, ...opts });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const post = (p, body) => j(p, { method: 'POST', body: JSON.stringify(body || {}) });

const made = { tasks: [], routines: [], lists: [] };

(async () => {
  // ---- /todo as the OPENING goal -------------------------------------------
  let r = await post('/tasks', { goal: '/todo open chrome and check my amazon orders', model: 'scratch-model' });
  ok('opening /todo accepted', r.body.ok, r.body.error);
  eq('mode is app-command', r.body.mode, 'app-command');
  const t1 = r.body.task; made.tasks.push(t1.taskId);
  eq('session is idle — nothing was planned', t1.status, 'done');
  eq('and no plan exists', t1.plan, null);
  eq('exactly one pending proposal', (t1.proposals || []).length, 1);
  eq('proposal kind', t1.proposals[0].kind, 'todo.add');
  eq('instruction stored verbatim', t1.proposals[0].payload.instruction, 'open chrome and check my amazon orders');

  // THE hazard case: the instruction would post to a live account if executed.
  r = await post('/tasks', {
    goal: '/todo Open google chrome if not opened, then navigate to amazon.com, pick a best selling shoe product, post it in facebook and pinterest, and add this task as todo',
    model: 'scratch-model',
  });
  const t2 = r.body.task; made.tasks.push(t2.taskId);
  eq('the hazard message does NOT become a running task', t2.status, 'done');
  ok('trailing "add this task as todo" stripped from what we store',
    !/add this task as todo/i.test(t2.proposals[0].payload.instruction), t2.proposals[0].payload.instruction);
  ok('but the real instruction survives whole',
    /amazon\.com/.test(t2.proposals[0].payload.instruction) && /pinterest/i.test(t2.proposals[0].payload.instruction));

  // ---- approving a todo.add -------------------------------------------------
  r = await post(`/tasks/${t1.taskId}/proposals/${t1.proposals[0].proposalId}`, { decision: 'approve' });
  ok('approve applies', r.body.ok, r.body.error);
  eq('status approved', r.body.status, 'approved');
  r = await j('/todolists');
  const chatList = r.body.lists.find((l) => l.source === 'chat');
  ok('a "From chat" list exists', !!chatList, JSON.stringify(r.body.lists.map((l) => l.title)));
  made.lists.push(chatList.listId);
  ok('the todo landed on it', chatList.items.some((i) => i.instruction === 'open chrome and check my amazon orders'));
  eq('and it is waiting, not running', chatList.items[chatList.items.length - 1].status, 'todo');

  // a second /todo the same day reuses the SAME list
  r = await post('/tasks', { goal: '/todo second thing', model: 'scratch-model' });
  const t3 = r.body.task; made.tasks.push(t3.taskId);
  await post(`/tasks/${t3.taskId}/proposals/${t3.proposals[0].proposalId}`, { decision: 'approve' });
  r = await j('/todolists');
  const chatLists = r.body.lists.filter((l) => l.source === 'chat');
  eq('one chat list per day, not one per todo', chatLists.length, 1);
  eq('now holding two items', chatLists[0].items.length, 2);

  // ---- declining leaves nothing behind --------------------------------------
  r = await post('/tasks', { goal: '/todo a declined thing', model: 'scratch-model' });
  const t4 = r.body.task; made.tasks.push(t4.taskId);
  r = await post(`/tasks/${t4.taskId}/proposals/${t4.proposals[0].proposalId}`, { decision: 'decline' });
  eq('declined', r.body.status, 'declined');
  r = await j('/todolists');
  ok('a declined todo is never written',
    !r.body.lists.find((l) => l.source === 'chat').items.some((i) => i.instruction === 'a declined thing'));

  // ---- /routine -------------------------------------------------------------
  r = await post('/tasks', { goal: '/routine "SCRATCH chat routine" open chrome every morning', model: 'scratch-model' });
  const t5 = r.body.task; made.tasks.push(t5.taskId);
  eq('routine proposal kind', t5.proposals[0].kind, 'routine.create');
  eq('quoted name used', t5.proposals[0].payload.name, 'SCRATCH chat routine');
  r = await post(`/tasks/${t5.taskId}/proposals/${t5.proposals[0].proposalId}`, { decision: 'approve' });
  ok('routine approved', r.body.ok, r.body.error);
  r = await j('/routines');
  const routine = r.body.routines.find((x) => x.name === 'SCRATCH chat routine');
  ok('routine created', !!routine);
  made.routines.push(routine.routineId);
  eq('a chat-made routine is MANUAL — never auto-scheduled', routine.trigger, 'manual');
  eq('one template holding the instruction', routine.templates.length, 1);
  eq('instruction verbatim', routine.templates[0].instruction, 'open chrome every morning');
  eq('template defaults to draft', routine.templates[0].mode, 'draft');

  // ---- "Save & run now" -----------------------------------------------------
  // "open chrome" routes to a launch, which needs no Ollama and no executor, so
  // the run half is deterministic here.
  r = await post('/tasks', { goal: '/todo open chrome', model: 'scratch-model' });
  const t6 = r.body.task; made.tasks.push(t6.taskId);
  r = await post(`/tasks/${t6.taskId}/proposals/${t6.proposals[0].proposalId}`, { decision: 'approve', options: { run: true } });
  ok('approve+run applies', r.body.ok, r.body.error);
  r = await j('/todolists');
  const cl = r.body.lists.find((l) => l.source === 'chat');
  const ran = cl.items.find((i) => i.instruction === 'open chrome');
  ok('the run half actually started a task', !!ran?.taskId, JSON.stringify(ran));
  if (ran?.taskId) made.tasks.push(ran.taskId);

  // ---- a follow-up turn routes the same way ---------------------------------
  r = await post('/tasks', { goal: 'open chrome', model: 'scratch-model' });
  const t7 = r.body.task; made.tasks.push(t7.taskId);
  r = await post(`/tasks/${t7.taskId}/chat`, { message: '/todo do it again tomorrow' });
  eq('follow-up /todo routed as an app command', r.body.mode, 'app-command');
  const t7b = (await j(`/tasks/${t7.taskId}`)).body.task;
  eq('proposal pushed on the session', (t7b.proposals || []).length, 1);
  eq('and the session was NOT re-planned', t7b.status, 'done');

  // ---- errors ---------------------------------------------------------------
  r = await post('/tasks', { goal: '/todo', model: 'scratch-model' });
  ok('bare /todo is refused with guidance', !r.body.ok && /say what/i.test(r.body.error || ''), JSON.stringify(r.body));
  if (r.body.task) made.tasks.push(r.body.task.taskId);

  // an ordinary goal is untouched by any of this
  r = await post('/tasks', { goal: 'open chrome', model: 'scratch-model' });
  eq('ordinary goal still routes normally', r.body.mode, 'launch');
  made.tasks.push(r.body.task.taskId);

  // ---- cleanup --------------------------------------------------------------
  for (const id of made.tasks) if (id) await j(`/tasks/${id}`, { method: 'DELETE' });
  for (const id of made.routines) await j(`/routines/${id}`, { method: 'DELETE' });
  for (const id of [...new Set(made.lists)]) await j(`/todolists/${id}`, { method: 'DELETE' });
  const left = await j('/todolists');
  ok('cleanup: chat list removed', !left.body.lists.some((l) => l.source === 'chat'),
    JSON.stringify(left.body.lists.map((l) => l.title)));
  const lr = await j('/routines');
  ok('cleanup: no SCRATCH routines left', !lr.body.routines.some((x) => x.name.startsWith('SCRATCH')));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('SUITE CRASHED', e); process.exit(1); });
