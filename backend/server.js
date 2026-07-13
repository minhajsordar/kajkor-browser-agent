// Browser Agent - backend
// Receives data from the extension and stores it in MongoDB.
// Each named store (pages, page-details, crm) maps to a Mongo collection whose
// documents are keyed (unique) by `url`. The HTTP API stays shaped like the old
// JSON-file store ({ updatedAt, count, pages: [...] }) so the extension is
// unchanged.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://minhaj:m1nh8j@mdb.softrking.com:27017/browser_agent?authSource=admin&directConnection=true';
const DB_NAME = process.env.MONGODB_DB || 'browser_agent';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEBUG_DIR = path.join(__dirname, '..', 'sample', 'debug');

const app = express();
app.use(cors()); // allow the extension (any origin) to POST
app.use(express.json({ limit: '25mb' })); // large HTML payloads for debug saves

// --- database --------------------------------------------------------------

let db = null;
const collFor = (name) => db.collection(name);

// Connect once at boot, create the unique `url` index per store.
async function connectDb() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  for (const name of ['pages', 'page-details', 'crm']) {
    await collFor(name).createIndex({ url: 1 }, { unique: true });
  }
  await collFor('tasks').createIndex({ taskId: 1 }, { unique: true });
  await collFor('tasks').createIndex({ createdAt: -1 });
  await collFor('schemas').createIndex({ schemaId: 1 }, { unique: true });
  await collFor('schemas').createIndex({ slug: 1 }, { unique: true });
  await collFor('skills').createIndex({ skillId: 1 }, { unique: true });
  await collFor('skills').createIndex({ host: 1 });
  await collFor('debug_items').createIndex({ taskId: 1 });
  console.log(`Mongo connected: ${MONGODB_URI} / ${DB_NAME}`);
}

// Read a whole store in the legacy envelope shape the extension/CRM expect.
// Strips Mongo's _id so payloads match the old JSON files.
async function readStore(name) {
  const pages = await collFor(name).find({}, { projection: { _id: 0 } }).toArray();
  const updatedAt = pages.reduce(
    (max, p) => (p.updatedAt && (!max || p.updatedAt > max) ? p.updatedAt : max),
    null
  );
  return { updatedAt, count: pages.length, pages };
}

// Upsert incoming records by url (newer fields win, existing fields kept).
// Returns how many were newly inserted vs. updated.
async function mergePages(name, incoming) {
  const coll = collFor(name);
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  for (const page of incoming) {
    if (!page || !page.url) continue;
    const res = await coll.updateOne(
      { url: page.url },
      { $set: { ...page, updatedAt: now } },
      { upsert: true }
    );
    if (res.upsertedCount) added++;
    else updated++;
  }
  const total = await coll.countDocuments();
  return { added, updated, total };
}

// --- routes ----------------------------------------------------------------

app.get('/health', (req, res) => res.json({ ok: true, db: !!db }));

// Wire GET/POST/DELETE for a named store backed by a Mongo collection.
function mountStore(route, name) {
  app.get(route, async (req, res) => {
    res.json(await readStore(name));
  });

  app.post(route, async (req, res) => {
    const body = req.body;
    let incoming = [];
    if (Array.isArray(body)) incoming = body;
    else if (Array.isArray(body?.pages)) incoming = body.pages;
    else if (body && body.url) incoming = [body];

    if (incoming.length === 0) {
      return res.status(400).json({ ok: false, error: 'No pages in request body' });
    }

    const { added, updated, total } = await mergePages(name, incoming);
    res.json({ ok: true, added, updated, total });
  });

  app.delete(route, async (req, res) => {
    await collFor(name).deleteMany({});
    res.json({ ok: true });
  });
}

// Feed link list (url + name).
mountStore('/pages', 'pages');
// Validated page details (phone, email, website, address, bio, followers).
mountStore('/page-details', 'page-details');

// Save the HTML of a page whose extraction looked incomplete, so selectors can
// be debugged later. Returns a project-relative path stored on the record.
function slugify(s) {
  return (s || 'page').toString().toLowerCase()
    .replace(/https?:\/\//, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60) || 'page';
}

app.post('/debug-html', (req, res) => {
  const { url, name, html } = req.body || {};
  if (!html) return res.status(400).json({ ok: false, error: 'No html provided' });
  try {
    if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const filename = `${slugify(name || url)}-${Date.now()}.html`;
    const banner = `<!-- debug capture\n  url: ${url || ''}\n  name: ${name || ''}\n  savedAt: ${new Date().toISOString()}\n-->\n`;
    fs.writeFileSync(path.join(DEBUG_DIR, filename), banner + html);
    res.json({ ok: true, file: `sample/debug/${filename}` });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// CRM pipeline state, keyed by page url. Kept separate from page-details so the
// scraped contact data stays read-only. Scalars are merged; activities appended.
app.get('/crm', async (req, res) => res.json(await readStore('crm')));

app.post('/crm', async (req, res) => {
  const { url, status, notes, activity } = req.body || {};
  if (!url) return res.status(400).json({ ok: false, error: 'url required' });

  const coll = collFor('crm');
  const now = new Date().toISOString();

  let rec = await coll.findOne({ url }, { projection: { _id: 0 } });
  if (!rec) {
    rec = { url, status: 'new', notes: '', activities: [], createdAt: now };
  }
  if (typeof status === 'string') rec.status = status;
  if (typeof notes === 'string') rec.notes = notes;
  if (activity && activity.channel) {
    rec.activities = rec.activities || [];
    rec.activities.push({
      at: now,
      channel: activity.channel,           // whatsapp | email | messenger | note | status
      type: activity.type || '',           // welcome | proposal | followup | closing | ''
      note: activity.note || ''
    });
  }
  rec.updatedAt = now;
  await coll.updateOne({ url }, { $set: rec }, { upsert: true });
  res.json({ ok: true, record: rec });
});

// ======================= Agent: Ollama proxy + Tasks ========================
//
// The agent is plan-and-execute, NOT a live tool-calling loop:
//   1. LLM turns the NL goal into a JSON array of execution phases (a plan).
//   2. The extension runs each phase (deterministic browser tool).
//   3. Backend checks the target -> repeat / done / error.
// EVERY state change is persisted to the task doc so a power cut can be resumed.

const nowIso = () => new Date().toISOString();
const tasksColl = () => collFor('tasks');

// Tool catalog the planner LLM may use. Implementations live in the extension
// background — names here MUST match there.
const TOOL_CATALOG = [
  { name: 'navigate', params: ['url', 'newTab'],
    desc: 'Open a web page by full URL. Set newTab=true to force a NEW tab; otherwise an already-open tab on the same site is reused.' },
  { name: 'scroll', params: ['times', 'delay'],
    desc: 'Scroll the current page down `times` steps WITHOUT collecting anything. Use when the user only wants to scroll.' },
  { name: 'click', params: ['selector', 'text'],
    desc: 'Click the element matching a CSS `selector` on the current page (or the first element whose visible text contains `text`). Use for buttons, links, tabs, "See more", etc.' },
  { name: 'hover', params: ['selector', 'text'],
    desc: 'Hover (mouseover) the element matching a CSS `selector` (or containing `text`) on the current page — e.g. to reveal a menu or tooltip.' },
  { name: 'scroll_and_collect_links', params: ['target', 'delay'],
    desc: 'On a Facebook feed, scroll and collect up to `target` unique page links with names, saving them to the database.' },
  { name: 'visit_and_extract_details', params: [],
    desc: 'Open each collected page and extract full details (name, phone, email, website, address, followers), saving them to the database.' },
  { name: 'use_skill', params: ['skill'],
    desc: 'Perform a learned single-element skill (click/scroll/read…) by its name on the current page.' },
  { name: 'collect_by_skill', params: ['skill', 'target'],
    desc: 'Use a learned "collection" skill to scroll and extract its taught fields from each repeating item (e.g. each post), saving up to `target` records.' },
  { name: 'collect_text', params: ['selector', 'target'],
    desc: 'Scroll and collect the FULL inner text of every element matching a CSS selector on the current page (e.g. "[role=article]" for posts, ".comment" for comments). Each block is saved as one record with a "text" field. Use when the user wants the whole text content of repeating elements.' },
  { name: 'find_post', params: ['query', 'target'],
    desc: 'FIND specific post(s): scan feed posts ONE BY ONE (scrolling post by post, skipping none) and AI-check each against `query` — a short description of the wanted post\'s topic. Saves every matching post (full text + link) and stops after `target` matches (usually 1). Use whenever the user asks to find / look for / search a post about something. It scrolls itself — never add a scroll phase with it.' },
  { name: 'ai_verify', params: ['source', 'fields', 'instruction'],
    desc: 'AI verification/correction pass AFTER collecting. For each collected record it gives the model the record\'s full source text (the `source` field, e.g. "text" or an innerText field holding the whole item) and the extracted `fields`, then checks each field against the source and rewrites wrong/badly-formatted values using ONLY what the source contains. Add this as the LAST phase when the user asks to verify/compare/correct collected fields.' },
];
const TOOL_NAMES = new Set(TOOL_CATALOG.map((t) => t.name));

// JSON schema handed to Ollama as `format` so generation is grammar-constrained
// to a valid plan shape — small models can't emit malformed structure this way.
function planSchema() {
  return {
    type: 'object',
    properties: {
      target: {
        type: 'object',
        properties: {
          metric: { type: 'string', enum: ['links', 'details', 'scrolls', 'items', 'texts', 'actions'] },
          count: { type: 'integer' },
        },
        required: ['metric', 'count'],
      },
      phases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            tool: { type: 'string', enum: [...TOOL_NAMES] },
            params: { type: 'object' },
          },
          required: ['tool', 'params'],
        },
      },
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: { key: { type: 'string' }, label: { type: 'string' }, type: { type: 'string' } },
              required: ['key'],
            },
          },
        },
      },
    },
    required: ['target', 'phases'],
  };
}

function planningSystemPrompt(schemas, skills) {
  const tools = TOOL_CATALOG.map((t) => `- ${t.name}(${t.params.join(', ')}): ${t.desc}`).join('\n');
  const base = [
    'You are a browser-automation task planner.',
    'Convert the user task into a JSON execution plan using ONLY the tools below.',
    '',
    'Tools:',
    tools,
    '',
    'Rules:',
    '- Output STRICT JSON only. No prose, no markdown, no code fences.',
    '- "target.metric" is one of: "links" (collecting page links), "details" (extracting page details), "scrolls" (only scrolling, no data collection), or "texts" (collecting full inner text of elements via collect_text).',
    '- "target.count" is the number the user asked for.',
    '- If the user says NOT to collect data, use the `scroll` tool and metric "scrolls". Otherwise use `scroll_and_collect_links`.',
    '- For UI interactions (clicking buttons/links/tabs, hovering to reveal menus) use the `click` and `hover` tools; if the task is only interactions (no data collected) use metric "actions" with count = number of interaction steps.',
    '- For navigate, set params.newTab to true ONLY if the user explicitly asks to open a NEW tab; if they refer to the current/existing tab, omit newTab.',
    '- Phases run in order. Use the fewest phases needed.',
    '- If the user asks to verify/compare/correct collected fields against a fuller text, add an "ai_verify" phase LAST, with params.source set to the field holding the full text.',
    '- To FIND a post about a topic, use find_post (metric "items", count = how many posts to find, usually 1). find_post scrolls post-by-post itself — do NOT add scroll or collect_text phases with it.',
    '',
    'Example — "find a post about baby products":',
    '{"target":{"metric":"items","count":1},"phases":[{"tool":"navigate","params":{"url":"https://www.facebook.com"}},{"tool":"find_post","params":{"query":"baby products","target":1}}]}',
    'Example — "collect page link and name from 10 posts":',
    '{"target":{"metric":"links","count":10},"phases":[{"tool":"navigate","params":{"url":"https://www.facebook.com"}},{"tool":"scroll_and_collect_links","params":{"target":10}}]}',
    'Example — "open facebook and only scroll 10 times, do not collect":',
    '{"target":{"metric":"scrolls","count":10},"phases":[{"tool":"navigate","params":{"url":"https://www.facebook.com"}},{"tool":"scroll","params":{"times":10}}]}',
    'Example — "on the current page, hover the menu then click the Settings link":',
    '{"target":{"metric":"actions","count":2},"phases":[{"tool":"hover","params":{"text":"menu"}},{"tool":"click","params":{"text":"Settings"}}]}',
    'Example — "collect the full text of 5 posts":',
    '{"target":{"metric":"texts","count":5},"phases":[{"tool":"navigate","params":{"url":"https://www.facebook.com"}},{"tool":"collect_text","params":{"selector":"[role=\\"article\\"]","target":5}}]}',
  ];
  if (skills && skills.length) {
    base.push('', 'Learned skills you can use (reference by exact name):');
    for (const s of skills) {
      if (s.kind === 'collection') base.push(`- collect_by_skill skill="${s.name}" → fields: ${(s.fields || []).map((f) => f.name).join(', ')}  [${s.urlPattern}]`);
      else base.push(`- use_skill skill="${s.name}" (${s.action})  [${s.urlPattern}]`);
    }
    base.push('Prefer collect_by_skill (metric "items") when a matching collection skill exists for the data requested.');
  }
  if (schemas && schemas.length) {
    base.push('', 'Collected data will be saved into these schemas (field keys):');
    for (const s of schemas) base.push(`- ${s.name}: ${s.fields.map((f) => f.key).join(', ')}`);
  } else {
    base.push(
      '',
      'No schema was provided. If the task collects data (metric "links" or "details"),',
      'ALSO output a "schema" object defining the data table to save into:',
      '  "schema": {"name": "<short name>", "fields": [{"key":"name","label":"Name","type":"text"}, ...]}',
      '- Infer the fields from what the user describes wanting to collect.',
      '- If the user does not describe fields, choose sensible ones for the data.',
      '- Choose field "key" names freely to fit the data — this is a general agent.',
      '- Hint: the current Facebook tools fill these keys, so prefer them when collecting',
      '  Facebook page data (otherwise values stay empty): name, url, category, followers,',
      '  phone, email, website, address, bio, instagram, tiktok.',
      '- Omit "schema" only for scroll-only tasks (metric "scrolls").',
    );
  }
  return base.join('\n');
}

// Validate + normalize the LLM plan. Returns null if unusable.
function normalizePlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const phases = Array.isArray(plan.phases) ? plan.phases : null;
  if (!phases || !phases.length) return null;
  const clean = [];
  for (const ph of phases) {
    if (!ph || !TOOL_NAMES.has(ph.tool)) return null;
    clean.push({ tool: ph.tool, params: (ph.params && typeof ph.params === 'object') ? ph.params : {} });
  }
  let target = plan.target;
  if (!target || typeof target !== 'object' || !Number(target.count)) {
    const sc = clean.find((p) => p.tool === 'scroll_and_collect_links');
    const cbs = clean.find((p) => p.tool === 'collect_by_skill');
    const ct = clean.find((p) => p.tool === 'collect_text');
    const scr = clean.find((p) => p.tool === 'scroll');
    const fp = clean.find((p) => p.tool === 'find_post');
    if (fp) target = { metric: 'items', count: Number(fp.params.target) || 1 };
    else if (cbs && Number(cbs.params.target)) target = { metric: 'items', count: Number(cbs.params.target) };
    else if (ct && Number(ct.params.target)) target = { metric: 'texts', count: Number(ct.params.target) };
    else if (sc && Number(sc.params.target)) target = { metric: 'links', count: Number(sc.params.target) };
    else if (scr && Number(scr.params.times)) target = { metric: 'scrolls', count: Number(scr.params.times) };
    else {
      // Pure action task (click/hover/scroll only): target = number of such phases.
      const acts = clean.filter((p) => ['click', 'hover', 'scroll'].includes(p.tool)).length;
      if (acts) target = { metric: 'actions', count: acts };
      else return null;
    }
  }
  const metric = ['links', 'details', 'scrolls', 'items', 'texts', 'actions'].includes(target.metric) ? target.metric : 'links';
  return { target: { metric, count: Number(target.count) }, phases: clean };
}

// Small local models often drop essential phases. Complete the plan
// deterministically so it can actually run: guarantee navigate -> collect ->
// (extract for details), keep a single navigate first, and fix scroll targets.
// Returns { plan, repaired } — repaired lists what was added, for the log.
function repairPlan(plan) {
  const repaired = [];
  let phases = plan.phases.slice();
  const has = (t) => phases.some((p) => p.tool === t);
  const metric = plan.target.metric;

  if (metric === 'scrolls') {
    if (!has('scroll')) {
      phases.push({ tool: 'scroll', params: { times: plan.target.count } });
      repaired.push('added scroll');
    }
    for (const p of phases) if (p.tool === 'scroll' && !Number(p.params.times)) p.params.times = plan.target.count;
  } else if (metric === 'items') {
    // Skill/find collection: both tools scroll themselves. Just fix their targets.
    for (const p of phases) {
      if ((p.tool === 'collect_by_skill' || p.tool === 'find_post') && !Number(p.params.target)) p.params.target = plan.target.count;
    }
    // find_post steps through posts itself — blind scroll/collect phases before
    // it just skip past posts (and models emit broken selectors). Drop them.
    if (phases.some((p) => p.tool === 'find_post')) {
      const n = phases.length;
      phases = phases.filter((p) => !['scroll', 'collect_text', 'scroll_and_collect_links'].includes(p.tool));
      if (phases.length !== n) repaired.push('removed blind scroll/collect phases (find_post scans post-by-post itself)');
    }
  } else if (metric === 'texts') {
    // collect_text scrolls itself; ensure the phase exists and has a target.
    if (!has('collect_text')) {
      phases.push({ tool: 'collect_text', params: { selector: '[role="article"]', target: plan.target.count } });
      repaired.push('added collect_text');
    }
    for (const p of phases) if (p.tool === 'collect_text' && !Number(p.params.target)) p.params.target = plan.target.count;
  } else if (metric === 'actions') {
    // Pure click/hover/scroll task — nothing to auto-complete.
  } else {
    if (!has('scroll_and_collect_links')) {
      phases.push({ tool: 'scroll_and_collect_links', params: { target: plan.target.count } });
      repaired.push('added scroll_and_collect_links');
    }
    for (const p of phases) if (p.tool === 'scroll_and_collect_links' && !Number(p.params.target)) p.params.target = plan.target.count;
    if (metric === 'details' && !has('visit_and_extract_details')) {
      phases.push({ tool: 'visit_and_extract_details', params: {} });
      repaired.push('added visit_and_extract_details');
    }
  }
  // Pure action tasks act on the CURRENT tab — don't force a Facebook navigate.
  if (!has('navigate') && metric !== 'actions') {
    phases.unshift({ tool: 'navigate', params: { url: 'https://www.facebook.com' } });
    repaired.push('added navigate');
  }

  // Enforce order: one navigate first, then scroll/collect/act, then extract, then verify.
  const order = { navigate: 0, scroll: 1, click: 1, hover: 1, scroll_and_collect_links: 1, use_skill: 1, collect_by_skill: 1, collect_text: 1, find_post: 1, visit_and_extract_details: 2, ai_verify: 3 };
  const nav = phases.filter((p) => p.tool === 'navigate').slice(0, 1);
  const rest = phases.filter((p) => p.tool !== 'navigate')
    .sort((a, b) => (order[a.tool] ?? 9) - (order[b.tool] ?? 9));

  return { plan: { target: plan.target, phases: [...nav, ...rest] }, repaired };
}

// Classify a field by the concept its NAME encodes, so a task request ("publisher
// link") can be matched to the right field (the link, not the image).
function fieldConcept(name) {
  const n = (name || '').toLowerCase();
  if (/image|photo|picture|\bpic\b|thumb|avatar/.test(n)) return 'image';
  if (/link|url|href|profile/.test(n)) return 'link';
  if (/text|content|caption|body|desc|message/.test(n)) return 'text';
  if (/name|publisher|author|user|title/.test(n)) return 'name';
  if (/reaction|like|love|emoji/.test(n)) return 'reaction';
  if (/share/.test(n)) return 'share';
  if (/comment/.test(n)) return 'comment';
  if (/time|date|ago|posted/.test(n)) return 'time';
  return 'other';
}
const GOAL_CONCEPT = {
  image: /\b(image|images|photo|photos|picture|pictures|pic|pics|thumbnail|avatar)\b/i,
  link: /\b(link|links|url|urls|href|address)\b/i,
  text: /\b(text|content|contents|caption|captions|body|description|full text|message)\b/i,
  name: /\b(name|names|publisher|publishers|author|authors|username|title)\b/i,
  reaction: /\b(reaction|reactions|like|likes|love|loves)\b/i,
  share: /\b(share|shares)\b/i,
  comment: /\b(comment|comments)\b/i,
  time: /\b(time|date|timestamp|posted|ago)\b/i,
};

// Which of a collection skill's READ fields the task explicitly asked for.
// Returns [] to mean "no explicit subset — collect all" (safe fallback).
function requestedReadFields(goal, skillFields) {
  const g = ' ' + (goal || '').toLowerCase() + ' ';
  const reads = (skillFields || []).filter((f) => f.attr !== 'click');
  const matched = reads.filter((f) => {
    // direct: a distinctive word of the field name appears in the goal
    // (skip the ambiguous shared words that match several fields)
    // Ignore ambiguous words shared across fields / the item-type word ("post(s)")
    // so only a distinctive word triggers a direct match.
    const STOP = ['profile', 'publisher', 'post', 'posts', 'item', 'items', 'element', 'elements', 'button', 'content'];
    const words = f.name.toLowerCase().split(/[_\s]+/)
      .filter((w) => w.length > 3 && !STOP.includes(w));
    if (words.some((w) => g.includes(w))) return true;
    const c = fieldConcept(f.name);
    return GOAL_CONCEPT[c] ? GOAL_CONCEPT[c].test(g) : false;
  });
  return matched.map((f) => f.name);
}

// Click fields to keep alongside a requested read subset: "see more" expanders
// when text is wanted, plus any action (like/share) the goal explicitly names.
function requestedClickFields(goal, skillFields, wantedReads) {
  const g = ' ' + (goal || '').toLowerCase() + ' ';
  const wantsText = wantedReads.some((w) => fieldConcept(w) === 'text');
  return (skillFields || []).filter((f) => f.attr === 'click').filter((f) => {
    const nm = f.name.toLowerCase();
    if (/more|expand|read|see/.test(nm)) return wantsText;       // expander helps text
    const c = fieldConcept(f.name);
    return GOAL_CONCEPT[c] ? GOAL_CONCEPT[c].test(g) : false;     // e.g. "hit like"
  }).map((f) => f.name);
}

// The count the user explicitly stated, so the model can't override it. Returns
// a number, or null if the goal names no specific amount.
function requestedCount(goal) {
  const g = ' ' + (goal || '').toLowerCase() + ' ';
  // explicit "one/single/first/a" (with an optional adjective: "a facebook post")
  if (/\b(?:a|an|first|single|one|1)\s+(?:[a-z]+\s+)?(?:post|item|row|page|element|comment|result|link)\b/.test(g)) return 1;
  if (/\b(only|just)\s+(one|1|a single|the first)\b/.test(g)) return 1;
  if (/\b(do\s?n'?t|do not|no|not)\s+(do\s+)?(more than|over)\s+(a\s+)?(one|1)\b/.test(g)) return 1;
  if (/\b(at most|no more than|maximum of|max)\s+(a\s+)?(one|1)\b/.test(g)) return 1;
  // an explicit number attached to a unit
  const unit = g.match(/\b(\d{1,4})\s*(posts?|items?|rows?|pages?|comments?|times?|links?|results?|elements?)\b/);
  if (unit) return Number(unit[1]);
  // "at most / no more than / only N"
  const cap = g.match(/\b(?:at most|no more than|maximum of|max|only|just)\s+(\d{1,4})\b/);
  if (cap) return Number(cap[1]);
  return null;
}

// Data the user asked for that no existing (skill) field covers — ai_verify will
// extract these from each item's full text. Returns normalized field defs.
function deriveExtraFields(goal, existing) {
  const g = ' ' + (goal || '').toLowerCase() + ' ';
  const have = new Set((existing || []).map((f) => fieldConcept(f.key)));
  const out = [];
  const add = (concept, key, label) => {
    if (have.has(concept) || (existing || []).some((f) => f.key === key)) return;
    out.push({ key, label, type: 'text' }); have.add(concept);
  };
  if (GOAL_CONCEPT.reaction.test(g)) add('reaction', 'reaction_count', 'Reactions');
  if (GOAL_CONCEPT.share.test(g)) add('share', 'share_count', 'Shares');
  if (GOAL_CONCEPT.comment.test(g)) add('comment', 'comment_count', 'Comments');
  if (GOAL_CONCEPT.time.test(g)) add('time', 'posted_time', 'Posted');
  if (GOAL_CONCEPT.name.test(g)) add('name', 'publisher_name', 'Publisher');
  return normFields(out);
}

// ---- Ollama proxy: list only tool-calling models ----
app.get('/models', async (req, res) => {
  try {
    const list = (await (await fetch(`${OLLAMA_URL}/api/tags`)).json()).models || [];
    const models = [];
    for (const m of list) {
      let caps = m.capabilities;
      if (!Array.isArray(caps)) {
        try {
          const s = await fetch(`${OLLAMA_URL}/api/show`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: m.name }),
          }).then((x) => x.json());
          caps = s.capabilities;
        } catch {}
      }
      if (Array.isArray(caps) && caps.includes('tools')) models.push({ name: m.name, size: m.size, paramSize: m.details?.parameter_size || '' });
    }
    res.json({ ok: true, models });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'Ollama not reachable at ' + OLLAMA_URL, models: [] });
  }
});

// Rough task-complexity score (0..6): harder tasks warrant a bigger model.
function taskComplexity(goal) {
  const g = (goal || '').toLowerCase();
  let score = 0;
  if (g.length > 200) score += 2; else if (g.length > 90) score += 1;
  if (/\b(verify|compare|correct|validate|analy[sz]e|summari[sz]e|extract|reason)\b/.test(g)) score += 2;
  // Structured data collection (schema/skill/field reasoning) needs a capable model.
  if (/\b(collect|scrape|gather|extract)\b/.test(g)) score += 2;
  const steps = (g.match(/\b(scroll|collect|click|hover|open|navigate|visit|verify|compare|check|extract|then|also)\b/g) || []).length;
  if (steps >= 6) score += 2; else if (steps >= 3) score += 1;
  return score;
}

// Resolve which model to actually use. 'auto' ranks installed tool-capable models
// by size and picks bigger for more complex tasks. Returns { name, why }.
async function resolveModel(requested, goal) {
  if (requested && requested !== 'auto') return { name: requested, why: '' };
  const models = [];
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`).then((x) => x.json());
    for (const m of (r.models || [])) {
      let caps = m.capabilities;
      if (!Array.isArray(caps)) {
        try {
          caps = (await fetch(`${OLLAMA_URL}/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.name }) }).then((x) => x.json())).capabilities;
        } catch {}
      }
      if (Array.isArray(caps) && caps.includes('tools')) models.push({ name: m.name, size: m.size || 0 });
    }
  } catch {}
  if (!models.length) return { name: requested || null, why: '' };
  models.sort((a, b) => a.size - b.size); // small -> large
  const score = taskComplexity(goal);
  const tier = score >= 4 ? models.length - 1
    : score >= 2 ? Math.min(models.length - 1, Math.ceil((models.length - 1) / 2))
    : 0;
  const pick = models[tier];
  const band = score >= 4 ? 'complex' : score >= 2 ? 'moderate' : 'simple';
  return { name: pick.name, why: `auto-selected ${pick.name} for a ${band} task (complexity ${score}/6)` };
}

// ---- Tasks store ----
app.get('/tasks', async (req, res) => {
  const tasks = await tasksColl().find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 }).limit(50).toArray();
  res.json({ ok: true, tasks });
});

app.get('/tasks/:id', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, task });
});

app.post('/tasks', async (req, res) => {
  const { goal, model, mode, schemas, useSkills } = req.body || {};
  if (!goal || !model) return res.status(400).json({ ok: false, error: 'goal and model required' });

  // Snapshot the chosen schemas onto the task so tools + resume stay stable
  // even if the schema is later edited or deleted.
  let taskSchemas = [];
  const ids = Array.isArray(schemas) ? schemas : [];
  if (ids.length) {
    const docs = await collFor('schemas').find({ schemaId: { $in: ids } }, { projection: { _id: 0 } }).toArray();
    taskSchemas = docs.map((s) => ({ schemaId: s.schemaId, name: s.name, slug: s.slug, dataCollection: s.dataCollection, fields: s.fields }));
  }

  // Snapshot explicitly chosen learned skills so planning routes to them.
  let taskUseSkills = [];
  const skIds = Array.isArray(useSkills) ? useSkills : [];
  if (skIds.length) {
    const docs = await collFor('skills').find({ skillId: { $in: skIds } }, { projection: { _id: 0 } }).toArray();
    taskUseSkills = docs.map((s) => ({ skillId: s.skillId, name: s.name, kind: s.kind, action: s.action, fields: s.fields, urlPattern: s.urlPattern }));
  }

  const task = {
    taskId: crypto.randomUUID(),
    goal, model, mode: mode || 'once',
    schemas: taskSchemas,        // schemas this task saves collected data into
    useSkills: taskUseSkills,    // learned skills the task should use
    status: 'planning',          // planning|running|checking|done|error|stopped
    plan: null,
    currentPhaseIndex: 0,
    collected: [],               // task-scoped {url,name} collected this task
    extracted: [],               // task-scoped urls whose details were extracted
    scrolls: 0,                  // task-scoped scroll steps performed (scroll tool)
    repeats: 0,
    maxRepeats: 3,
    messages: [],                // LLM planning transcript (audit/resume)
    events: [{ at: nowIso(), kind: 'think', msg: 'Task created.' }],
    errors: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    finishedAt: null,
  };
  await tasksColl().insertOne({ ...task });
  res.json({ ok: true, task });
});

// Whitelisted field updates (the extension persists progress through here).
const PATCHABLE = new Set(['status', 'currentPhaseIndex', 'collected', 'extracted', 'scrolls', 'repeats', 'plan', 'finishedAt', 'messages']);
app.patch('/tasks/:id', async (req, res) => {
  const set = {};
  for (const [k, v] of Object.entries(req.body || {})) if (PATCHABLE.has(k)) set[k] = v;
  set.updatedAt = nowIso();
  const doc = await tasksColl().findOneAndUpdate(
    { taskId: req.params.id }, { $set: set },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  res.json({ ok: true, task: doc?.value || doc });
});

app.delete('/tasks/:id', async (req, res) => {
  await tasksColl().deleteOne({ taskId: req.params.id });
  res.json({ ok: true });
});

// Debug: raw HTML of each item a collect_by_skill run matched. Replaces the
// previous run's items so it reflects the latest collection.
app.post('/tasks/:id/debug-items', async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  await collFor('debug_items').deleteMany({ taskId: req.params.id });
  if (items.length) {
    await collFor('debug_items').insertMany(items.map((it, i) => ({
      taskId: req.params.id, index: it.index ?? i,
      html: (it.html || '').slice(0, 30000), text: (it.text || '').slice(0, 8000), data: it.data || {}, at: nowIso(),
    })));
  }
  res.json({ ok: true, saved: items.length });
});

app.get('/tasks/:id/debug-items', async (req, res) => {
  const items = await collFor('debug_items').find({ taskId: req.params.id }, { projection: { _id: 0 } }).sort({ index: 1 }).toArray();
  res.json({ ok: true, items });
});

app.post('/tasks/:id/event', async (req, res) => {
  const { kind, msg } = req.body || {};
  await tasksColl().updateOne(
    { taskId: req.params.id },
    { $push: { events: { at: nowIso(), kind: kind || 'obs', msg: msg || '' } }, $set: { updatedAt: nowIso() } }
  );
  res.json({ ok: true });
});

app.post('/tasks/:id/error', async (req, res) => {
  const { phase, message } = req.body || {};
  await tasksColl().updateOne(
    { taskId: req.params.id },
    { $push: { errors: { at: nowIso(), phase: phase || '', message: message || '' } }, $set: { updatedAt: nowIso() } }
  );
  res.json({ ok: true });
});

// ---- Planning: NL goal -> JSON phases (LLM), persisted to the task ----
app.post('/tasks/:id/plan', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });

  // Resolve 'auto' (or empty) model → a size-appropriate installed model, and
  // persist it so every phase (planning, ai_verify) uses the same one.
  const resolved = await resolveModel(task.model, task.goal);
  const modelEvents = [];
  if (resolved.name && resolved.name !== task.model) {
    task.model = resolved.name;
    await tasksColl().updateOne({ taskId: task.taskId }, { $set: { model: resolved.name, updatedAt: nowIso() } });
    if (resolved.why) modelEvents.push({ at: nowIso(), kind: 'think', msg: resolved.why + '.' });
  }

  const skills = await skillsColl().find({}, { projection: { _id: 0 } }).toArray();
  const messages = [
    { role: 'system', content: planningSystemPrompt(task.schemas, skills) },
    { role: 'user', content: task.goal },
  ];

  // Small local models are flaky. temp 0 is deterministic, so a failed parse
  // would repeat — retry with a small temperature bump to shake it loose.
  let raw = '';
  let plan = null;
  let parsed = null;
  const temps = [0, 0.4];
  for (const temperature of temps) {
    try {
      const j = await (await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: task.model, messages, stream: false, format: planSchema(), options: { temperature } }),
      })).json();
      raw = j.message?.content || '';
    } catch (e) {
      await tasksColl().updateOne({ taskId: task.taskId }, {
        $set: { status: 'error', updatedAt: nowIso() },
        $push: { errors: { at: nowIso(), phase: 'plan', message: 'Ollama error: ' + e.message } },
      });
      return res.json({ ok: false, error: 'Ollama error: ' + e.message });
    }
    try { parsed = JSON.parse(raw); plan = normalizePlan(parsed); } catch { parsed = null; plan = null; }
    if (plan) break;
  }

  if (!plan) {
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $set: { status: 'error', updatedAt: nowIso() },
      $push: { errors: { at: nowIso(), phase: 'plan', message: 'Invalid plan. Raw: ' + raw.slice(0, 300) } },
    });
    return res.json({ ok: false, error: 'Invalid plan from model' });
  }

  const fixed = repairPlan(plan);
  plan = fixed.plan;

  // Strictly honor an explicit count in the goal (models often ignore "only one").
  const wantCount = requestedCount(task.goal);
  if (wantCount != null && wantCount !== plan.target.count) {
    const was = plan.target.count;
    plan.target.count = wantCount;
    for (const ph of plan.phases) {
      if (ph.params && Object.prototype.hasOwnProperty.call(ph.params, 'target')) ph.params.target = wantCount;
      if (ph.tool === 'scroll' && ph.params && ph.params.times) ph.params.times = wantCount;
    }
    modelEvents.push({ at: nowIso(), kind: 'think', msg: `Count set to ${wantCount} from your instruction (model said ${was}).` });
  }

  // Tab intent is easy to state but small models miss it — decide it from the
  // goal text deterministically.
  const nav = plan.phases.find((p) => p.tool === 'navigate');
  if (nav) {
    if (/\bnew tab\b/i.test(task.goal)) nav.params.newTab = true;
    else if (/\b(current|this|existing|same)\s+tab\b/i.test(task.goal)) delete nav.params.newTab;
  }

  messages.push({ role: 'assistant', content: raw });
  const events = [...modelEvents, { at: nowIso(), kind: 'obs', msg: `Planned ${plan.phases.length} phases, target ${plan.target.count} ${plan.target.metric}.` }];
  if (fixed.repaired.length) events.push({ at: nowIso(), kind: 'think', msg: 'Plan completed: ' + fixed.repaired.join(', ') + '.' });

  // Deterministic find routing: "find/search a post about X" MUST use find_post.
  // Small models mangle this into scroll + collect_text with invalid selectors
  // and a "scrolls" target, which finishes without ever finding anything.
  const findIntent = /\b(find|look\s+for|search(?:\s+for)?|locate)\b[\s\S]{0,80}\bposts?\b/i.test(task.goal);
  if (findIntent && !plan.phases.some((p) => p.tool === 'find_post')) {
    const quoted = task.goal.match(/["“']([^"”']{2,80})["”']/);
    const about = task.goal.match(/\b(?:about|discuss(?:es|ing|ed)?(?:\s+about)?|regarding|related\s+to|selling)\s+["“']?([^."”'\n]{2,80})/i);
    const query = ((quoted && quoted[1]) || (about && about[1]) || task.goal).trim();
    const n = wantCount != null ? wantCount : 1;
    plan.target = { metric: 'items', count: n };
    plan.phases = plan.phases.filter((p) =>
      !['scroll', 'collect_text', 'scroll_and_collect_links', 'visit_and_extract_details', 'collect_by_skill', 'ai_verify'].includes(p.tool));
    plan.phases.push({ tool: 'find_post', params: { query, target: n } });
    events.push({ at: nowIso(), kind: 'think', msg: `Find task → scanning posts one by one for "${query}" (find_post, target ${n}).` });
  }

  // If the user picked no schema and the task collects data, create a
  // task-owned schema now — from the model's suggestion, else defaults.
  // Deterministic skill routing. Prefer a skill the user explicitly picked;
  // else fall back to matching a taught collection skill named in the goal.
  if (plan.target.metric !== 'scrolls' && !plan.phases.some((p) => p.tool === 'find_post')) {
    let routeSkill = (task.useSkills || []).find((s) => s.kind === 'collection') || null;
    if (!routeSkill && plan.target.metric !== 'items' && skills.length) {
      const g = task.goal.toLowerCase();
      routeSkill = skills.find((s) => s.kind === 'collection' &&
        (g.includes(s.name.toLowerCase()) || g.includes(s.name.toLowerCase().replace(/_/g, ' ')))) || null;
    }
    if (routeSkill) {
      // Use the full skill doc (task snapshot may be trimmed) for its field list.
      const fullSkill = skills.find((s) => s.name === routeSkill.name && s.kind === 'collection') || routeSkill;
      plan.target = { metric: 'items', count: plan.target.count };
      // Skill collection covers it — drop other collectors incl. collect_text.
      plan.phases = plan.phases.filter((p) => !['scroll_and_collect_links', 'visit_and_extract_details', 'collect_text'].includes(p.tool));
      // Collect ONLY the fields the task asked for (else all — safe fallback).
      const wantedReads = requestedReadFields(task.goal, fullSkill.fields);
      const params = { skill: routeSkill.name, target: plan.target.count };
      if (wantedReads.length) {
        params.fields = [...wantedReads, ...requestedClickFields(task.goal, fullSkill.fields, wantedReads)];
      }
      const cbs = plan.phases.find((p) => p.tool === 'collect_by_skill');
      if (cbs) cbs.params = params;
      else plan.phases.push({ tool: 'collect_by_skill', params });
      const nav = plan.phases.filter((p) => p.tool === 'navigate').slice(0, 1);
      plan.phases = [...nav, ...plan.phases.filter((p) => p.tool !== 'navigate')];
      const only = wantedReads.length ? ` (fields: ${wantedReads.join(', ')})` : '';
      events.push({ at: nowIso(), kind: 'think', msg: `Using learned skill "${routeSkill.name}" to collect${only}.` });
    }
  }

  // If the user asked to verify/compare/correct, guarantee an ai_verify LAST phase.
  if (/\b(verify|compare|correct|validate|cross.?check|double.?check|check if|make sure)\b/i.test(task.goal)
      && !plan.phases.some((p) => p.tool === 'ai_verify')
      && plan.phases.some((p) => ['collect_by_skill', 'collect_text', 'scroll_and_collect_links', 'visit_and_extract_details'].includes(p.tool))) {
    plan.phases.push({ tool: 'ai_verify', params: {} });
    events.push({ at: nowIso(), kind: 'think', msg: 'Added AI verification pass (ai_verify) as the final phase.' });
  }

  const set = { plan, status: 'running', currentPhaseIndex: 0, messages, updatedAt: nowIso() };
  if ((!task.schemas || !task.schemas.length) && plan.target.metric !== 'scrolls') {
    let fields = [], chosen = '', nm = '';
    // Prefer the learned skill's taught fields when collecting by skill.
    if (plan.target.metric === 'items') {
      const cbs = plan.phases.find((p) => p.tool === 'collect_by_skill');
      const skill = cbs && skills.find((s) => s.name === cbs.params.skill && s.kind === 'collection');
      if (skill && skill.fields?.length) {
        const keep = Array.isArray(cbs.params.fields) ? cbs.params.fields : null; // requested subset
        let ff = skill.fields.filter((f) => f.attr !== 'click');
        if (keep) ff = ff.filter((f) => keep.includes(f.name));
        fields = normFields(ff.map((f) => ({
          key: f.name, label: f.name,
          type: f.attr === 'src' ? 'image' : (f.attr === 'href' ? 'url' : 'text'),
        })));
        chosen = `from skill "${skill.name}"`; nm = `Data: ${skill.name}`;
      }
    }
    // find_post yields the matching post's text, link, and why it matched.
    if (!fields.length && plan.phases.some((p) => p.tool === 'find_post')) {
      fields = normFields([
        { key: 'text', label: 'Post text', type: 'text' },
        { key: 'url', label: 'URL', type: 'url' },
        { key: 'match_reason', label: 'Why it matched', type: 'text' },
      ]);
      chosen = 'found posts'; nm = 'Found posts';
    }
    // collect_text always yields a text block + its source url.
    if (!fields.length && plan.target.metric === 'texts') {
      fields = normFields([{ key: 'text', label: 'Text', type: 'text' }, { key: 'url', label: 'URL', type: 'url' }]);
      chosen = 'full text content';
    }
    if (!fields.length) { fields = normFields(parsed?.schema?.fields); chosen = fields.length ? 'from your description' : 'auto-decided'; }
    if (!fields.length) fields = defaultFields(plan.target.metric);

    // Add columns for data the user asked for that no field can scrape (counts,
    // etc.) — ai_verify will fill them from each item's full text.
    const derived = deriveExtraFields(task.goal, fields);
    if (derived.length && (plan.target.metric === 'items' || plan.target.metric === 'texts')) {
      fields = [...fields, ...derived];
      if (!plan.phases.some((p) => p.tool === 'ai_verify')) {
        plan.phases.push({ tool: 'ai_verify', params: {} });
        set.plan = plan;
      }
      events.push({ at: nowIso(), kind: 'think', msg: `AI will extract from full text: ${derived.map((f) => f.key).join(', ')}.` });
    }

    if (!nm) nm = (parsed?.schema?.name && String(parsed.schema.name).trim()) || task.goal.slice(0, 40);
    const created = await createSchemaDoc(nm, fields);
    if (created) {
      set.schemas = [schemaSnapshot(created)];
      events.push({ at: nowIso(), kind: 'think', msg: `Created schema "${created.name}" (${chosen}): ${created.fields.map((f) => f.key).join(', ')}.` });
    }
  }

  const doc = await tasksColl().findOneAndUpdate(
    { taskId: task.taskId },
    { $set: set, $push: { events: { $each: events } } },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  res.json({ ok: true, task: doc?.value || doc });
});

// AI judge for find_post: does this ONE post's text discuss the wanted topic?
// Stateless — the extension loops posts and calls this per post, so scanning
// stays post-by-post, resumable, and observable in the task log.
app.post('/ai/match-post', async (req, res) => {
  const { model, query, text } = req.body || {};
  if (!model || !query) return res.json({ ok: false, error: 'model and query required' });
  const t = String(text || '').slice(0, 6000);
  if (!t) return res.json({ ok: true, match: false, reason: 'empty post' });
  // Cheap deterministic hit first — the exact phrase appears in the post.
  if (t.toLowerCase().includes(String(query).toLowerCase())) {
    return res.json({ ok: true, match: true, reason: 'post contains the phrase' });
  }
  try {
    const j = await (await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, stream: false, options: { temperature: 0 },
        format: { type: 'object', properties: { match: { type: 'boolean' }, reason: { type: 'string' } }, required: ['match', 'reason'] },
        messages: [
          { role: 'system', content: [
            'You judge whether a social-media post is about a given topic.',
            'match=true only if the post genuinely discusses, sells, promotes, or asks about the topic (same meaning counts, exact words are NOT required).',
            'Reply STRICT JSON: {"match":true|false,"reason":"<one short sentence>"}.',
          ].join('\n') },
          { role: 'user', content: `TOPIC: ${query}\n\nPOST:\n"""\n${t}\n"""` },
        ],
      }),
    })).json();
    const out = JSON.parse(j.message?.content || '{}');
    res.json({ ok: true, match: !!out.match, reason: out.reason || '' });
  } catch (e) {
    res.json({ ok: false, error: 'Ollama error: ' + e.message });
  }
});

// AI verify/correct ONE record's fields against its full source text. Stateless:
// the agent loops records and persists each result, so it stays crash-safe.
app.post('/ai/verify-record', async (req, res) => {
  const { model, instruction, source, fields, record } = req.body || {};
  if (!model || !record || typeof record !== 'object') return res.json({ ok: false, error: 'model and record required' });

  const targets = (Array.isArray(fields) && fields.length ? fields : Object.keys(record))
    .filter((k) => k !== source && !k.startsWith('_') && Object.prototype.hasOwnProperty.call(record, k));
  const sourceText = String(record[source] ?? '').slice(0, 8000);
  if (!sourceText) return res.json({ ok: true, corrected: {}, changed: false, note: 'no source text' });
  if (!targets.length) return res.json({ ok: true, corrected: {}, changed: false, note: 'no fields to verify' });

  // Grammar-constrain output to exactly the target keys (strings).
  const props = {}; for (const k of targets) props[k] = { type: 'string' };
  const schema = { type: 'object', properties: props, required: [...targets] };

  const current = {}; for (const k of targets) current[k] = record[k] ?? '';
  const sys = [
    'You are a data verification and correction agent.',
    'You are given the FULL source text of one item and some fields that were extracted from it.',
    'For each field: check its value against the source text.',
    '- If it is wrong, incomplete, or badly formatted, rewrite it correctly using ONLY information found in the source text.',
    '- If it is already correct, return it unchanged.',
    'Never invent data that is not in the source text. Always return every field key.',
    instruction ? ('User instruction: ' + instruction) : '',
  ].filter(Boolean).join('\n');
  const user = `SOURCE TEXT:\n"""\n${sourceText}\n"""\n\nEXTRACTED FIELDS (JSON):\n${JSON.stringify(current, null, 2)}\n\nReturn corrected JSON with these exact keys: ${targets.join(', ')}.`;

  try {
    const j = await (await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, stream: false, format: schema, options: { temperature: 0 },
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      }),
    })).json();
    const out = JSON.parse(j.message?.content || '{}');
    const corrected = {}; let changed = false;
    for (const k of targets) {
      if (typeof out[k] === 'string') {
        corrected[k] = out[k];
        if (out[k] !== String(record[k] ?? '')) changed = true;
      }
    }
    res.json({ ok: true, corrected, changed });
  } catch (e) {
    res.json({ ok: false, error: 'Ollama error: ' + e.message });
  }
});

// =============================== Schemas ====================================
// User-defined data schemas. Each schema gets its OWN Mongo collection
// (data_<slug>) that tasks tagged with it write their collected records into.

const schemasColl = () => collFor('schemas');
const dataCollName = (slug) => `data_${slug}`;

// Clean incoming field defs: a stable key, a label, a type.
function normFields(fields) {
  if (!Array.isArray(fields)) return [];
  const out = [];
  for (const f of fields) {
    const key = (f && f.key ? String(f.key) : '').trim().replace(/[^a-zA-Z0-9_]/g, '_');
    if (!key) continue;
    out.push({ key, label: (f.label || key).toString(), type: f.type || 'text' });
  }
  return out;
}

// Sensible default fields when the model doesn't specify a schema itself.
function defaultFields(metric) {
  if (metric === 'details') {
    return normFields([
      { key: 'name', label: 'Name', type: 'text' }, { key: 'url', label: 'URL', type: 'url' },
      { key: 'category', label: 'Category', type: 'text' }, { key: 'followers', label: 'Followers', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'phone' }, { key: 'email', label: 'Email', type: 'email' },
      { key: 'website', label: 'Website', type: 'url' }, { key: 'address', label: 'Address', type: 'text' },
    ]);
  }
  return normFields([{ key: 'name', label: 'Name', type: 'text' }, { key: 'url', label: 'URL', type: 'url' }]);
}

// Create + persist a schema (its own collection). Returns the schema doc, or
// null if no valid fields. Shared by the API and the planner's auto-create.
async function createSchemaDoc(name, fields) {
  const cleanFields = normFields(fields);
  if (!cleanFields.length) return null;
  let slug = slugify(name || 'schema');
  if (await schemasColl().findOne({ slug })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const schema = {
    schemaId: crypto.randomUUID(),
    name: (String(name).trim() || slug),
    slug,
    dataCollection: dataCollName(slug),
    fields: cleanFields,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await schemasColl().insertOne({ ...schema });
  await collFor(schema.dataCollection).createIndex({ _sourceUrl: 1 });
  return schema;
}

const schemaSnapshot = (s) => ({ schemaId: s.schemaId, name: s.name, slug: s.slug, dataCollection: s.dataCollection, fields: s.fields });

app.get('/schemas', async (req, res) => {
  const schemas = await schemasColl().find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  res.json({ ok: true, schemas });
});

app.get('/schemas/:id', async (req, res) => {
  const schema = await schemasColl().findOne({ schemaId: req.params.id }, { projection: { _id: 0 } });
  if (!schema) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, schema });
});

app.post('/schemas', async (req, res) => {
  const { name, fields } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ ok: false, error: 'name required' });
  const schema = await createSchemaDoc(name, fields);
  if (!schema) return res.status(400).json({ ok: false, error: 'at least one field required' });
  res.json({ ok: true, schema });
});

app.delete('/schemas/:id', async (req, res) => {
  const schema = await schemasColl().findOne({ schemaId: req.params.id });
  if (schema) {
    await schemasColl().deleteOne({ schemaId: req.params.id });
    try { await collFor(schema.dataCollection).drop(); } catch {}
  }
  res.json({ ok: true });
});

// Records for a schema (optionally scoped to a task).
app.get('/schemas/:id/records', async (req, res) => {
  const schema = await schemasColl().findOne({ schemaId: req.params.id });
  if (!schema) return res.status(404).json({ ok: false, error: 'not found' });
  const q = {};
  if (req.query.taskId) q._taskId = req.query.taskId;
  const records = await collFor(schema.dataCollection).find(q, { projection: { _id: 0 } }).limit(1000).toArray();
  res.json({ ok: true, records, fields: schema.fields });
});

// Upsert records into a schema collection (dedup by _sourceUrl when present).
app.post('/schemas/:id/records', async (req, res) => {
  const schema = await schemasColl().findOne({ schemaId: req.params.id });
  if (!schema) return res.status(404).json({ ok: false, error: 'not found' });
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  const coll = collFor(schema.dataCollection);
  let added = 0, updated = 0;
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    if (r._sourceUrl) {
      const u = await coll.updateOne({ _sourceUrl: r._sourceUrl }, { $set: r }, { upsert: true });
      if (u.upsertedCount) added++; else updated++;
    } else {
      await coll.insertOne({ ...r });
      added++;
    }
  }
  const total = await coll.countDocuments();
  res.json({ ok: true, added, updated, total });
});

// ============================= Page Skills ==================================
// Learned page features taught in a learning session. Scoped per URL pattern.
// A skill is either an "action" (one element + a verb) or a "collection"
// (a repeating item + per-item fields). The shape is open so new kinds
// (sequence, condition, form…) can be added later without migration.

const skillsColl = () => collFor('skills');

app.get('/skills', async (req, res) => {
  const q = {};
  if (req.query.host) q.host = req.query.host;
  const skills = await skillsColl().find(q, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  res.json({ ok: true, skills });
});

app.get('/skills/:id', async (req, res) => {
  const skill = await skillsColl().findOne({ skillId: req.params.id }, { projection: { _id: 0 } });
  if (!skill) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, skill });
});

app.post('/skills', async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.kind || !b.host) return res.status(400).json({ ok: false, error: 'host, name and kind required' });
  const skill = {
    skillId: crypto.randomUUID(),
    host: String(b.host),
    urlPattern: b.urlPattern || `${b.host}/*`,
    name: String(b.name).trim(),
    kind: b.kind,                     // 'action' | 'collection'
    action: b.action || null,         // action kind: click | type | read | hover
    selectors: Array.isArray(b.selectors) ? b.selectors : [],
    item: b.item || null,             // collection kind: { selectors: [...] }
    fields: Array.isArray(b.fields) ? b.fields : [], // [{name, selectors, attr}]
    sample: b.sample || null,         // small signature snapshot for debugging
    sampleHtml: b.sampleHtml ? String(b.sampleHtml).slice(0, 60000) : null, // tagged item's HTML (debug)
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await skillsColl().insertOne({ ...skill });
  res.json({ ok: true, skill });
});

const SKILL_PATCHABLE = new Set(['name', 'urlPattern', 'kind', 'action', 'selectors', 'item', 'fields']);
app.patch('/skills/:id', async (req, res) => {
  const set = {};
  for (const [k, v] of Object.entries(req.body || {})) if (SKILL_PATCHABLE.has(k)) set[k] = v;
  set.updatedAt = nowIso();
  const doc = await skillsColl().findOneAndUpdate(
    { skillId: req.params.id }, { $set: set }, { returnDocument: 'after', projection: { _id: 0 } });
  res.json({ ok: true, skill: doc?.value || doc });
});

app.delete('/skills/:id', async (req, res) => {
  await skillsColl().deleteOne({ skillId: req.params.id });
  res.json({ ok: true });
});

// Optional lightweight LLM helper: name a feature from its compact signature.
// A TINY, dedicated prompt (never raw HTML) — kept separate from the planner.
function learningSystemPrompt() {
  return [
    'You name a web-page feature from its element signature.',
    'Reply STRICT JSON only: {"name":"snake_case_name","kind":"action|collection"}.',
    '"action" = a single clickable/typable element. "collection" = a repeating item (posts, cards, rows).',
  ].join('\n');
}

app.post('/skills/suggest', async (req, res) => {
  const { signature, model } = req.body || {};
  if (!model) return res.json({ ok: false, error: 'no model' });
  try {
    const j = await (await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: learningSystemPrompt() },
          { role: 'user', content: JSON.stringify(signature || {}) },
        ],
        stream: false,
        format: { type: 'object', properties: { name: { type: 'string' }, kind: { type: 'string', enum: ['action', 'collection'] } }, required: ['name', 'kind'] },
        options: { temperature: 0 },
      }),
    })).json();
    const out = JSON.parse(j.message?.content || '{}');
    res.json({ ok: true, name: out.name || '', kind: out.kind || '' });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ---- Validate/clean a skill before saving (deterministic + light LLM) ----

// Replace baked-in dynamic aria-labels: action labels keep a stable prefix,
// name/free-text labels have the predicate stripped (structure carries it).
function generalizeSelectorValue(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/\[aria-label="([^"]+)"\]/g, (m, t) => {
    const mm = t.match(/^(.*?)\s+(?:to|on|for)\s+/i);
    if (mm && /\b(like|love|care|haha|wow|sad|angry|react|comment|share|send|message|follow|save|reply|write)\b/i.test(mm[1])) {
      return `[aria-label^="${mm[1].replace(/"/g, '')}"]`;
    }
    if (/['’]/.test(t) || /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(t) || t.length > 25) return ''; // strip name/free-text → bare tag
    return m; // short stable label — keep
  });
}
function cleanSelectors(list, changes, label) {
  return (list || [])
    .map((s) => {
      if (s.strategy === 'css' && typeof s.value === 'string') {
        const g = generalizeSelectorValue(s.value);
        if (g !== s.value) { changes.push(`generalized selector${label ? ' in ' + label : ''}`); return { ...s, value: g }; }
      }
      return s;
    })
    .filter((s) => !(s.strategy === 'css' && (!s.value || !s.value.trim())));
}
const snakeName = (n) => String(n || '').replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_+|_+$/g, '') || 'field';

function cleanSkillDeterministic(d) {
  const changes = [];
  const skill = { ...d };
  if (skill.kind === 'collection') {
    let fields = (skill.fields || []).map((f) => ({ ...f, name: snakeName(f.name), selectors: cleanSelectors(f.selectors, changes, snakeName(f.name)) }));
    fields = fields.filter((f) => (f.selectors || []).length || f.attr === 'click');
    const seen = new Set(); const out = [];
    for (const f of fields) {
      // same selector AND same attr = true duplicate; same selector + different
      // attr (text vs href of one anchor) is legitimate.
      const key = ((f.selectors[0] && f.selectors[0].value) || f.name) + '|' + (f.attr || '');
      if (seen.has(key)) { changes.push(`removed duplicate field "${f.name}"`); continue; }
      seen.add(key); out.push(f);
    }
    const names = new Set();
    for (const f of out) { let n = f.name, i = 2; while (names.has(n)) n = f.name + '_' + (i++); f.name = n; names.add(n); }
    skill.fields = out;
    if (skill.item && skill.item.selectors) skill.item.selectors = cleanSelectors(skill.item.selectors, changes, 'item');
  } else {
    skill.selectors = cleanSelectors(skill.selectors, changes, skill.name);
  }
  return { skill, changes };
}

async function llmRefineNames(model, skill) {
  const cur = (skill.fields || []).map((f) => ({ name: f.name, attr: f.attr }));
  if (!cur.length) return null;
  const j = await (await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, stream: false, options: { temperature: 0 },
      format: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } } }, required: ['names'] },
      messages: [
        { role: 'system', content: 'Rewrite each data field name as a short snake_case name describing the value. Keep the SAME count and order. Reply STRICT JSON {"names":[...]}.' },
        { role: 'user', content: JSON.stringify(cur) },
      ],
    }),
  })).json();
  const out = JSON.parse(j.message?.content || '{}');
  return (Array.isArray(out.names) && out.names.length === cur.length) ? out.names.map(snakeName) : null;
}

app.post('/skills/validate', async (req, res) => {
  const d = req.body || {};
  const { skill, changes } = cleanSkillDeterministic(d);
  if (d.model && skill.kind === 'collection' && (skill.fields || []).length) {
    try {
      const names = await llmRefineNames(d.model, skill);
      if (names) {
        let touched = false;
        skill.fields.forEach((f, i) => { if (names[i] && names[i] !== f.name) { f.name = names[i]; touched = true; } });
        const seen = new Set();
        skill.fields.forEach((f) => { let n = f.name, i = 2; while (seen.has(n)) n = f.name + '_' + (i++); f.name = n; seen.add(n); });
        if (touched) changes.push('AI refined field names');
      }
    } catch {}
  }
  res.json({ ok: true, skill, changes });
});

connectDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Browser Agent backend on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
