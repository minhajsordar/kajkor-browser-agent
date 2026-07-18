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
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const PORT = process.env.PORT || 34730;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://minhaj:m1nh8j@mdb.softrking.com:27017/browser_agent?authSource=admin&directConnection=true';
const DB_NAME = process.env.MONGODB_DB || 'browser_agent';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEBUG_DIR = path.join(__dirname, '..', 'sample', 'debug');

const app = express();
app.use(cors()); // allow the extension (any origin) to POST
app.use(express.json({ limit: '25mb' })); // large HTML payloads for debug saves

// --- authentication (JWT) ----------------------------------------------------
// Trust model: LOOPBACK requests (the extension and the desktop app on this
// machine) pass without a token, so local workflows are unchanged. Anything
// arriving over the network needs `Authorization: Bearer <jwt>` from
// /auth/login. Set AUTH_ENFORCE_LOCAL=1 to require tokens locally too.
const AUTH_SECRET = process.env.AUTH_SECRET || 'browser-agent-dev-secret';
const AUTH_ENFORCE_LOCAL = process.env.AUTH_ENFORCE_LOCAL === '1';
if (AUTH_SECRET === 'browser-agent-dev-secret') {
  console.warn('[auth] Using the built-in dev secret — set AUTH_SECRET before exposing this backend beyond localhost.');
}
const usersColl = () => collFor('users');
const isLoopback = (req) => /^(::1$|::ffff:127\.|127\.)/.test(String(req.ip || ''));
const AUTH_EXEMPT = [/^\/health$/, /^\/auth\/(login|register)$/];
const publicUser = (u) => ({ userId: u.userId, name: u.name, email: u.email, role: u.role });

app.use((req, res, next) => {
  if (AUTH_EXEMPT.some((rx) => rx.test(req.path))) return next();
  if (isLoopback(req) && !AUTH_ENFORCE_LOCAL) return next();
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ ok: false, error: 'auth required' });
  try { req.user = jwt.verify(m[1], AUTH_SECRET); next(); }
  catch { res.status(401).json({ ok: false, error: 'invalid or expired token' }); }
});

// First user ever registered becomes admin. After that, only an admin (or a
// trusted local caller) can create accounts — no open signup.
app.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ ok: false, error: 'email and password required' });
  if (String(password).length < 6) return res.status(400).json({ ok: false, error: 'password must be at least 6 characters' });
  const count = await usersColl().countDocuments();
  if (count) {
    let caller = null;
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (m) { try { caller = jwt.verify(m[1], AUTH_SECRET); } catch {} }
    const trustedLocal = isLoopback(req) && !AUTH_ENFORCE_LOCAL;
    if (!trustedLocal && caller?.role !== 'admin') return res.status(403).json({ ok: false, error: 'only an admin can create accounts' });
  }
  const user = {
    userId: crypto.randomUUID(),
    name: String(name || '').trim() || String(email).split('@')[0],
    email: String(email).trim().toLowerCase(),
    passwordHash: await bcrypt.hash(String(password), 10),
    role: count ? 'user' : 'admin',
    createdAt: nowIso(),
  };
  try { await usersColl().insertOne({ ...user }); }
  catch { return res.status(409).json({ ok: false, error: 'email already registered' }); }
  res.json({ ok: true, user: publicUser(user) });
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await usersColl().findOne({ email: String(email || '').trim().toLowerCase() });
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ ok: false, error: 'invalid email or password' });
  }
  const token = jwt.sign({ userId: user.userId, email: user.email, role: user.role }, AUTH_SECRET, { expiresIn: '30d' });
  res.json({ ok: true, token, user: publicUser(user) });
});

app.get('/auth/me', async (req, res) => {
  if (req.user) return res.json({ ok: true, user: req.user });
  res.json({ ok: true, user: null, local: true }); // trusted loopback caller
});

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
  await collFor('elements').createIndex({ elementId: 1 }, { unique: true });
  await collFor('elements').createIndex({ host: 1 });
  await collFor('prompts').createIndex({ promptId: 1 }, { unique: true });
  await collFor('schemas').createIndex({ schemaId: 1 }, { unique: true });
  await collFor('schemas').createIndex({ slug: 1 }, { unique: true });
  await collFor('skills').createIndex({ skillId: 1 }, { unique: true });
  await collFor('skills').createIndex({ host: 1 });
  await collFor('debug_items').createIndex({ taskId: 1 });
  await collFor('task_shots').createIndex({ taskId: 1 });
  await collFor('users').createIndex({ email: 1 }, { unique: true });
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
  { name: 'scroll', params: ['times', 'delay', 'direction'],
    desc: 'Scroll the current page `times` steps WITHOUT collecting anything. Use when the user only wants to scroll. `direction` is "vertical" (default, down the feed) or "horizontal" (sideways through a carousel/stories/reels row) — set horizontal ONLY when the user asks to scroll sideways.' },
  { name: 'click', params: ['selector', 'text'],
    desc: 'Click the element matching a CSS `selector` on the current page (or the first element whose visible text contains `text`). Use for buttons, links, tabs, "See more", etc.' },
  { name: 'hover', params: ['selector', 'text'],
    desc: 'Hover (mouseover) the element matching a CSS `selector` (or containing `text`) on the current page — e.g. to reveal a menu or tooltip.' },
  { name: 'wait', params: ['seconds', 'selector', 'text'],
    desc: 'Wait. With `selector`/`text`: wait until that element APPEARS on the page (up to 30s) — use between steps of slow multi-step dialogs. With only `seconds`: pause that long.' },
  { name: 'screenshot', params: [],
    desc: 'Capture the visible area of the current tab and attach it to the task as evidence (viewable in the dashboard). Use when the user asks to see/verify what happened.' },
  { name: 'ask_user', params: ['question'],
    desc: 'PAUSE the task and ask the user to confirm before continuing (Approve/Decline in the popup or dashboard). ALWAYS add this right before irreversible outward actions the user asked to confirm — publishing a post, sending a message.' },
  { name: 'press_key', params: ['key', 'selector', 'text'],
    desc: 'Press a keyboard key (default "Enter") on the field matching `selector`/`text`, or on the currently focused field when omitted. Use AFTER typing when a field submits on Enter and has NO submit button (search boxes, chat inputs, comment boxes). Other keys: Tab, Escape, ArrowDown, ArrowUp, Space.' },
  { name: 'type', params: ['value', 'selector', 'text'],
    desc: 'Type `value` into a text field / textarea / contenteditable box (e.g. a post composer, search box, comment box). Locate the field by CSS `selector`, or by its placeholder/aria-label `text`; if neither is given, types into the focused or first editable field. Does NOT submit.' },
  { name: 'generate_text', params: ['prompt', 'selector', 'text', 'words'],
    desc: 'Use AI to WRITE text from `prompt` (e.g. "write a Facebook post about surviving the AI era"), then type it into the target field (located by `selector` or placeholder/aria-label `text`, else the focused/first editable field). Use this when the user asks to generate/compose/write content; use `type` only when they give the exact words. Does NOT submit.' },
  { name: 'use_skill', params: ['skill'],
    desc: 'Perform a learned single-element skill (click/scroll/read…) by its name on the current page.' },
  { name: 'run_skill', params: ['skill', 'text'],
    desc: 'Run a learned multi-step WORKFLOW skill: performs each of its action/input steps IN ORDER (click → type → click…) on the current page. For "type" steps it types `text`, or the text produced by an earlier generate_text phase. Use when a listed skill is described as a workflow of several steps.' },
  { name: 'collect_by_skill', params: ['skill', 'target'],
    desc: 'Use a learned "collection" skill to scroll and extract its taught fields from each repeating item (e.g. each post), saving up to `target` records.' },
  { name: 'collect_text', params: ['selector', 'target'],
    desc: 'Scroll and collect the FULL inner text of every element matching a CSS selector on the current page (e.g. "[role=article]" for posts, ".comment" for comments). Each block is saved as one record with a "text" field. Use when the user wants the whole text content of repeating elements.' },
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
          metric: { type: 'string', enum: ['scrolls', 'items', 'texts', 'actions'] },
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
    '- "target.metric" is one of: "scrolls" (only scrolling, no data collection), "texts" (collecting the full inner text of matching elements via collect_text), "items" (collecting taught fields from each repeating item via a learned collection skill), or "actions" (UI interactions only — clicks/typing/etc.).',
    '- "target.count" is the number the user asked for.',
    '- Always start with a `navigate` phase using the URL implied by the task. Only omit navigate when the task clearly acts on the page already open.',
    '- If the user says only to scroll (no data), use the `scroll` tool and metric "scrolls".',
    '- To collect the text content of repeating elements (posts, results, rows, comments), use `collect_text` with a CSS `selector` and metric "texts".',
    '- For UI interactions (clicking buttons/links/tabs, hovering to reveal menus) use the `click` and `hover` tools; if the task is only interactions (no data collected) use metric "actions" with count = number of interaction steps.',
    '- To enter EXACT text the user gave into a field/box use the `type` tool with params.value = that text. Do NOT use use_skill for typing.',
    '- To WRITE/GENERATE/COMPOSE text with AI (a post/message/comment about a topic) use the `generate_text` tool with params.prompt describing what to write; it generates the text and types it into the field.',
    '- use_skill, run_skill and collect_by_skill may ONLY reference a skill from the "Learned skills" list below. NEVER invent or guess a skill name. If no learned skill fits, use the generic click/type/hover/collect_text tools instead.',
    '- For navigate, set params.newTab to true ONLY if the user explicitly asks to open a NEW tab; if they refer to the current/existing tab, omit newTab.',
    '- Phases run in order. Use the fewest phases needed.',
    '- If the user asks to verify/compare/correct collected fields against a fuller text, add an "ai_verify" phase LAST, with params.source set to the field holding the full text.',
    '',
    'Example — "open example.com and only scroll 10 times, do not collect":',
    '{"target":{"metric":"scrolls","count":10},"phases":[{"tool":"navigate","params":{"url":"https://example.com"}},{"tool":"scroll","params":{"times":10}}]}',
    'Example — "on the current page, hover the menu then click the Settings link":',
    '{"target":{"metric":"actions","count":2},"phases":[{"tool":"hover","params":{"text":"menu"}},{"tool":"click","params":{"text":"Settings"}}]}',
    'Example — "open the composer and write a post, do not publish":',
    '{"target":{"metric":"actions","count":2},"phases":[{"tool":"click","params":{"text":"What\'s on your mind"}},{"tool":"type","params":{"value":"<the post text>"}}]}',
    'Example — "open the composer and generate a post about surviving the AI era":',
    '{"target":{"metric":"actions","count":2},"phases":[{"tool":"click","params":{"text":"What\'s on your mind"}},{"tool":"generate_text","params":{"prompt":"Write a post about how we can survive in the AI era"}}]}',
    'Example — "collect the full text of 5 posts":',
    '{"target":{"metric":"texts","count":5},"phases":[{"tool":"navigate","params":{"url":"https://www.facebook.com"}},{"tool":"collect_text","params":{"selector":"[role=\\"article\\"]","target":5}}]}',
  ];
  if (skills && skills.length) {
    base.push('', 'Learned skills you can use (reference by exact name):');
    for (const s of skills) {
      const about = s.details ? ` — ${s.details}` : '';
      if (s.kind === 'collection') base.push(`- collect_by_skill skill="${s.name}"${about} → fields: ${(s.fields || []).map((f) => f.name).join(', ')}  [${s.urlPattern}]`);
      else if (Array.isArray(s.steps) && s.steps.length > 1) base.push(`- run_skill skill="${s.name}"${about} → workflow: ${s.steps.map((x) => `${x.name}(${x.action})`).join(' → ')}  [${s.urlPattern}]`);
      else base.push(`- use_skill skill="${s.name}" (${s.action})${about}  [${s.urlPattern}]`);
    }
    base.push('Prefer collect_by_skill (metric "items") when a matching collection skill exists for the data requested.');
  }
  if (schemas && schemas.length) {
    base.push('', 'Collected data will be saved into these schemas (field keys):');
    for (const s of schemas) base.push(`- ${s.name}: ${s.fields.map((f) => f.key).join(', ')}`);
  } else {
    base.push(
      '',
      'No schema was provided. If the task collects data (metric "texts" or "items"),',
      'ALSO output a "schema" object defining the data table to save into:',
      '  "schema": {"name": "<short name>", "fields": [{"key":"text","label":"Text","type":"text"}, ...]}',
      '- Infer the fields from what the user describes wanting to collect.',
      '- If the user does not describe fields, choose sensible ones for the data.',
      '- Choose field "key" names freely to fit the data — this is a general agent.',
      '- For collect_text (metric "texts"), a single "text" field holding each element\'s full text is usually right.',
      '- Omit "schema" only for scroll-only (metric "scrolls") or interaction-only (metric "actions") tasks.',
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
    const cbs = clean.find((p) => p.tool === 'collect_by_skill');
    const ct = clean.find((p) => p.tool === 'collect_text');
    const scr = clean.find((p) => p.tool === 'scroll');
    if (cbs && Number(cbs.params.target)) target = { metric: 'items', count: Number(cbs.params.target) };
    else if (ct && Number(ct.params.target)) target = { metric: 'texts', count: Number(ct.params.target) };
    else if (scr && Number(scr.params.times)) target = { metric: 'scrolls', count: Number(scr.params.times) };
    else {
      // Pure action task (click/hover/scroll only): target = number of such phases.
      const acts = clean.filter((p) => ['click', 'hover', 'scroll', 'type', 'press_key', 'generate_text', 'use_skill', 'run_skill', 'wait', 'screenshot', 'ask_user'].includes(p.tool)).length;
      if (acts) target = { metric: 'actions', count: acts };
      else return null;
    }
  }
  const metric = ['scrolls', 'items', 'texts', 'actions'].includes(target.metric) ? target.metric : 'texts';
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
    // Learned collection skill scrolls itself. Just fix its target.
    for (const p of phases) {
      if (p.tool === 'collect_by_skill' && !Number(p.params.target)) p.params.target = plan.target.count;
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
  }

  // Enforce order: one navigate first, then scroll/collect/act, then verify.
  const order = { navigate: 0, scroll: 1, click: 1, hover: 1, type: 1, press_key: 1, wait: 1, screenshot: 1, ask_user: 1, generate_text: 1, use_skill: 1, run_skill: 1, collect_by_skill: 1, collect_text: 1, ai_verify: 3 };
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
  const { goal, model, mode, schemas, useSkills, promptId, project } = req.body || {};
  if (!goal || !model) return res.status(400).json({ ok: false, error: 'goal and model required' });

  // Optional project grouping (desktop app): {name, dir}. dir doubles as the
  // default working directory for /run commands in this session.
  const taskProject = project && typeof project === 'object' && project.name
    ? { name: String(project.name).slice(0, 120), dir: String(project.dir || '') }
    : null;

  // Host-command session (goal starts with /run|/sh|/host): do NOT browser-plan.
  // Create an IDLE session (status 'done' so the extension never runs phases)
  // and propose the command for confirmation, like the /run chat path.
  const hostGoalMatch = String(goal).match(HOST_PREFIX_RX);
  if (hostGoalMatch) {
    const instruction = String(goal).slice(hostGoalMatch[0].length).trim();
    const resolved = await resolveModel(model, instruction);
    const useModel = resolved.name || model;
    const base = {
      taskId: crypto.randomUUID(),
      goal: String(goal), model: useModel, mode: 'once', project: taskProject,
      schemas: [], useSkills: [], systemPrompt: null,
      status: 'done', plan: null, currentPhaseIndex: 0,
      collected: [], extracted: [], scrolls: 0, scanY: 0, actions: 0,
      repeats: 0, maxRepeats: 3, messages: [],
      chat: [], sessionSummary: '', currentInstruction: null,
      round: 0,                  // server-stamped round index (per user turn)
      events: [{ at: nowIso(), kind: 'think', msg: 'Host-command session.', round: 0 }],
      errors: [], createdAt: nowIso(), updatedAt: nowIso(), finishedAt: nowIso(),
    };
    if (!instruction) {
      await tasksColl().insertOne({ ...base });
      return res.json({ ok: false, task: base, error: 'Say what to run after /run.' });
    }
    let proposal;
    try {
      proposal = await proposeHostCommand(useModel, instruction, String(req.body?.platform || process.platform));
    } catch (e) {
      base.chat.push({ role: 'assistant', text: 'Could not propose a command (is the model running?). ' + (e.message || ''), at: nowIso() });
      await tasksColl().insertOne({ ...base });
      return res.json({ ok: false, task: base, error: 'proposal failed' });
    }
    const desc = `🖥️ Proposed command: \`${proposal.argv.join(' ')}\``
      + (proposal.cwd ? ` (in ${proposal.cwd})` : '')
      + `\n${proposal.explanation}${proposal.danger ? ' ⚠️ destructive' : ''}`;
    base.chat.push({ role: 'assistant', text: desc, at: nowIso() });
    await tasksColl().insertOne({ ...base });
    return res.json({ ok: true, task: base, mode: 'host', proposal });
  }

  // Snapshot the chosen system prompt; its bundled skills join the task's skills.
  let systemPrompt = null;
  const extraSkillIds = [];
  if (promptId) {
    const p = await promptsColl().findOne({ promptId }, { projection: { _id: 0 } });
    if (p) { systemPrompt = { promptId: p.promptId, name: p.name, content: p.content }; extraSkillIds.push(...(p.skillIds || [])); }
  }

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
  const skIds = [...new Set([...(Array.isArray(useSkills) ? useSkills : []), ...extraSkillIds])];
  if (skIds.length) {
    const docs = await resolveSkills(await collFor('skills').find({ skillId: { $in: skIds } }, { projection: { _id: 0 } }).toArray());
    taskUseSkills = docs.map((s) => ({ skillId: s.skillId, name: s.name, kind: s.kind, action: s.action, fields: s.fields, steps: s.steps || null, urlPattern: s.urlPattern }));
  }

  const task = {
    taskId: crypto.randomUUID(),
    goal, model, mode: mode || 'once',
    project: taskProject,        // desktop-app folder grouping {name, dir}
    schemas: taskSchemas,        // schemas this task saves collected data into
    useSkills: taskUseSkills,    // learned skills the task should use
    systemPrompt,                // standing instructions attached to this task
    status: 'planning',          // planning|running|checking|done|error|stopped
    plan: null,
    currentPhaseIndex: 0,
    collected: [],               // task-scoped {url,name} collected this task
    extracted: [],               // task-scoped urls whose details were extracted
    scrolls: 0,                  // task-scoped scroll steps performed (scroll tool)
    scanY: 0,                    // saved feed scroll offset of the post scan (resume point)
    actions: 0,                  // task-scoped click/hover/type/generate actions performed
    repeats: 0,
    maxRepeats: 3,
    messages: [],                // LLM planning transcript (audit/resume)
    chat: [],                    // conversational session turns [{role,text,at}]
    sessionSummary: '',          // compacted context of earlier session rounds
    currentInstruction: null,    // latest chat instruction being planned/executed
    round: 0,                    // server-stamped round index (bumped per user turn)
    events: [{ at: nowIso(), kind: 'think', msg: 'Task created.', round: 0 }],
    errors: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    finishedAt: null,
  };
  await tasksColl().insertOne({ ...task });
  res.json({ ok: true, task });
});

// Re-run a task (daily/repetitive workflows). Without `extra` the PROVEN plan
// is reused — no replanning: it's deterministic, instant, and the stored plan
// already worked; only execution state is reset. With an `extra` instruction
// the goal changes, so the planner runs again. Schema snapshots are copied, so
// collected data accumulates in the SAME collection(s) across runs.
app.post('/tasks/:id/rerun', async (req, res) => {
  const src = await tasksColl().findOne({ taskId: req.params.id });
  if (!src) return res.status(404).json({ ok: false, error: 'not found' });
  const extra = String(req.body?.extra || '').trim();
  const task = {
    taskId: crypto.randomUUID(),
    goal: extra ? `${src.goal}\nAdditional instruction for this run: ${extra}` : src.goal,
    model: src.model,
    mode: src.mode || 'once',
    project: src.project || null,
    schemas: src.schemas || [],
    useSkills: src.useSkills || [],
    systemPrompt: src.systemPrompt || null,
    rerunOf: src.taskId,
    status: extra ? 'planning' : 'running',
    plan: extra ? null : src.plan,     // reuse the proven plan unless the goal changed
    currentPhaseIndex: 0,
    collected: [], extracted: [], scrolls: 0, scanY: 0, actions: 0, repeats: 0,
    maxRepeats: src.maxRepeats || 3,
    messages: [],
    chat: [], sessionSummary: '', currentInstruction: null,
    round: 0,
    events: [{ at: nowIso(), kind: 'think', msg: `Re-run of task ${src.taskId.slice(0, 8)}… ${extra ? '(extra instruction — replanning)' : '(reusing its proven plan)'}`, round: 0 }],
    errors: [],
    createdAt: nowIso(), updatedAt: nowIso(), finishedAt: null,
  };
  await tasksColl().insertOne({ ...task });
  delete task._id;
  res.json({ ok: true, task });
});

// Whitelisted field updates (the extension persists progress through here).
const PATCHABLE = new Set(['status', 'currentPhaseIndex', 'collected', 'extracted', 'scrolls', 'scanY', 'actions', 'generatedText', 'pendingQuestion', 'repeats', 'plan', 'finishedAt', 'messages', 'model', 'project', 'round']);
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
  await collFor('task_shots').deleteMany({ taskId: req.params.id });
  await collFor('debug_items').deleteMany({ taskId: req.params.id });
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

// Answer a pending ask_user confirmation. The extension's tool loop polls the
// task and resumes (or stops) based on the answer.
app.post('/tasks/:id/answer', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  if (!task.pendingQuestion || task.pendingQuestion.answer) return res.json({ ok: false, error: 'nothing to answer' });
  const answer = String(req.body?.answer || '').trim() || 'no';
  await tasksColl().updateOne({ taskId: req.params.id }, {
    $set: { 'pendingQuestion.answer': answer, 'pendingQuestion.answeredAt': nowIso(), updatedAt: nowIso() },
    $push: { events: { at: nowIso(), kind: 'obs', msg: `You answered: ${answer}`, round: task.round || 0 } },
  });
  res.json({ ok: true });
});

// ======================= Conversational task sessions =======================
// Continue chatting inside one task (like Codex/coworker sessions): follow-up
// messages either trigger a NEW browsing round on the same task (data keeps
// accumulating in the same schema) or are ANSWERED directly from the session's
// collected data. When the transcript grows too big for a local model it is
// compacted into `sessionSummary` (auto, or manually via /compact).

const BUSY_STATUSES = new Set(['planning', 'running', 'checking', 'waiting']);

async function askChat(model, messages, opts = {}) {
  const j = await (await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, options: { temperature: opts.temperature ?? 0 }, ...(opts.format ? { format: opts.format } : {}) }),
  })).json();
  return j.message?.content || '';
}

// All records this session produced: schema records (tagged _taskId) + the
// task-scoped generic `collected` list. Capped for small-model context.
async function sessionRecords(task, max = 60) {
  const rows = [];
  for (const s of (task.schemas || [])) {
    try {
      const recs = await collFor(s.dataCollection)
        .find({ _taskId: task.taskId }, { projection: { _id: 0, _taskId: 0 } }).limit(max).toArray();
      rows.push(...recs);
    } catch {}
    if (rows.length >= max) break;
  }
  if (rows.length < max) rows.push(...(task.collected || []).slice(0, max - rows.length));
  return rows.slice(0, max);
}

// Decide what a chat message wants: browser work or an answer over collected
// data. Clear cases are decided deterministically; ambiguity goes to the LLM.
// NOTE: prefix alternatives ("summar", "analy[sz]") — no trailing \b, so
// "summary" / "Analyze" / "collected" still match.
const BROWSE_RX = /\b(navigate|go to|open|visit|reload|refresh|scroll|click|type|post|comment|like|follow|send|search|find|collect|extract|scrape|grab|capture|screenshot|fill|submit|log ?in|press|hover|download|new tab|next page)/i;
const ANSWER_RX = /\b(summar|analy[sz]|report|explain|insight|overview|how many|what did|what is|which of|list the|tell me|compare|conclusion|takeaway|clean ?up|translate)/i;
async function routeChat(task, message) {
  const b = BROWSE_RX.test(message), a = ANSWER_RX.test(message);
  if (a && !b) return 'answer';
  if (b && !a) return 'browse';
  try {
    const out = JSON.parse(await askChat(task.model, [
      { role: 'system', content: 'Classify the user\'s follow-up message for a browser-automation task session. "browse" = it needs the browser to DO something (navigate, scroll, collect, click, post…). "answer" = it can be answered from the data already collected (summaries, analysis, questions). Reply STRICT JSON {"mode":"browse"|"answer"}.' },
      { role: 'user', content: message },
    ], { format: { type: 'object', properties: { mode: { type: 'string', enum: ['browse', 'answer'] } }, required: ['mode'] } }));
    if (out.mode === 'answer' || out.mode === 'browse') return out.mode;
  } catch {}
  return a ? 'answer' : 'browse';   // model unreachable — heuristic decides
}

// Host commands are EXPLICIT (message starts with /run, /sh or /host) — never
// auto-routed from natural language, so an ordinary browse/answer message can
// never trigger shell execution. The backend only PROPOSES a command (as an
// argv array — no shell string, no operators); the desktop app confirms and
// runs it in its own process. The backend never executes anything on a host.
const HOST_PREFIX_RX = /^\/(run|sh|host)(?:\s+|$)/i;

async function proposeHostCommand(model, instruction, platform) {
  const sys =
    `Translate the request into ONE safe host command for a ${platform} machine, to be run WITHOUT a shell. `
    + 'Output an argv array: the first item is the executable, the rest are arguments. '
    + 'NO pipes, redirects, &&, ;, glob expansion, or quoting-as-operator — those do not work without a shell. '
    + 'Fields: title (short label), argv (string array), cwd (absolute working dir or "" for home), '
    + 'explanation (one line), danger (true if it deletes/overwrites/moves data, installs software, or is otherwise destructive). Reply STRICT JSON.';
  const format = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      argv: { type: 'array', items: { type: 'string' } },
      cwd: { type: 'string' },
      explanation: { type: 'string' },
      danger: { type: 'boolean' },
    },
    required: ['title', 'argv', 'explanation'],
  };
  const out = JSON.parse(await askChat(model, [
    { role: 'system', content: sys },
    { role: 'user', content: instruction },
  ], { format }));
  const argv = Array.isArray(out.argv) ? out.argv.map((x) => String(x)).filter(Boolean) : [];
  if (!argv.length) throw new Error('model produced no command');
  return {
    title: String(out.title || argv.join(' ')).slice(0, 80),
    argv,
    cwd: String(out.cwd || ''),
    explanation: String(out.explanation || '').slice(0, 200),
    danger: !!out.danger,
  };
}

// Record the outcome of a host command (run by the desktop app, or denied) as
// an assistant chat turn + event, so the transcript is complete.
app.post('/tasks/:id/host-result', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  const b = req.body || {};
  const argvStr = Array.isArray(b.argv) && b.argv.length ? b.argv.join(' ') : String(b.title || 'command');
  let text, kind;
  if (b.denied) {
    text = `🚫 Command denied: \`${argvStr}\``;
    kind = 'obs';
  } else if (b.error && b.exitCode == null && !b.stdout && !b.stderr) {
    text = `❌ \`${argvStr}\` — ${b.error}`;
    kind = 'err';
  } else {
    const code = Number.isInteger(b.exitCode) ? b.exitCode : null;
    const okRun = code === 0 && !b.timedOut;
    const out = String(b.stdout || '').slice(0, 4000);
    const err = String(b.stderr || '').slice(0, 2000);
    text = `${okRun ? '✅' : '❌'} \`${argvStr}\` ${b.timedOut ? 'timed out' : `exited ${code}`}`
      + (out ? `\n\n${out}` : '') + (err ? `\n\n[stderr]\n${err}` : '');
    kind = okRun ? 'ok' : 'err';
  }
  const rn = task.round || 0;
  const hostMeta = { host: true, denied: !!b.denied, exitCode: Number.isInteger(b.exitCode) ? b.exitCode : null, timedOut: !!b.timedOut, argv: argvStr.slice(0, 120) };
  await tasksColl().updateOne({ taskId: req.params.id }, {
    $push: {
      chat: { role: 'assistant', text: text.slice(0, 8000), at: nowIso(), round: rn },
      events: { at: nowIso(), kind, msg: `Host: ${argvStr}`.slice(0, 200), round: rn, meta: hostMeta },
    },
    $set: { updatedAt: nowIso() },
  });
  res.json({ ok: true });
});

// Compact the session: everything so far → a short summary; keep the last two
// turns verbatim. Falls back to a deterministic digest if the model is down.
async function compactSession(task) {
  const chat = task.chat || [];
  const transcript = [
    task.sessionSummary ? `Previous summary: ${task.sessionSummary}` : '',
    ...chat.map((m) => `${m.role}: ${m.text}`),
  ].filter(Boolean).join('\n').slice(0, 12000);
  const stats = `${(task.collected || []).length} collected, ${(task.extracted || []).length} extracted, ${task.scrolls || 0} scrolls, ${task.actions || 0} actions`;
  let summary = '';
  try {
    summary = (await askChat(task.model, [
      { role: 'system', content: 'Compact this browser-task session into <=120 words of plain text: the original goal, what has been done so far, key results/numbers, and any user preferences to remember. No preamble.' },
      { role: 'user', content: `Original goal: ${task.goal}\nProgress: ${stats}\nTranscript:\n${transcript}` },
    ], { temperature: 0.2 })).trim();
  } catch {}
  if (!summary) summary = `${task.goal} — ${stats}. ${chat.length} chat turns compacted (model offline; details in the event log).`;
  const keep = chat.slice(-2);
  await tasksColl().updateOne({ taskId: task.taskId }, {
    $set: { sessionSummary: summary.slice(0, 2000), chat: keep, updatedAt: nowIso() },
    $push: { events: { at: nowIso(), kind: 'think', msg: `Session compacted: ${chat.length} → ${keep.length} turns kept + summary.`, round: task.round || 0 } },
  });
  task.sessionSummary = summary; task.chat = keep;
  return summary;
}

app.post('/tasks/:id/compact', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  if (BUSY_STATUSES.has(task.status)) return res.status(409).json({ ok: false, error: 'Task is busy — wait for it to finish.' });
  if (!(task.chat || []).length && !task.sessionSummary) return res.json({ ok: false, error: 'Nothing to compact yet.' });
  const summary = await compactSession(task);
  res.json({ ok: true, summary });
});

app.post('/tasks/:id/chat', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ ok: false, error: 'message required' });
  if (BUSY_STATUSES.has(task.status)) return res.status(409).json({ ok: false, error: 'Task is busy — wait for it to finish, or stop it first.' });

  // Each user turn opens a new round; everything the backend/extension records
  // until the next user turn is stamped with this index (exact client grouping).
  const round = (task.round || 0) + 1;
  task.round = round;
  const userTurn = { role: 'user', text: message, at: nowIso(), round };
  await tasksColl().updateOne({ taskId: task.taskId }, { $push: { chat: userTurn }, $set: { round, updatedAt: nowIso() } });
  task.chat = [...(task.chat || []), userTurn];

  // Keep the transcript small enough for a local model — compact automatically.
  if (task.chat.length > 24 || JSON.stringify(task.chat).length > 9000) await compactSession(task);

  // Explicit host command (/run …): PROPOSE only — the desktop app confirms and
  // executes. Never touches browser state; never auto-triggered.
  const hostMatch = message.match(HOST_PREFIX_RX);
  if (hostMatch) {
    const instruction = message.slice(hostMatch[0].length).trim();
    if (!instruction) return res.json({ ok: false, error: 'Say what to run after /run.' });
    let proposal;
    try {
      proposal = await proposeHostCommand(task.model, instruction, String(req.body?.platform || process.platform));
    } catch (e) {
      const msg = 'Could not propose a command (is the model running?). ' + (e.message || '');
      await tasksColl().updateOne({ taskId: task.taskId }, {
        $push: { chat: { role: 'assistant', text: msg, at: nowIso(), round } }, $set: { updatedAt: nowIso() },
      });
      return res.json({ ok: false, error: msg });
    }
    const desc = `🖥️ Proposed command: \`${proposal.argv.join(' ')}\``
      + (proposal.cwd ? ` (in ${proposal.cwd})` : '')
      + `\n${proposal.explanation}${proposal.danger ? ' ⚠️ destructive' : ''}`;
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $push: {
        chat: { role: 'assistant', text: desc, at: nowIso(), round },
        events: { at: nowIso(), kind: 'think', msg: 'Proposed host command (awaiting your confirmation).', round },
      },
      $set: { updatedAt: nowIso() },
    });
    return res.json({ ok: true, mode: 'host', proposal });
  }

  const mode = await routeChat(task, message);

  if (mode === 'answer') {
    const rows = await sessionRecords(task, 60);
    let reply = '';
    try {
      reply = (await askChat(task.model, [
        { role: 'system', content:
          'You are the assistant inside a browser-automation task session. Answer the user using ONLY the session context and collected data below. Be concise and concrete; use numbers from the data. If the data cannot answer it, say so and suggest what to collect.\n\n'
          + `Original goal: ${task.goal}\n`
          + (task.sessionSummary ? `Session summary: ${task.sessionSummary}\n` : '')
          + `Collected records this session: ${rows.length}\n`
          + (rows.length ? `Data (JSON):\n${JSON.stringify(rows).slice(0, 9000)}` : 'No data collected yet.') },
        ...task.chat.slice(-11, -1).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        { role: 'user', content: message },
      ], { temperature: 0.2 })).trim();
    } catch {}
    if (!reply) reply = 'I could not reach the model to analyze the data — is Ollama running?';
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $push: { chat: { role: 'assistant', text: reply.slice(0, 8000), at: nowIso(), round }, events: { at: nowIso(), kind: 'obs', msg: 'Chat: answered from session data.', round } },
      $set: { updatedAt: nowIso() },
    });
    return res.json({ ok: true, mode: 'answer', reply });
  }

  // browse: this becomes the task's next round — replan against session context.
  await tasksColl().updateOne({ taskId: task.taskId }, {
    $set: {
      currentInstruction: message, plan: null, status: 'planning',
      currentPhaseIndex: 0, repeats: 0, scanY: 0, pendingQuestion: null, updatedAt: nowIso(),
    },
    $push: {
      chat: { role: 'assistant', text: '🛠️ On it — planning this step…', at: nowIso(), round },
      events: { at: nowIso(), kind: 'act', msg: `New round from chat: ${message}`, round },
    },
  });
  res.json({ ok: true, mode: 'browse' });
});

// Screenshots captured by the screenshot tool (kept out of the task doc — data
// URLs are large). Loaded on demand by the dashboard.
app.post('/tasks/:id/screenshot', async (req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');
  if (!dataUrl.startsWith('data:image/')) return res.status(400).json({ ok: false, error: 'dataUrl required' });
  await collFor('task_shots').insertOne({ taskId: req.params.id, at: nowIso(), url: String(req.body?.url || ''), dataUrl: dataUrl.slice(0, 3_000_000) });
  res.json({ ok: true });
});

app.get('/tasks/:id/screenshots', async (req, res) => {
  const shots = await collFor('task_shots').find({ taskId: req.params.id }, { projection: { _id: 0 } }).sort({ at: 1 }).toArray();
  res.json({ ok: true, shots });
});

app.post('/tasks/:id/event', async (req, res) => {
  const { kind, msg, meta } = req.body || {};
  // Stamp the task's CURRENT round so the extension's execution events group
  // under the user turn that started them — no round tracking needed client-side
  // (round only changes on /chat, which is blocked while a task is running).
  const t = await tasksColl().findOne({ taskId: req.params.id }, { projection: { round: 1 } });
  const ev = { at: nowIso(), kind: kind || 'obs', msg: msg || '', round: t?.round || 0 };
  if (meta && typeof meta === 'object') ev.meta = meta;
  await tasksColl().updateOne(
    { taskId: req.params.id },
    { $push: { events: ev }, $set: { updatedAt: nowIso() } }
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

  // Chat sessions: plan the LATEST instruction (goal heuristics run against it);
  // the original goal + summary + recent turns ride along as context.
  const instr = String(task.currentInstruction || '').trim() || task.goal;

  // Resolve 'auto' (or empty) model → a size-appropriate installed model, and
  // persist it so every phase (planning, ai_verify) uses the same one.
  const resolved = await resolveModel(task.model, task.goal);
  const modelEvents = [];
  if (resolved.name && resolved.name !== task.model) {
    task.model = resolved.name;
    await tasksColl().updateOne({ taskId: task.taskId }, { $set: { model: resolved.name, updatedAt: nowIso() } });
    if (resolved.why) modelEvents.push({ at: nowIso(), kind: 'think', msg: resolved.why + '.' });
  }

  // Hydrate v2 skills (element refs) into runtime shape so planning, routing
  // and field-subset logic see real field lists.
  const skills = await resolveSkills(await skillsColl().find({}, { projection: { _id: 0 } }).toArray());
  // Standing instructions from the task's system prompt ride along with every plan.
  let sysExtra = task.systemPrompt?.content
    ? `\n\nSTANDING USER INSTRUCTIONS (system prompt "${task.systemPrompt.name}") — honor these when planning:\n${task.systemPrompt.content}`
    : '';
  // Skills the user explicitly attached to THIS task — the planner should
  // prefer them over guessing selectors.
  if (task.useSkills && task.useSkills.length) {
    sysExtra += '\n\nThe user ATTACHED these skills to this task — prefer them: ' +
      task.useSkills.map((s) => `"${s.name}" (${s.kind === 'collection' ? 'collect_by_skill' : (s.steps && s.steps.length > 1 ? 'run_skill workflow' : 'use_skill ' + (s.action || ''))})`).join(', ') + '.';
  }
  const sessionContext = task.currentInstruction
    ? [
        'This is a CONTINUING task session — earlier rounds already ran.',
        `Original goal: ${task.goal}`,
        task.sessionSummary ? `Session summary: ${task.sessionSummary}` : '',
        (task.chat || []).length > 1
          ? 'Recent conversation:\n' + (task.chat || []).slice(-6, -1).map((m) => `${m.role}: ${m.text}`).join('\n')
          : '',
        `Progress so far: ${(task.collected || []).length} items collected, ${(task.extracted || []).length} extracted, ${task.scrolls || 0} scrolls, ${task.actions || 0} actions.`,
        `CURRENT INSTRUCTION — plan phases ONLY for this:\n${task.currentInstruction}`,
      ].filter(Boolean).join('\n\n')
    : task.goal;
  const messages = [
    { role: 'system', content: planningSystemPrompt(task.schemas, skills) + sysExtra },
    { role: 'user', content: sessionContext },
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
  const wantCount = requestedCount(instr);
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
    if (/\bnew tab\b/i.test(instr)) nav.params.newTab = true;
    else if (/\b(current|this|existing|same)\s+tab\b/i.test(instr)) delete nav.params.newTab;
  }

  // Scroll direction, decided from the goal (models often miss it). Vertical is
  // the default; horizontal only when the user says sideways/horizontally.
  const wantsHorizontal = /\b(horizontal(ly)?|sideways|side\s*ways|left\s+to\s+right|right\s+to\s+left|carousel|stories\s+row)\b/i.test(instr);
  for (const ph of plan.phases) {
    if (ph.tool !== 'scroll') continue;
    if (wantsHorizontal) ph.params.direction = 'horizontal';
    else if (ph.params.direction !== 'horizontal') ph.params.direction = 'vertical';
  }

  messages.push({ role: 'assistant', content: raw });
  const events = [...modelEvents, { at: nowIso(), kind: 'obs', msg: `Planned ${plan.phases.length} phases, target ${plan.target.count} ${plan.target.metric}.` }];
  if (fixed.repaired.length) events.push({ at: nowIso(), kind: 'think', msg: 'Plan completed: ' + fixed.repaired.join(', ') + '.' });

  // Deterministic skill routing. Prefer a skill the user explicitly picked;
  // else fall back to matching a taught collection skill named in the goal.
  if (plan.target.metric !== 'scrolls') {
    let routeSkill = (task.useSkills || []).find((s) => s.kind === 'collection') || null;
    if (!routeSkill && plan.target.metric !== 'items' && skills.length) {
      const g = instr.toLowerCase();
      routeSkill = skills.find((s) => s.kind === 'collection' &&
        (g.includes(s.name.toLowerCase()) || g.includes(s.name.toLowerCase().replace(/_/g, ' ')))) || null;
    }
    if (routeSkill) {
      // Use the full skill doc (task snapshot may be trimmed) for its field list.
      const fullSkill = skills.find((s) => s.name === routeSkill.name && s.kind === 'collection') || routeSkill;
      plan.target = { metric: 'items', count: plan.target.count };
      // Skill collection covers it — drop other collectors incl. collect_text.
      plan.phases = plan.phases.filter((p) => !['collect_text'].includes(p.tool));
      // Collect ONLY the fields the task asked for (else all — safe fallback).
      const wantedReads = requestedReadFields(instr, fullSkill.fields);
      const params = { skill: routeSkill.name, target: plan.target.count };
      if (wantedReads.length) {
        params.fields = [...wantedReads, ...requestedClickFields(instr, fullSkill.fields, wantedReads)];
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

  // Drop phases that reference a skill the model invented (not actually taught),
  // so the run doesn't hard-error on a missing skill. Keep the rest.
  const knownSkills = new Set(skills.map((s) => s.name));
  plan.phases = plan.phases.filter((p) => {
    if ((p.tool === 'use_skill' || p.tool === 'collect_by_skill') && !knownSkills.has(p.params?.skill)) {
      events.push({ at: nowIso(), kind: 'think', msg: `Skipped ${p.tool} for unknown skill "${p.params?.skill}" (not taught).` });
      return false;
    }
    return true;
  });

  // If the user asked to verify/compare/correct, guarantee an ai_verify LAST phase.
  if (/\b(verify|compare|correct|validate|cross.?check|double.?check|check if|make sure)\b/i.test(instr)
      && !plan.phases.some((p) => p.tool === 'ai_verify')
      && plan.phases.some((p) => ['collect_by_skill', 'collect_text'].includes(p.tool))) {
    plan.phases.push({ tool: 'ai_verify', params: {} });
    events.push({ at: nowIso(), kind: 'think', msg: 'Added AI verification pass (ai_verify) as the final phase.' });
  }

  // Continuing session: counters (collected/scrolls/actions) are CUMULATIVE
  // across rounds, so "collect 5 more" means baseline + 5, not 5.
  if (task.currentInstruction) {
    const baseline = plan.target.metric === 'scrolls' ? (task.scrolls || 0)
      : plan.target.metric === 'actions' ? (task.actions || 0)
      : (task.collected?.length || 0);
    if (baseline > 0) {
      plan.target.count += baseline;
      events.push({ at: nowIso(), kind: 'think', msg: `Session target: ${baseline} ${plan.target.metric} already done + ${plan.target.count - baseline} new = ${plan.target.count}.` });
    }
  }

  const set = { plan, status: 'running', currentPhaseIndex: 0, messages, updatedAt: nowIso() };
  if ((!task.schemas || !task.schemas.length) && !['scrolls', 'actions'].includes(plan.target.metric)) {
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
    // collect_text always yields a text block + its source url.
    if (!fields.length && plan.target.metric === 'texts') {
      fields = normFields([{ key: 'text', label: 'Text', type: 'text' }, { key: 'url', label: 'URL', type: 'url' }]);
      chosen = 'full text content';
    }
    if (!fields.length) { fields = normFields(parsed?.schema?.fields); chosen = fields.length ? 'from your description' : 'auto-decided'; }
    if (!fields.length) fields = defaultFields(plan.target.metric);

    // Add columns for data the user asked for that no field can scrape (counts,
    // etc.) — ai_verify will fill them from each item's full text.
    const derived = deriveExtraFields(instr, fields);
    if (derived.length && (plan.target.metric === 'items' || plan.target.metric === 'texts')) {
      fields = [...fields, ...derived];
      if (!plan.phases.some((p) => p.tool === 'ai_verify')) {
        plan.phases.push({ tool: 'ai_verify', params: {} });
        set.plan = plan;
      }
      events.push({ at: nowIso(), kind: 'think', msg: `AI will extract from full text: ${derived.map((f) => f.key).join(', ')}.` });
    }

    if (!nm) nm = (parsed?.schema?.name && String(parsed.schema.name).trim()) || task.goal.slice(0, 40);
    // Reuse an existing schema with the same name — re-running the same kind of
    // task must accumulate into ONE collection, not mint "-xxxx" duplicates.
    let created = await schemasColl().findOne({ name: nm }, { projection: { _id: 0 } });
    if (created) {
      events.push({ at: nowIso(), kind: 'think', msg: `Reusing existing schema "${created.name}" — data accumulates there.` });
    } else {
      created = await createSchemaDoc(nm, fields);
      if (created) events.push({ at: nowIso(), kind: 'think', msg: `Created schema "${created.name}" (${chosen}): ${created.fields.map((f) => f.key).join(', ')}.` });
    }
    if (created) set.schemas = [schemaSnapshot(created)];
  }

  // Planning happens inside the current round — stamp every event so they group
  // under the user turn that triggered this plan.
  const rn = task.round || 0;
  for (const e of events) if (e.round == null) e.round = rn;
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

// AI text generation — write content from a prompt (post, message, comment…).
app.post('/ai/generate', async (req, res) => {
  const { model, prompt, words, context } = req.body || {};
  if (!model || !prompt) return res.json({ ok: false, error: 'model and prompt required' });
  const ctx = String(context || '').slice(0, 4000);
  const sys = [
    'You are a skilled writing assistant.',
    'Write exactly what the user asks for and OUTPUT ONLY that text.',
    'No preamble, no sign-off, no surrounding quotation marks, no markdown headings, no explanations.',
    ctx ? 'SOURCE MATERIAL is provided. Write an ORIGINAL text based on it — rephrase/regenerate it in your own words as the task asks. This is the user\'s own material to rework; do not refuse and do not copy it verbatim.' : '',
    words ? `Keep it to roughly ${words} words.` : 'Keep it concise and natural.',
  ].filter(Boolean).join('\n');
  const user = ctx ? `SOURCE MATERIAL:\n"""\n${ctx}\n"""\n\nTASK: ${prompt}` : prompt;
  try {
    const j = await (await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: false, options: { temperature: 0.7 }, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }),
    })).json();
    let text = (j.message?.content || '').trim().replace(/^["'\s]+|["'\s]+$/g, '');
    res.json({ ok: !!text, text, error: text ? undefined : 'empty generation' });
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
  if (metric === 'texts') {
    return normFields([{ key: 'text', label: 'Text', type: 'text' }, { key: 'url', label: 'URL', type: 'url' }]);
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

// ============================ System Prompts ================================
// Named standing instructions the user attaches to tasks. A prompt can bundle
// skills (skillIds); picking the prompt when starting a task selects them too.

const promptsColl = () => collFor('prompts');
const PROMPT_PATCHABLE = new Set(['name', 'content', 'skillIds']);

app.get('/prompts', async (req, res) => {
  const prompts = await promptsColl().find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  res.json({ ok: true, prompts });
});

app.post('/prompts', async (req, res) => {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ ok: false, error: 'name required' });
  const prompt = {
    promptId: crypto.randomUUID(),
    name: String(b.name).trim(),
    content: String(b.content || ''),
    skillIds: Array.isArray(b.skillIds) ? b.skillIds : [],
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  await promptsColl().insertOne({ ...prompt });
  delete prompt._id;
  res.json({ ok: true, prompt });
});

app.patch('/prompts/:id', async (req, res) => {
  const set = {};
  for (const [k, v] of Object.entries(req.body || {})) if (PROMPT_PATCHABLE.has(k)) set[k] = v;
  set.updatedAt = nowIso();
  const doc = await promptsColl().findOneAndUpdate(
    { promptId: req.params.id }, { $set: set }, { returnDocument: 'after', projection: { _id: 0 } });
  res.json({ ok: true, prompt: doc?.value || doc });
});

app.delete('/prompts/:id', async (req, res) => {
  await promptsColl().deleteOne({ promptId: req.params.id });
  res.json({ ok: true });
});

// ========================= Introduced Elements ==============================
// Phase 1 of the two-step skill redesign (docs/skill-redesign-plan.md).
// An ELEMENT is a named, route-bound pointer to one thing on a page. Skills
// (v2) reference elements by id, so repointing one element heals every skill
// that uses it. Selectors are stored RELATIVE to the parent element when
// parentId is set; the resolver composes absolute chains for the legacy
// runtime.

// --- route patterns ---
// Accepted forms (host prefix optional and stripped): 'facebook.com',
// 'facebook.com/*', '/', '/*', '/post/[postId]'. A bare host or '/*' means ANY
// path on the host; an explicit '/' means the root page only. '[slug]' matches
// exactly one path segment; '*' matches anything (including '/').

function normalizeRoute(pattern, host) {
  let p = String(pattern || '').trim().replace(/^https?:\/\//, '');
  const h = String(host || '').replace(/^www\./, '').toLowerCase();
  if (h) {
    const low = p.toLowerCase();
    for (const pre of [h, 'www.' + h]) {
      if (low === pre || low === pre + '/*') return '/*';
      if (low.startsWith(pre + '/')) { p = p.slice(pre.length); break; }
    }
  }
  if (!p) return '/*';
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

function routeToRegex(route) {
  const src = String(route || '/*')
    .replace(/[.+?^${}()|\\]/g, '\\$&')   // escape regex chars (not * or [])
    .replace(/\[[^\]/]+\]/g, '[^/]+')     // [slug] -> one path segment
    .replace(/\*/g, '.*');                // * -> anything
  return new RegExp('^' + src + '/?$', 'i');
}

function routeMatches(route, path) {
  const p = (String(path || '/').split('?')[0].replace(/\/+$/, '')) || '/';
  try { return routeToRegex(route).test(p); } catch { return false; }
}

// Generalize a concrete path into a pattern: dynamic-looking segments (long
// numbers, hashes, fb post ids) become editable [slug] params.
function generalizeRoute(path) {
  const segs = String(path || '/').split('?')[0].split('/').filter(Boolean);
  const out = segs.map((s) => {
    if (/^pfbid/i.test(s)) return '[postId]';
    if (/^\d{4,}$/.test(s)) return '[id]';
    if (/^[0-9a-f]{10,}$/i.test(s) || /^[A-Za-z0-9_=-]{18,}$/.test(s)) return '[id]';
    return s;
  });
  return '/' + out.join('/');
}

// --- elements CRUD ---

const elementsColl = () => collFor('elements');
const ELEMENT_TYPES = new Set(['container', 'item', 'field', 'action', 'input']);
const ELEMENT_PATCHABLE = new Set(['name', 'details', 'route', 'type', 'action', 'attr', 'key', 'parentId', 'selectors']);

// Unique snake_case name per host (suffixes _2, _3… on collision).
async function uniqueElementName(host, wanted, ignoreId) {
  const base = snakeName(wanted);
  const taken = new Set((await elementsColl().find({ host }, { projection: { name: 1, elementId: 1 } }).toArray())
    .filter((e) => e.elementId !== ignoreId).map((e) => e.name));
  let name = base, i = 2;
  while (taken.has(name)) name = `${base}_${i++}`;
  return name;
}

app.get('/elements', async (req, res) => {
  const q = {};
  if (req.query.host) q.host = String(req.query.host).replace(/^www\./, '');
  let elements = await elementsColl().find(q, { projection: { _id: 0, sampleHtml: 0 } }).sort({ createdAt: -1 }).toArray();
  if (req.query.path) elements = elements.filter((e) => routeMatches(e.route, req.query.path));
  res.json({ ok: true, elements });
});

app.get('/elements/:id', async (req, res) => {
  const element = await elementsColl().findOne({ elementId: req.params.id }, { projection: { _id: 0 } });
  if (!element) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, element });
});

app.post('/elements', async (req, res) => {
  const b = req.body || {};
  if (!b.host || !b.name || !b.type) return res.status(400).json({ ok: false, error: 'host, name and type required' });
  if (!ELEMENT_TYPES.has(b.type)) return res.status(400).json({ ok: false, error: 'type must be one of ' + [...ELEMENT_TYPES].join('|') });
  const host = String(b.host).replace(/^www\./, '');
  if (b.parentId && !(await elementsColl().findOne({ elementId: b.parentId }))) {
    return res.status(400).json({ ok: false, error: 'parentId does not exist' });
  }
  const element = {
    elementId: crypto.randomUUID(),
    host,
    route: normalizeRoute(b.route, host),
    name: await uniqueElementName(host, b.name),
    details: String(b.details || ''),
    type: b.type,
    action: b.action || null,
    attr: b.attr || null,
    key: b.key || null,               // key to press when action === 'press'
    parentId: b.parentId || null,
    selectors: Array.isArray(b.selectors) ? b.selectors : [],
    sample: b.sample || null,
    sampleHtml: b.sampleHtml ? String(b.sampleHtml).slice(0, 60000) : null,
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await elementsColl().insertOne({ ...element });
  delete element._id;
  res.json({ ok: true, element });
});

app.patch('/elements/:id', async (req, res) => {
  const el = await elementsColl().findOne({ elementId: req.params.id });
  if (!el) return res.status(404).json({ ok: false, error: 'not found' });
  const set = {};
  for (const [k, v] of Object.entries(req.body || {})) if (ELEMENT_PATCHABLE.has(k)) set[k] = v;
  if (set.route != null) set.route = normalizeRoute(set.route, el.host);
  if (set.name != null) set.name = await uniqueElementName(el.host, set.name, el.elementId);
  if (set.parentId === el.elementId) return res.status(400).json({ ok: false, error: 'element cannot be its own parent' });
  set.updatedAt = nowIso();
  const doc = await elementsColl().findOneAndUpdate(
    { elementId: req.params.id }, { $set: set }, { returnDocument: 'after', projection: { _id: 0 } });
  res.json({ ok: true, element: doc?.value || doc });
});

// Repoint (re-introduce): NEW selectors go in on top; the previous ones are
// kept as demoted fallbacks (the runtime tries candidates in score order, so
// old selectors give free resilience). Identity, name and skill references
// are untouched — this is the whole point of elements.
app.post('/elements/:id/repoint', async (req, res) => {
  const el = await elementsColl().findOne({ elementId: req.params.id });
  if (!el) return res.status(404).json({ ok: false, error: 'not found' });
  const fresh = Array.isArray(req.body?.selectors) ? req.body.selectors : [];
  if (!fresh.length) return res.status(400).json({ ok: false, error: 'selectors required' });
  const demoted = (el.selectors || []).map((s) => ({ ...s, score: Math.max(1, (s.score || 50) - 20) }));
  const seen = new Set();
  const merged = [...fresh, ...demoted].filter((s) => {
    const k = s.strategy + '|' + (s.value || s.text || '');
    if (seen.has(k)) return false; seen.add(k); return true;
  }).slice(0, 6); // cap history
  const set = { selectors: merged, version: (el.version || 1) + 1, updatedAt: nowIso() };
  if (req.body.sample) set.sample = req.body.sample;
  if (req.body.sampleHtml) set.sampleHtml = String(req.body.sampleHtml).slice(0, 60000);
  const doc = await elementsColl().findOneAndUpdate(
    { elementId: req.params.id }, { $set: set }, { returnDocument: 'after', projection: { _id: 0 } });
  res.json({ ok: true, element: doc?.value || doc });
});

app.delete('/elements/:id', async (req, res) => {
  const refs = await skillsColl().find(
    { 'elements.elementId': req.params.id }, { projection: { _id: 0, skillId: 1, name: 1 } }).toArray();
  if (refs.length && !req.query.force) {
    return res.status(409).json({ ok: false, error: 'element is used by skills', skills: refs });
  }
  if (refs.length) {
    await skillsColl().updateMany(
      { 'elements.elementId': req.params.id },
      { $pull: { elements: { elementId: req.params.id } }, $set: { updatedAt: nowIso() } });
  }
  await elementsColl().deleteOne({ elementId: req.params.id });
  res.json({ ok: true, removedFromSkills: refs.length });
});

// --- v2 skill resolver ---
// Hydrate a v2 skill (element references) into the legacy runtime shape the
// extension already executes ({ kind, action, selectors, item, fields }), so
// use_skill / collect_by_skill / content.js need no changes.

const topCss = (el) => {
  const c = (el.selectors || []).find((s) => s.strategy === 'css' && s.value);
  return c ? c.value : '';
};

// Absolute selector candidates for an element: prefix each css candidate with
// the ancestor chain's top css selectors.
function absSelectors(el, byId) {
  let prefix = '';
  let p = el.parentId ? byId.get(el.parentId) : null;
  for (let hops = 0; p && hops < 5; hops++) {
    const ps = topCss(p);
    if (ps) prefix = prefix ? ps + ' ' + prefix : ps;
    p = p.parentId ? byId.get(p.parentId) : null;
  }
  if (!prefix) return el.selectors || [];
  return (el.selectors || []).map((s) => (s.strategy === 'css' && s.value) ? { ...s, value: prefix + ' ' + s.value } : s);
}

function resolveSkillDoc(skill, byId) {
  const refs = Array.isArray(skill.elements) ? skill.elements : null;
  if (!refs || !refs.length) return skill; // legacy skill — already runtime-shaped
  const els = refs
    .slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((r) => byId.get(typeof r === 'string' ? r : r.elementId))
    .filter(Boolean);
  const out = { ...skill, resolved: true };
  const item = els.find((e) => e.type === 'item');
  if (item) {
    out.kind = 'collection';
    out.item = { selectors: absSelectors(item, byId) };
    out.fields = els
      .filter((e) => e !== item && e.type !== 'container' && e.type !== 'item')
      .map((e) => ({
        name: e.name,
        attr: e.attr || (e.action === 'click' ? 'click' : 'text'),
        // field selectors resolve INSIDE each item node, so keep them relative
        selectors: e.selectors || [],
      }));
  } else {
    const acts = els.filter((e) => e.type === 'action' || e.type === 'input');
    if (acts.length) {
      out.kind = 'action';
      out.action = acts[0].action || 'click';
      out.key = acts[0].key || null;
      out.selectors = absSelectors(acts[0], byId);
      if (acts.length > 1) {
        // Ordered bundle for the run_skill sequence runner.
        out.steps = acts.map((e) => ({ name: e.name, action: e.action || 'click', attr: e.attr || null, key: e.key || null, selectors: absSelectors(e, byId) }));
      }
    }
  }
  return out;
}

// Hydrate a list of skills, loading each host's elements once.
async function resolveSkills(skills) {
  if (!skills.some((s) => Array.isArray(s.elements) && s.elements.length)) return skills;
  const hosts = [...new Set(skills.map((s) => s.host))];
  const all = await elementsColl().find({ host: { $in: hosts } }, { projection: { _id: 0, sampleHtml: 0 } }).toArray();
  const byId = new Map(all.map((e) => [e.elementId, e]));
  return skills.map((s) => resolveSkillDoc(s, byId));
}

// ============================= Page Skills ==================================
// Learned page features taught in a learning session. Scoped per URL pattern.
// A skill is either an "action" (one element + a verb) or a "collection"
// (a repeating item + per-item fields). The shape is open so new kinds
// (sequence, condition, form…) can be added later without migration.

const skillsColl = () => collFor('skills');

app.get('/skills', async (req, res) => {
  const q = {};
  if (req.query.host) q.host = req.query.host;
  let skills = await skillsColl().find(q, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  if (req.query.resolve) skills = await resolveSkills(skills); // v2 → legacy runtime shape
  res.json({ ok: true, skills });
});

app.get('/skills/:id', async (req, res) => {
  let skill = await skillsColl().findOne({ skillId: req.params.id }, { projection: { _id: 0 } });
  if (!skill) return res.status(404).json({ ok: false, error: 'not found' });
  if (req.query.resolve) [skill] = await resolveSkills([skill]);
  res.json({ ok: true, skill });
});

app.post('/skills', async (req, res) => {
  const b = req.body || {};
  const isV2 = Array.isArray(b.elements) && b.elements.length;
  if (!b.name || !b.host || (!b.kind && !isV2)) {
    return res.status(400).json({ ok: false, error: isV2 ? 'host and name required' : 'host, name and kind required' });
  }
  // v2: validate the element references exist.
  let elementRefs = null;
  if (isV2) {
    const ids = b.elements.map((r) => (typeof r === 'string' ? r : r.elementId)).filter(Boolean);
    const found = await elementsColl().find({ elementId: { $in: ids } }, { projection: { elementId: 1 } }).toArray();
    const have = new Set(found.map((e) => e.elementId));
    const missing = ids.filter((id) => !have.has(id));
    if (missing.length) return res.status(400).json({ ok: false, error: 'unknown elementId(s): ' + missing.join(', ') });
    elementRefs = b.elements.map((r, i) => (typeof r === 'string' ? { elementId: r, order: i } : { elementId: r.elementId, order: r.order ?? i }));
  }
  const skill = {
    skillId: crypto.randomUUID(),
    host: String(b.host),
    urlPattern: b.urlPattern || `${b.host}/*`,
    name: String(b.name).trim(),
    details: String(b.details || ''),
    kind: b.kind || null,             // legacy: 'action' | 'collection'; v2 derives at resolve
    elements: elementRefs,            // v2: [{elementId, order}] — resolver hydrates these
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
  delete skill._id;
  res.json({ ok: true, skill });
});

const SKILL_PATCHABLE = new Set(['name', 'urlPattern', 'kind', 'action', 'selectors', 'item', 'fields', 'details', 'elements']);
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

// Auto-learn (overlay): the AI analyzes a digest of candidate page nodes and
// PICKS which ones to introduce (with names/types/attrs/details) plus a skill
// proposal. Pure suggestion — nothing is persisted here; the overlay computes
// selectors deterministically and saves only after the user confirms.
app.post('/learn/auto-detect', async (req, res) => {
  const { model, host, path: pagePath, candidates } = req.body || {};
  if (!model) return res.json({ ok: false, error: 'no model' });
  if (!Array.isArray(candidates) || !candidates.length) return res.json({ ok: false, error: 'candidates required' });
  try {
    const j = await (await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, stream: false, options: { temperature: 0 },
        format: {
          type: 'object',
          properties: {
            picks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  i: { type: 'integer' },
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['item', 'field', 'action', 'input', 'container'] },
                  attr: { type: 'string', enum: ['text', 'innerText', 'href', 'src', ''] },
                  action: { type: 'string', enum: ['click', 'type', 'press', 'read', 'hover', 'scroll', ''] },
                  details: { type: 'string' },
                },
                required: ['i', 'name', 'type'],
              },
            },
            skillName: { type: 'string' },
            skillDetails: { type: 'string' },
          },
          required: ['picks', 'skillName'],
        },
        messages: [
          { role: 'system', content: 'You analyze a web page for browser automation. Input JSON: {host, path, candidates:[{i, where, tag, role, aria, text, href, img, editable, count}]}. where="item" is a repeating list/feed container (count = how many repeats); where="in-item" nodes live inside ONE instance of it; where="page" nodes are page-wide. Choose the elements worth automating: the repeating item itself, the data fields inside it (publisher/author, title, body text, permalink, image, timestamp), its key actions (like/comment/share buttons), and page-level inputs (search box, post composer). Skip decoration, icons, and duplicates — when two candidates carry the same text, pick the more specific one. For each pick give: i (the candidate index), a short snake_case name, type (item|field|action|input|container), attr for fields (text|innerText|href|src), action for action/input types (click|type|press|read|hover|scroll), and one-line details describing what it is. Also propose a snake_case skillName and one-line skillDetails for a skill composed of these picks. At most 12 picks. Reply STRICT JSON {"picks":[...],"skillName":"...","skillDetails":"..."}.' },
          { role: 'user', content: JSON.stringify({ host, path: pagePath, candidates }) },
        ],
      }),
    })).json();
    const out = JSON.parse(j.message?.content || '{}');
    const byI = new Set(candidates.map((c) => c.i));
    const seenI = new Set();
    const picks = (Array.isArray(out.picks) ? out.picks : [])
      .filter((p) => Number.isInteger(p.i) && byI.has(p.i) && !seenI.has(p.i) && ELEMENT_TYPES.has(p.type) && (seenI.add(p.i) || true))
      .slice(0, 12)
      .map((p) => ({
        i: p.i, name: snakeName(p.name), type: p.type,
        attr: p.attr || null, action: p.action || null,
        details: String(p.details || '').slice(0, 200),
      }));
    if (!picks.length) return res.json({ ok: false, error: 'model picked nothing' });
    res.json({ ok: true, picks, skillName: snakeName(out.skillName || ''), skillDetails: String(out.skillDetails || '').slice(0, 300) });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

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
