// Unit suite for backend/lessons.js (pure module).
//
// Lessons are injected into model prompts, so the two things that matter are the
// SCOPE (a Facebook quirk must not load into a research plan) and the CAPS (a
// flat, ever-growing list injected everywhere is what makes these systems rot).
const l = require('../lessons');
const { eq, ok } = require('./helpers');

// Note the `in` checks rather than `||` defaults: a case here deliberately
// passes text:'' to prove a blank lesson is dropped, and a `||` default would
// silently replace it and make the assertion test nothing.
const lesson = (over = {}) => ({
  lessonId: 'lessonId' in over ? over.lessonId : 'L',
  text: 'text' in over ? over.text : 'keep posts short',
  scope: 'scope' in over ? over.scope : { type: 'host', value: 'facebook.com' },
  createdAt: 'createdAt' in over ? over.createdAt : '2026-01-01T00:00:00.000Z',
  active: over.active,
});

// --- scope matching ---
ok('global matches anything', l.lessonMatches(lesson({ scope: { type: 'global' } }), {}) === true);
ok('host matches its host', l.lessonMatches(lesson(), { host: 'facebook.com' }) === true);
ok('host ignores www', l.lessonMatches(lesson(), { host: 'www.facebook.com' }) === true);
ok('host does NOT match another site', l.lessonMatches(lesson(), { host: 'google.com' }) === false);
ok('host does not match when there is no host in context', l.lessonMatches(lesson(), {}) === false);
ok('task-type matches', l.lessonMatches(lesson({ scope: { type: 'task-type', value: 'research' } }), { taskType: 'research' }) === true);
ok('task-type mismatch', l.lessonMatches(lesson({ scope: { type: 'task-type', value: 'research' } }), { taskType: 'post' }) === false);
ok('tool scope matches a used tool', l.lessonMatches(lesson({ scope: { type: 'tool', value: 'collect_text' } }), { tools: ['navigate', 'collect_text'] }) === true);
ok('tool scope mismatch', l.lessonMatches(lesson({ scope: { type: 'tool', value: 'collect_text' } }), { tools: ['navigate'] }) === false);
ok('an unknown scope type matches nothing (fail closed)', l.lessonMatches(lesson({ scope: { type: 'weird' } }), { host: 'facebook.com' }) === false);

// --- selection: newest first, inactive dropped, capped ---
const many = [
  lesson({ lessonId: 'old', text: 'a', createdAt: '2026-01-01T00:00:00.000Z' }),
  lesson({ lessonId: 'new', text: 'b', createdAt: '2026-06-01T00:00:00.000Z' }),
  lesson({ lessonId: 'mid', text: 'c', createdAt: '2026-03-01T00:00:00.000Z' }),
];
eq('select: newest first', l.selectLessons(many, { host: 'facebook.com' }).map((x) => x.lessonId), ['new', 'mid', 'old']);
eq('select: inactive dropped', l.selectLessons([lesson({ active: false })], { host: 'facebook.com' }), []);
eq('select: blank text dropped', l.selectLessons([lesson({ text: '' })], { host: 'facebook.com' }), []);
eq('select: out-of-scope dropped', l.selectLessons(many, { host: 'google.com' }), []);
eq('select: count cap honoured', l.selectLessons(many, { host: 'facebook.com' }, { maxCount: 2 }).length, 2);
eq('select: nothing at all is fine', l.selectLessons([], { host: 'facebook.com' }), []);
eq('select: null input is fine', l.selectLessons(null, { host: 'facebook.com' }), []);
// A char budget stops a 7B's context being eaten, but at least one must load or
// the whole feature silently does nothing.
const long = [lesson({ lessonId: 'x', text: 'y'.repeat(900) }), lesson({ lessonId: 'z', text: 'short' })];
eq('select: char cap still allows the first', l.selectLessons(long, { host: 'facebook.com' }, { maxChars: 10 }).length, 1);

// --- formatting ---
eq('format: nothing is an empty string (callers concatenate blindly)', l.formatLessons([]), '');
eq('format: null is an empty string', l.formatLessons(null), '');
ok('format: includes a heading', /LESSONS FROM THE USER/.test(l.formatLessons([lesson()])));
ok('format: bullets the text', /- keep posts short/.test(l.formatLessons([lesson()])));
ok('format: custom heading used', /^MY HEAD/.test(l.formatLessons([lesson()], 'MY HEAD')));

// --- similarity + supersede ---
ok('similarity: identical is 1', l.similarity('keep posts short', 'keep posts short') === 1);
ok('similarity: unrelated is 0', l.similarity('keep posts short', 'read five sources') === 0);
ok('similarity: punctuation/case ignored', l.similarity('Keep posts SHORT!', 'keep posts short') === 1);
ok('similarity: empty is 0', l.similarity('', 'anything') === 0);
ok('similarity: a refinement overlaps partially', l.similarity('keep posts short', 'keep posts under 100 words') > 0.3);
// A new rule must REPLACE a near-duplicate, or "shorter posts" and "more
// detail" both fire and the agent gets contradictory instructions.
eq('supersede: a refinement replaces the old rule',
  l.supersededIds([lesson({ lessonId: 'old', text: 'keep posts short' })], { text: 'keep posts under 100 words' }),
  ['old']);
eq('supersede: an unrelated rule is kept',
  l.supersededIds([lesson({ lessonId: 'old', text: 'read five sources' })], { text: 'keep posts under 100 words' }),
  []);
eq('supersede: no existing rules', l.supersededIds([], { text: 'anything' }), []);
eq('supersede: null existing is fine', l.supersededIds(null, { text: 'anything' }), []);

// --- effectiveness attribution ---
eq('attribution: nothing pending → null', l.attributionFor({ status: 'done' }), null);
eq('attribution: empty ids → null', l.attributionFor({ status: 'done', pendingLesson: { lessonIds: [] } }), null);
eq('attribution: done counts a success',
  l.attributionFor({ status: 'done', pendingLesson: { lessonIds: ['a'] } }),
  { lessonIds: ['a'], field: 'successCount' });
eq('attribution: error counts a failure',
  l.attributionFor({ status: 'error', pendingLesson: { lessonIds: ['a'] } }),
  { lessonIds: ['a'], field: 'failCount' });
// The user stopping a task is not the lesson's fault — clear the stamp, count
// neither. A null field is the signal to do exactly that.
eq('attribution: stopped counts neither but still clears',
  l.attributionFor({ status: 'stopped', pendingLesson: { lessonIds: ['a'] } }),
  { lessonIds: ['a'], field: null });
