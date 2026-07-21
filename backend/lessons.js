// Feedback learning — phase 3: scoped lessons injected into prompts.
//
// A "lesson" is a genuine PREFERENCE that cannot be encoded as data (a repoint
// or a skill edit): "keep Facebook posts under 100 words", "read at least 5
// sources". It carries a SCOPE so it only loads for matching work — a flat list
// injected into every prompt is exactly what makes these systems rot.
//
// SITE-SCOPED BY DEFAULT (decided 2026-07-21): the feedback dialog defaults to
// "This site only", so a lesson inherits the host it came from unless the user
// widened it to a task-type or Everywhere. This keeps a Facebook quirk out of a
// research plan.
//
// This module is PURE (no DB/network) so selection, formatting and the
// supersede rule are unit-testable. server.js stores/queries and injects.

const LESSON_SCOPES = new Set(['host', 'tool', 'task-type', 'global']);

const stripWww = (h) => String(h || '').replace(/^www\./, '').toLowerCase();
const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Does a lesson apply to the current work? `ctx` = { host, taskType, tools[] }.
function lessonMatches(lesson, ctx = {}) {
  const sc = lesson.scope || {};
  if (sc.type === 'global') return true;
  if (sc.type === 'host') return !!ctx.host && stripWww(sc.value) === stripWww(ctx.host);
  if (sc.type === 'task-type') return !!ctx.taskType && String(sc.value) === String(ctx.taskType);
  if (sc.type === 'tool') return Array.isArray(ctx.tools) && ctx.tools.includes(sc.value);
  return false;
}

// The lessons that should load for this context, newest first, under HARD caps:
// three lessons applied reliably beat twelve applied unreliably. A 7B has a
// small budget, so an over-budget lesson simply does not load.
function selectLessons(all, ctx = {}, opts = {}) {
  const maxCount = opts.maxCount ?? 5;
  const maxChars = opts.maxChars ?? 600;
  const matching = (all || [])
    .filter((l) => l && l.active !== false && l.text && lessonMatches(l, ctx))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const out = [];
  let chars = 0;
  for (const l of matching) {
    const cost = String(l.text).length + 3; // "- " + newline
    if (out.length >= maxCount) break;
    if (chars + cost > maxChars && out.length) break; // always allow at least one
    out.push(l);
    chars += cost;
  }
  return out;
}

// The prompt block. Empty string when there is nothing — callers concatenate it
// unconditionally.
function formatLessons(lessons, heading) {
  if (!lessons || !lessons.length) return '';
  const head = heading || 'LESSONS FROM THE USER (learned from past corrections — apply when relevant):';
  return [head, ...lessons.map((l) => `- ${String(l.text).trim()}`)].join('\n');
}

// Word-set overlap (Jaccard). Cheap, and enough to tell "keep posts short" from
// "keep posts under 100 words" (a refinement of the same rule) apart from an
// unrelated rule.
function similarity(a, b) {
  const wa = new Set(normalize(a).split(' ').filter(Boolean));
  const wb = new Set(normalize(b).split(' ').filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter);
}

// A new lesson SUPERSEDES (rather than accumulates alongside) near-duplicates in
// the same scope — "shorter posts" then "add more detail" must not both fire.
// `existing` is already the active lessons in the incoming lesson's scope (same
// host+type), so a moderate overlap is enough — a refinement like "keep posts
// short" → "keep posts under 100 words" shares only its topic words. Returns the
// ids to deactivate.
function supersededIds(existing, incoming, threshold = 0.3) {
  return (existing || [])
    .filter((l) => l && l.lessonId && similarity(l.text, incoming.text) >= threshold)
    .map((l) => l.lessonId);
}

// Phase 4 — effectiveness attribution. Given a task that just reached a terminal
// state, decide what to do with the lessons injected during its round: 'done' is
// a success, 'error' a failure, anything else (the user stopping it) counts as
// neither but the stamp is still cleared. Returns null when there is nothing to
// attribute. Pure so the decision is testable; server.js does the DB write.
function attributionFor(task) {
  const pl = task && task.pendingLesson;
  if (!pl || !Array.isArray(pl.lessonIds) || !pl.lessonIds.length) return null;
  const field = task.status === 'done' ? 'successCount'
    : task.status === 'error' ? 'failCount'
    : null; // stopped/other → clear the stamp, count nothing
  return { lessonIds: pl.lessonIds, field };
}

module.exports = {
  LESSON_SCOPES,
  lessonMatches,
  selectLessons,
  formatLessons,
  similarity,
  supersededIds,
  attributionFor,
};
