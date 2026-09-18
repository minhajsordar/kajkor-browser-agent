// Unit suite for backend/app-commands.js (pure module).
const a = require('../app-commands');
const { eq, ok } = require('./helpers');

// --- not a command: everything ordinary must fall through untouched ---
for (const m of [
  'open chrome and post to facebook',
  'what todos do I have today?',                  // a READ — phase 3, not this
  'add this task as todo',                        // NL without the prefix — phase 2
  'go to /todos on the site',                     // a path, not a command
  '/run npm test',
  '/launch chrome',
  '',
]) ok(`not a command: "${m}"`, a.parseAppCommand(m) === null, JSON.stringify(a.parseAppCommand(m)));

// --- the command forms ---
let c = a.parseAppCommand('/todo open chrome and check my amazon orders');
eq('todo kind', c.kind, 'todo.add');
eq('todo instruction', c.instruction, 'open chrome and check my amazon orders');
eq('todo name derived', c.name, 'open chrome and check my amazon orders');
ok('todo has no error', !c.error);

c = a.parseAppCommand('/routine post today\'s deal to facebook');
eq('routine kind', c.kind, 'routine.create');
eq('aliases: /todos', a.parseAppCommand('/todos do a thing').kind, 'todo.add');
eq('aliases: /routines', a.parseAppCommand('/routines do a thing').kind, 'routine.create');
eq('aliases: /repeat', a.parseAppCommand('/repeat do a thing').kind, 'routine.create');
eq('colon form', a.parseAppCommand('/todo: do a thing').instruction, 'do a thing');
eq('case insensitive', a.parseAppCommand('/TODO do a thing').kind, 'todo.add');

// --- quoted name ---
c = a.parseAppCommand('/routine "Amazon shoes → FB" open chrome, go to amazon.com, post the top shoe');
eq('quoted name taken', c.name, 'Amazon shoes → FB');
eq('quoted name removed from instruction', c.instruction, 'open chrome, go to amazon.com, post the top shoe');
// a quoted string with NOTHING after it is the instruction, not a name
c = a.parseAppCommand('/todo "just this"');
eq('lone quoted text stays the instruction', c.instruction, '"just this"');

// --- the trailing save clause is stripped (it is an instruction to US) ---
const strip = [
  ['open chrome and post it, and add this task as todo', 'open chrome and post it'],
  ['do the thing and save it as a routine', 'do the thing'],
  ['do the thing. also add this to my todo list.', 'do the thing.'],
  ['do the thing and add this as a new todo', 'do the thing'],
  ['post to facebook then save this as a daily task', 'post to facebook'],
];
for (const [input, want] of strip) eq(`strip: "${input}"`, a.stripSaveClause(input), want);
eq('strip via parse', a.parseAppCommand('/todo open chrome and post it, and add this task as todo').instruction, 'open chrome and post it');
// must NOT eat a real instruction that merely mentions the words
eq('does not strip mid-sentence', a.stripSaveClause('add this task as todo in the app I am testing'),
  'add this task as todo in the app I am testing');
eq('does not strip an ordinary sentence', a.stripSaveClause('open chrome and post to facebook'),
  'open chrome and post to facebook');
// a message that is ONLY the clause keeps its text, so the caller can complain
ok('clause-only message is not blanked', a.stripSaveClause('add this as a todo') === 'add this as a todo');

// --- missing instruction ---
c = a.parseAppCommand('/todo');
ok('bare /todo is an error, not a silent empty todo', !!c.error, JSON.stringify(c));
eq('bare /todo keeps its kind', c.kind, 'todo.add');
ok('bare /routine errors too', !!a.parseAppCommand('/routine   ').error);

// --- names ---
eq('name = first sentence', a.deriveName('Open chrome. Then post to facebook.'), 'Open chrome');
ok('long name truncated', a.deriveName('x'.repeat(200)).length <= 60);
eq('empty name falls back', a.deriveName(''), 'Untitled');

// --- the card text states the consequence ---
const d = a.describeCommand(a.parseAppCommand('/todo open chrome'));
ok('card summary names the object', /todo/i.test(d.summary), d.summary);
ok('card says nothing runs yet', /nothing runs/i.test(d.detail), d.detail);
const d2 = a.describeCommand(a.parseAppCommand('/routine open chrome'));
ok('routine card says manual', /manual/i.test(d2.detail), d2.detail);
