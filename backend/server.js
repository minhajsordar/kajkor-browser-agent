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
const feedbackTriage = require('./feedback-triage');
const lessons = require('./lessons');
const todos = require('./todos');
const appCommands = require('./app-commands');
const httpGuard = require('./http-guard');

// --- backend/.env (dev convenience) ------------------------------------------
// Fills in vars NOT already in the environment — real env always wins. No
// dotenv dependency; a plain KEY=VALUE parse is enough. Packaged builds do not
// ship this file — they get EMBEDDED_MONGODB_URI baked in at build time, or
// backend-config.json in userData.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] !== '' && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env — fine */ }

const PORT = process.env.PORT || 34730;
// EMBEDDED_MONGODB_URI is an esbuild --define substituted at build time by
// desktop-app/scripts/build-server.cjs. In plain `node server.js` the
// identifier is undefined — the typeof guard keeps that path safe. It is a
// DEFAULT only: an explicit MONGODB_URI still wins.
const MONGODB_URI = process.env.MONGODB_URI
  || (typeof EMBEDDED_MONGODB_URI !== 'undefined' ? EMBEDDED_MONGODB_URI : null);
if (!MONGODB_URI) {
  console.error('MONGODB_URI is required. Set it as an environment variable, in backend/.env, or in backend-config.json for packaged builds.');
  process.exit(1);
}
const DB_NAME = process.env.MONGODB_DB || 'browser_agent';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEBUG_DIR = path.join(__dirname, '..', 'sample', 'debug');

const app = express();

// --- CORS -------------------------------------------------------------------
// The origin policy lives in `http-guard.js` (pure, unit-tested) — see the
// comment there for WHY a blanket `cors()` was unsafe.
const EXTRA_ORIGINS = httpGuard.parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
app.use(cors({
  origin: (origin, cb) => (httpGuard.originAllowed(origin, EXTRA_ORIGINS)
    ? cb(null, true)
    : cb(new Error(`origin ${origin} is not allowed — add it to CORS_ALLOWED_ORIGINS`))),
}));

app.use(express.json({ limit: '25mb' })); // large HTML payloads for debug saves

// --- authentication (JWT) ----------------------------------------------------
// Trust model: LOOPBACK requests (the extension and the desktop app on this
// machine) pass without a token, so local workflows are unchanged. Anything
// arriving over the network needs `Authorization: Bearer <jwt>` from
// /auth/login. Set AUTH_ENFORCE_LOCAL=1 to require tokens locally too.
let AUTH_SECRET = process.env.AUTH_SECRET;
const AUTH_ENFORCE_LOCAL = process.env.AUTH_ENFORCE_LOCAL === '1';
if (!AUTH_SECRET) {
  AUTH_SECRET = crypto.randomBytes(48).toString('hex');
  console.warn('[auth] AUTH_SECRET not set; using a random in-memory secret. Set AUTH_SECRET so tokens survive restarts.');
}
const usersColl = () => collFor('users');
const isLoopback = (req) => /^(::1$|::ffff:127\.|127\.)/.test(String(req.ip || ''));
const AUTH_EXEMPT = [/^\/health$/, /^\/auth\/(login|register)$/];
const publicUser = (u) => ({ userId: u.userId, name: u.name, email: u.email, role: u.role });

// --- login throttle ---------------------------------------------------------
// /auth/login and /auth/register are the only endpoints reachable WITHOUT a
// token, so they are the only ones a remote attacker can hammer. A fixed window
// per IP is enough to make password guessing impractical; it is kept in memory
// on purpose (no new dependency, and a restart clearing it is harmless — the
// window is 15 minutes). Loopback is exempt: that is the user's own machine, and
// throttling it would lock them out of their own app.
// The window arithmetic itself is `httpGuard.throttleDecision` (pure, tested).
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;
const AUTH_RATE_MAX = 20;
const authHits = new Map(); // ip -> { count, resetAt }
function throttleAuth(req, res, next) {
  if (isLoopback(req)) return next();
  const ip = String(req.ip || 'unknown');
  const { allowed, state } = httpGuard.throttleDecision(authHits.get(ip), Date.now(), {
    windowMs: AUTH_RATE_WINDOW_MS, max: AUTH_RATE_MAX,
  });
  authHits.set(ip, state);
  if (!allowed) {
    console.warn(`[auth] rate limit hit for ${ip}`);
    return res.status(429).json({ ok: false, error: 'too many attempts — try again later' });
  }
  next();
}
// Drop expired windows so a long-running backend cannot be memory-grown by
// spraying requests from many source addresses.
setInterval(() => {
  const now = Date.now();
  for (const [ip, hit] of authHits) if (now > hit.resetAt) authHits.delete(ip);
}, AUTH_RATE_WINDOW_MS).unref();

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
app.post('/auth/register', throttleAuth, async (req, res) => {
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

app.post('/auth/login', throttleAuth, async (req, res) => {
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
  // Every schema's collected data lives in ONE `records` collection, tagged
  // with the schema it belongs to (see the Schemas section).
  await collFor('records').createIndex({ schemaId: 1, _sourceUrl: 1 });
  await collFor('records').createIndex({ schemaId: 1, _taskId: 1 });
  await collFor('skills').createIndex({ skillId: 1 }, { unique: true });
  await collFor('skills').createIndex({ host: 1 });
  await collFor('debug_items').createIndex({ taskId: 1 });
  await collFor('task_shots').createIndex({ taskId: 1 });
  await collFor('users').createIndex({ email: 1 }, { unique: true });
  await collFor('routines').createIndex({ routineId: 1 }, { unique: true });
  await collFor('todolists').createIndex({ listId: 1 }, { unique: true });
  await collFor('todolists').createIndex({ date: -1 });
  // The idempotency guarantee for materialising: one list per routine per
  // occurrence, enforced by the DB so two callers racing cannot both win.
  // Sparse — ad-hoc lists have no routine and no occurrence key.
  await collFor('todolists').createIndex(
    { routineId: 1, occurrenceKey: 1 },
    { unique: true, partialFilterExpression: { routineId: { $type: 'string' }, occurrenceKey: { $type: 'string' } } },
  );
  console.log(`Mongo connected: ${DB_NAME}`);
  await migrateLegacyDataCollections();
}

// One-time: schemas used to own a per-schema `data_<slug>` collection. Copy any
// leftover rows into the shared `records` collection and drop `dataCollection`
// from the schema doc. Source collections are left in place (manual cleanup).
async function migrateLegacyDataCollections() {
  const legacy = await collFor('schemas').find({ dataCollection: { $exists: true } }).toArray();
  for (const s of legacy) {
    try {
      const rows = await collFor(s.dataCollection).find({}).toArray();
      for (const r of rows) {
        const doc = wrapRecord(s.schemaId, r);
        const filter = doc._sourceUrl
          ? { schemaId: s.schemaId, _sourceUrl: doc._sourceUrl }
          : { schemaId: s.schemaId, result: doc.result };
        await collFor('records').updateOne(
          filter,
          { $set: { ...doc, updatedAt: r.updatedAt || nowIso() }, $setOnInsert: { createdAt: r.createdAt || nowIso() } },
          { upsert: true }
        );
      }
      await collFor('schemas').updateOne({ schemaId: s.schemaId }, { $unset: { dataCollection: '' } });
      if (rows.length) console.log(`Migrated ${rows.length} record(s) from ${s.dataCollection} → records`);
    } catch (e) {
      console.warn(`Migration skipped for ${s.dataCollection}: ${e.message}`);
    }
  }
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
    desc: 'Open a web page by full URL. Set newTab=true when the user asks to OPEN a tab/window (e.g. "open facebook.com in a tab", or when they later want that tab closed); otherwise an already-open tab on the same site is reused.' },
  { name: 'scroll', params: ['times', 'seconds', 'delay', 'direction'],
    desc: 'Scroll the current page WITHOUT collecting anything. Give `times` for a number of steps, OR `seconds` when the user asks to scroll FOR A DURATION ("scroll for 5 seconds") — never convert seconds into steps yourself. `delay` is milliseconds between steps (default 1200). `direction` is "vertical" (default, down the feed) or "horizontal" (sideways through a carousel/stories/reels row) — set horizontal ONLY when the user asks to scroll sideways.' },
  { name: 'click', params: ['selector', 'text', 'descriptor'],
    desc: 'Click the element matching a CSS `selector` on the current page (or the first element whose visible text contains `text`). Use for buttons, links, tabs, "See more", etc. PREFER `descriptor` (see DESCRIBING ELEMENTS) when the user described the target by its wording — especially "the button with ONLY that text", which `text` cannot express.' },
  { name: 'hover', params: ['selector', 'text', 'descriptor'],
    desc: 'Hover (mouseover) the element matching a CSS `selector` (or containing `text`) on the current page — e.g. to reveal a menu or tooltip. Also accepts `descriptor`.' },
  { name: 'wait', params: ['seconds', 'selector', 'text', 'descriptor'],
    desc: 'Wait. With `selector`/`text`/`descriptor`: wait until that element APPEARS on the page (up to 30s) — use between the steps of a multi-step dialog, where the next step\'s controls do not exist until the previous one is done. With only `seconds`: pause that long.' },
  { name: 'screenshot', params: [],
    desc: 'Capture the visible area of the current tab and attach it to the task as evidence (viewable in the dashboard). Use when the user asks to see/verify what happened.' },
  { name: 'close_tab', params: ['match'],
    desc: 'Close a tab. With no params it closes the tab this task is working in (the one a previous `navigate` opened or reused). Pass `match` (a host, URL fragment or title text) to close a specific other tab instead.' },
  { name: 'switch_tab', params: ['match'],
    desc: 'Switch to another ALREADY-OPEN tab and make it the tab this task acts on. `match` is a host, URL fragment or title text (e.g. "facebook.com", "Gmail"). Use when the user says "go back to the X tab" or the work continues on a different tab.' },
  { name: 'list_tabs', params: [],
    desc: 'List the tabs currently open (title + URL) and record them in the task log. Use when the user asks what is open, or when you need to find the right tab before switching to it.' },
  { name: 'reload_tab', params: [],
    desc: 'Reload the current tab and wait for it to finish loading. Use after an action that needs a refresh to take effect, or when a page is stuck.' },
  { name: 'go_back', params: [],
    desc: 'Go back one page in the current tab\'s history (the browser Back button).' },
  { name: 'ask_user', params: ['question'],
    desc: 'PAUSE the task and ask the user to confirm before continuing (Approve/Decline in the popup or dashboard). Add this ONLY when the user explicitly asked to approve/review something first ("ask me before posting", "let me review it"). If they simply told you to post or send something, DO IT — do not add a confirmation they did not ask for.' },
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
  { name: 'collect_links', params: ['target'],
    desc: 'On a SEARCH-RESULTS page (Google etc.), collect the top `target` organic result links (url + title) in ranking order — it skips ads, "People also ask", and the search engine\'s own links. Use right after opening a web search to gather the result sites to visit.' },
  { name: 'read_pages', params: ['target', 'maxChars'],
    desc: 'Visit each link collected by collect_links (in a background tab) and extract that page\'s readable main content — title, article text and images — saving it onto the record as a SOURCE. Use straight after collect_links when the user wants the CONTENT of the results (research, analysis, comparison, summary), not just the links. Unreachable pages are skipped, not fatal.' },
  { name: 'synthesize', params: ['question'],
    desc: 'Read every SOURCE gathered by read_pages and write the final answer/analysis for the user, citing each claim as [1], [2]… Add this as the LAST phase of any research/analysis task so the user gets a written answer instead of raw data.' },
  { name: 'solve_with_code', params: ['goal', 'expect'],
    desc: 'LAST RESORT when no other tool can do the job: writes JavaScript, runs it on the current page, checks the result, and rewrites it differently if it failed (up to 4 attempts). READ-ONLY — it can extract, count, measure and compute, but must NOT click, type or change the page (use the normal tools for that). `goal` = what to get; `expect` = how to tell it worked (e.g. "at least 5 rows, each with a name and a price").' },
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
          // MUST list every metric the prompt tells the model to use — this
          // enum is grammar-ENFORCED by Ollama (passed as `format`), so a value
          // missing here is one the model physically cannot emit. "links" was
          // missing while the prompt and all research examples demanded it, so
          // every search plan was silently coerced to "texts"/"actions" and only
          // survived if repairPlan happened to relabel it. Keep in sync with the
          // metric list in planningSystemPrompt and the branches in repairPlan.
          metric: { type: 'string', enum: ['scrolls', 'items', 'texts', 'links', 'actions'] },
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
    '- "target.metric" is one of: "scrolls" (only scrolling, no data collection), "texts" (collecting the full inner text of matching elements via collect_text), "items" (collecting taught fields from each repeating item via a learned collection skill), "links" (collecting search-result links via collect_links), or "actions" (UI interactions only — clicks/typing/etc.).',
    '- "target.count" is the number the user asked for.',
    '- Always start with a `navigate` phase using the URL implied by the task. Only omit navigate when the task clearly acts on the page already open.',
    '- TO SEARCH THE WEB: do NOT type into a search box. `navigate` DIRECTLY to the results URL "https://www.google.com/search?q=<the+query+url+encoded>", then use `collect_links` (metric "links") to gather the top result sites. This is far more reliable than typing + pressing Enter.',
    '- TO RESEARCH / ANALYZE / COMPARE / SUMMARIZE a topic from the web ("give me an analysis of…", "research…", "top 10…"): navigate to the search URL, then `collect_links`, then `read_pages` to pull the CONTENT of those results, then `synthesize` to write the cited answer. Use metric "links" with the number of sources to gather (default 10).',
    '- ANSWERING A QUESTION ("what is the current price of X", "who won…", "latest…", "best…", "is X better than Y") ALWAYS goes through the search pipeline: navigate to the google search URL for the question, `collect_links`, `read_pages`, `synthesize`. NEVER navigate straight to a site you guessed from memory to read a fact off it.',
    '- NEVER invent a CSS selector for a site you have not inspected. `collect_text` selectors are only valid when the user named the selector, or the page structure is already known from a learned skill. If you do not know the selector, use the search pipeline instead.',
    '- If the user says only to scroll (no data), use the `scroll` tool and metric "scrolls".',
    '- To collect the text content of repeating elements (posts, results, rows, comments), use `collect_text` with a CSS `selector` and metric "texts".',
    '- For UI interactions (clicking buttons/links/tabs, hovering to reveal menus) use the `click` and `hover` tools; if the task is only interactions (no data collected) use metric "actions" with count = number of interaction steps.',
    '- To enter EXACT text the user gave into a field/box use the `type` tool with params.value = that text. Do NOT use use_skill for typing.',
    '- NEVER put a placeholder like "<the post text>", "<generated text>" or "<...>" in params.value. If the user gave exact words, copy them verbatim; if they did NOT give any text, use `generate_text` — typing a placeholder publishes the literal placeholder.',
    '- To WRITE/GENERATE/COMPOSE text with AI (a post/message/comment about a topic) use the `generate_text` tool with params.prompt describing what to write; it generates the text and types it into the field.',
    '- use_skill, run_skill and collect_by_skill may ONLY reference a skill from the "Learned skills" list below. NEVER invent or guess a skill name. If no learned skill fits, use the generic click/type/hover/collect_text tools instead.',
    '- For navigate, set params.newTab to true ONLY if the user explicitly asks to open a NEW tab; if they refer to the current/existing tab, omit newTab.',
    '- Phases run in order. Use the fewest phases needed.',
    '',
    'DESCRIBING ELEMENTS (params.descriptor) — prefer this over guessing a CSS selector.',
    'The descriptor is ALWAYS an object nested under params.descriptor. Never put "exactText"/"by"/"scope"',
    'directly in params — a phase with no selector, text or descriptor has NO TARGET and cannot run.',
    'Full phases, copy this shape exactly:',
    '  {"tool":"click","params":{"descriptor":{"by":"exactText","value":"Next","scope":"dialog"}}}',
    '  {"tool":"click","params":{"descriptor":{"by":"text","value":"What\'s on your mind"}}}',
    '  {"tool":"type","params":{"descriptor":{"by":"attr","attr":"contenteditable","value":"true","scope":"dialog"},"value":"the text to type"}}',
    'The `by` values available:',
    '  "exactText"    the control whose text is EXACTLY this (not "Next step")',
    '  "text"         anything whose text CONTAINS this',
    '  "attr"         by attribute — needs "attr" (the attribute name) and "value"',
    '  "placeholder"  a field by its placeholder or label',
    'Add "scope":"dialog" when the control is inside a popup/dialog that an earlier step opened — it then',
    'searches ONLY inside that popup, so it cannot hit a similar control in the page behind it.',
    'Use "exactText" whenever the user says "only that text" / "just the word X". Use it for publish buttons',
    'like Post/Share/Send, where a loose match hits a feed item instead of the real button.',
    '- A MULTI-STEP dialog (a form with Next / Continue between screens) only renders the NEXT screen after the',
    '  previous one is submitted: its controls do not exist yet and no amount of waiting makes them appear early.',
    '  Plan click(Next) → wait(descriptor of something on the next screen) → click(the next screen\'s button).',
    '- A task MAY SPAN SEVERAL SITES ("research X then post it on facebook", "summarize this then tweet it"). Emit ONE `navigate` for EACH site, in visit order, followed by the phases acting on that site. Never drop the later steps — plan the WHOLE request, end to end.',
    '- When the task researches something and THEN writes a post/message from it, put the research phases first (`collect_links` → `read_pages` → `synthesize`), then `navigate` to the publishing site, then the composing/publishing phases. `generate_text` automatically writes from the research produced earlier in the same task, so params.prompt only needs to say what KIND of text to write.',
    '- If the user asks to verify/compare/correct collected fields against a fuller text, add an "ai_verify" phase LAST, with params.source set to the field holding the full text.',
    '',
    'Example — "search the web for best budget laptops and gather the result links":',
    '{"target":{"metric":"links","count":10},"phases":[{"tool":"navigate","params":{"url":"https://www.google.com/search?q=best+budget+laptops"}},{"tool":"collect_links","params":{"target":10}}]}',
    'Example — "give me an analysis of the top 10 small businesses that need the lowest investment":',
    '{"target":{"metric":"links","count":10},"phases":[{"tool":"navigate","params":{"url":"https://www.google.com/search?q=top+small+businesses+lowest+investment"}},{"tool":"collect_links","params":{"target":10}},{"tool":"read_pages","params":{"target":10}},{"tool":"synthesize","params":{}}]}',
    'Example — "research windows laptop vs macbook, prepare a facebook post, then post it on my feed" (TWO sites — research, then publish):',
    '{"target":{"metric":"links","count":10},"phases":[{"tool":"navigate","params":{"url":"https://www.google.com/search?q=windows+laptop+vs+macbook"}},{"tool":"collect_links","params":{"target":10}},{"tool":"read_pages","params":{"target":10}},{"tool":"synthesize","params":{}},{"tool":"navigate","params":{"url":"https://www.facebook.com"}},{"tool":"click","params":{"text":"What\'s on your mind"}},{"tool":"generate_text","params":{"prompt":"Write a short engaging facebook post comparing windows laptops and macbooks"}},{"tool":"click","params":{"text":"Post"}}]}',
    'Example — "open example.com and only scroll 10 times, do not collect":',
    '{"target":{"metric":"scrolls","count":10},"phases":[{"tool":"navigate","params":{"url":"https://example.com"}},{"tool":"scroll","params":{"times":10}}]}',
    'Example — "on the current page, hover the menu then click the Settings link":',
    '{"target":{"metric":"actions","count":2},"phases":[{"tool":"hover","params":{"text":"menu"}},{"tool":"click","params":{"text":"Settings"}}]}',
    'Example — "open the composer and write \'Hello everyone\', do not publish" (a LITERAL value, never a <placeholder>):',
    '{"target":{"metric":"actions","count":2},"phases":[{"tool":"click","params":{"text":"What\'s on your mind"}},{"tool":"type","params":{"value":"Hello everyone"}}]}',
    'Example — "open the composer and generate a post about surviving the AI era":',
    '{"target":{"metric":"actions","count":2},"phases":[{"tool":"click","params":{"text":"What\'s on your mind"}},{"tool":"generate_text","params":{"prompt":"Write a post about how we can survive in the AI era"}}]}',
    'Example — "collect the full text of 5 posts ON FACEBOOK" — the [role="article"] selector below is SPECIFIC to Facebook\'s feed. Do NOT copy it to Google or any other site; on a site whose structure you do not know, use the search pipeline (collect_links → read_pages) instead of guessing a selector:',
    '{"target":{"metric":"texts","count":5},"phases":[{"tool":"navigate","params":{"url":"https://www.facebook.com"}},{"tool":"collect_text","params":{"selector":"[role=\\"article\\"]","target":5}}]}',
  ];
  if (skills && skills.length) {
    base.push('', 'Learned skills you can use (reference by exact name):');
    for (const s of skills) {
      const about = s.details ? ` — ${s.details}` : '';
      // Instruction skills are GUIDANCE, not a script: the prose says what the
      // flow is, the hints say where things were last time. Planning still
      // happens — the hints just mean fewer guesses at button wording.
      if (s.kind === 'instruction') {
        base.push(`- "${s.name}" on ${s.urlPattern} — a REMEMBERED FLOW. Plan it yourself from these instructions:`);
        base.push(`    ${String(s.instructions || s.details || '').slice(0, 700)}`);
        const hints = (s.hints || []).filter((h) => h.descriptor).slice(0, 8);
        if (hints.length) {
          base.push('    Controls that worked on this site before — reuse these descriptors:');
          for (const h of hints) {
            base.push(`      ${h.tool || 'click'} descriptor=${JSON.stringify(h.descriptor)}${h.matched ? `  (matched "${h.matched}")` : ''}`);
          }
        }
      }
      else if (s.kind === 'collection') base.push(`- collect_by_skill skill="${s.name}"${about} → fields: ${(s.fields || []).map((f) => f.name).join(', ')}  [${s.urlPattern}]`);
      else if (Array.isArray(s.steps) && s.steps.length > 1) base.push(`- run_skill skill="${s.name}"${about} → workflow: ${s.steps.map((x) => `${x.name}(${x.action})`).join(' → ')}  [${s.urlPattern}]`);
      else base.push(`- use_skill skill="${s.name}" (${s.action})${about}  [${s.urlPattern}]`);
    }
    base.push('Prefer collect_by_skill (metric "items") when a matching collection skill exists for the data requested.');
    base.push('IMPORTANT: if a learned skill above covers what you need on a site (posting, searching, logging in…), USE IT (`run_skill`/`use_skill`) instead of hand-writing click/type phases — it was taught on that exact page and its selectors are known-good, while guessed button text often matches the wrong element.');
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
    const params = liftDescriptor((ph.params && typeof ph.params === 'object') ? { ...ph.params } : {});
    // Same validation the recovery path gets: a descriptor is model output.
    if ('descriptor' in params) {
      const d = cleanDescriptor(params.descriptor);
      if (d) params.descriptor = d; else delete params.descriptor;
    }
    clean.push({ tool: ph.tool, params });
  }
  let target = plan.target;
  if (!target || typeof target !== 'object' || !Number(target.count)) {
    const cbs = clean.find((p) => p.tool === 'collect_by_skill');
    const ct = clean.find((p) => p.tool === 'collect_text');
    const cl = clean.find((p) => p.tool === 'collect_links');
    const scr = clean.find((p) => p.tool === 'scroll');
    if (cbs && Number(cbs.params.target)) target = { metric: 'items', count: Number(cbs.params.target) };
    else if (ct && Number(ct.params.target)) target = { metric: 'texts', count: Number(ct.params.target) };
    else if (cl && Number(cl.params.target)) target = { metric: 'links', count: Number(cl.params.target) };
    else if (scr && Number(scr.params.times)) target = { metric: 'scrolls', count: Number(scr.params.times) };
    else {
      // Pure action task (click/hover/scroll only): target = number of such phases.
      const acts = clean.filter((p) => ['click', 'hover', 'scroll', 'type', 'press_key', 'generate_text', 'use_skill', 'run_skill', 'wait', 'screenshot', 'ask_user'].includes(p.tool)).length;
      if (acts) target = { metric: 'actions', count: acts };
      else return null;
    }
  }
  const metric = ['scrolls', 'items', 'texts', 'links', 'actions'].includes(target.metric) ? target.metric : 'texts';
  return { target: { metric, count: Number(target.count) }, phases: clean };
}

// Is this task a question about the world (answer lives on the web) rather than
// an instruction to operate a page the user already has in mind?
// Search engines are how you REACH the web, not a site to scrape. Naming one is
// a signal to research, and it must not be treated as "the user named a target
// site" (see namesASite).
function namesSearchEngine(goal) {
  return /\b(google|bing|duck ?duck ?go|duckduckgo|yahoo|ecosia|startpage|brave search)\b/i.test(String(goal || ''));
}

function isWebQuestion(goal) {
  const g = String(goal || '').trim();
  if (!g) return false;
  // Explicit page work — never a research question.
  if (/\b(click|type|scroll|hover|post|comment|publish|send|open the|log ?in|sign ?in|fill)\b/i.test(g)) return false;
  // "search 'X' on google and tell me here", "google who won …", "look up X and
  // let me know" — an explicit search-and-report request. It carries no question
  // word, so the checks below miss it; but a search verb aimed at a search
  // engine, or asking to be TOLD the result, is unmistakably a web question.
  // This is the case that got planned as collect_text with a guessed selector,
  // collected nothing, and repeated to the cap.
  if ((namesSearchEngine(g) || /\b(search|look ?up)\b/i.test(g))
      && /\b(search|look ?up|find|tell me|show me|let me know|give me|answer|who|what|when|where|winner|here)\b/i.test(g)) return true;
  return /^(what|who|when|where|why|how|which|is|are|was|were|does|do|did|can|should|will)\b/i.test(g)
    || /\?\s*$/.test(g)
    || /\b(price|cost|rate|worth|latest|current|today|now|news|trending|top \d+|best|cheapest|compare|comparison|analysis|analyz|research|summar(y|ise|ize)|explain|tell me about|find out|look up)\b/i.test(g);
}

// A goal that names a concrete site ("open example.com and …") is a direct
// instruction — respect the user's chosen destination, do not search instead.
// Pull the actual search query out of an instruction sentence. The user writes
// the MECHANICS ("create a new tab for google.com and search 'X', answer me from
// the ai overview"); the query is just X. Using the whole sentence as the query
// searched Google for the sentence and returned junk.
function searchQueryOf(goal) {
  const g = String(goal || '').trim();
  // A quoted span is the query, explicitly. This is the common, unambiguous case.
  const quoted = g.match(/["“”']([^"“”']{3,200})["“”']/);
  if (quoted) return quoted[1].trim();

  let s = g;
  // Strip a leading run of mechanics words ("create a new tab for google.com and
  // search for", "go to google and look up"…).
  s = s.replace(/^(?:\s*(?:please|can you|could you|create(?:\s+a)?\s+new\s+tab\s+for|open|go\s+to|navigate\s+to|on|in|for|using|the|a|and|then|search(?:ing)?(?:\s+for)?|google(?:\.com)?|bing|duckduckgo|look\s?up|find(?:\s+me)?|about|info(?:rmation)?)\b[\s,:.]*)+/i, '');
  // Strip a trailing report/mechanics clause ("… and tell me here", "… answer me
  // from the ai overview", "… let me know").
  s = s.replace(/[\s,.]*\b(?:and\s+)?(?:then\s+)?(?:tell|show|give|let\s+me\s+know|answer|report|summari[sz]e)\b.*$/i, '');
  s = s.replace(/[\s,.]*\b(?:from|in|on)\s+(?:the\s+)?(?:ai\s+overview|overview|google(?:'?s)?(?:\s+answer)?|search\s+results?|featured\s+snippet)\b.*$/i, '');
  s = s.replace(/[\s,.]*\b(?:here|to\s+me)\b[\s.]*$/i, '');
  s = s.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
  return s || g;
}

function namesASite(goal) {
  // A search engine is not a scrape TARGET — searching via it IS the research
  // pipeline. Strip search-engine hosts before deciding, so "search google.com
  // for X" no longer looks like "the user named a specific site to work on" and
  // no longer blocks the web-question rewrite. "facebook.com" still counts.
  const g = String(goal || '').replace(/\b(www\.)?(google|bing|duckduckgo|yahoo|ecosia|startpage)\.[a-z.]+/gi, ' ');
  return /\bhttps?:\/\/|\b[a-z0-9-]+\.(com|org|net|io|dev|co|ai|gov|edu)\b/i.test(g);
}

// Small local models often drop essential phases. Complete the plan
// deterministically so it can actually run: guarantee navigate -> collect ->
// (extract for details), keep a single navigate first, and fix scroll targets.
// Returns { plan, repaired } — repaired lists what was added, for the log.
function repairPlan(plan, goal = '', skills = []) {
  const repaired = [];
  let phases = plan.phases.slice();
  const has = (t) => phases.some((p) => p.tool === t);

  // A click/hover with no selector, no text and no descriptor has nothing to
  // aim at. It cannot succeed, but it FAILS SLOWLY — "no element for " four
  // times over 15s — and then drags the task into a recovery that starts
  // clicking whatever it can find. Drop it here, loudly: a phase that cannot
  // act is not an instruction being discarded, it is noise.
  const targetless = (p) => /^(click|hover)$/.test(p.tool)
    && !p.params?.selector && !p.params?.text && !p.params?.descriptor;
  if (phases.some(targetless)) {
    const n = phases.filter(targetless).length;
    phases = phases.filter((p) => !targetless(p));
    repaired.push(`dropped ${n} click/hover step(s) that had no target (no text, selector or descriptor)`);
  }

  // A question about the world can only be answered by reading the web. Small
  // models answer one anyway: they navigate to a site they remember and invent
  // a CSS selector for it, which collects nothing and then repeats until the
  // repeat cap. Rewrite that shape into the search pipeline.
  if (isWebQuestion(goal) && !has('collect_links') && !has('read_pages')
      && !phases.some((p) => /skill/.test(p.tool))
      && !/^(actions|scrolls)$/.test(plan.target.metric)
      && !namesASite(goal)) {
    // Search for the QUERY, not the whole instruction. The goal is a sentence of
    // mechanics ("create a new tab for google.com and search 'X', answer me from
    // ai overview"); using it verbatim as the query searched Google for that
    // whole sentence and produced junk sources. searchQueryOf pulls out "X".
    const query = searchQueryOf(goal);
    // "answer from the ai overview / quick answer" wants the answer off the
    // results page, NOT a 10-link crawl. We can't reliably scrape Google's
    // obfuscated AI-Overview box, but reading the top FEW results answers the
    // same question in a fraction of the time — which is the real intent.
    const wantsOverview = /\b(ai overview|overview|quick(ly)?|just|directly|featured snippet|short answer|google'?s? answer)\b/i.test(goal);
    const count = wantsOverview ? 3 : 10;
    plan = { ...plan, target: { metric: 'links', count } };
    phases = [
      { tool: 'navigate', params: { url: `https://www.google.com/search?q=${encodeURIComponent(query)}` } },
      { tool: 'collect_links', params: { target: count } },
      { tool: 'read_pages', params: { target: count } },
      { tool: 'synthesize', params: { question: query } },
    ];
    repaired.push(wantsOverview
      ? `rewrote into a quick web search for "${query}" (top ${count})`
      : `rewrote guessed-site plan into a web search for "${query}"`);
  }
  // A plan that gathers search results IS a "links" task whatever the model
  // called the metric. Without this the target is checked against the wrong
  // counter and a search returning fewer hits than asked never completes.
  if (has('collect_links') && plan.target.metric !== 'links') {
    plan = { ...plan, target: { ...plan.target, metric: 'links' } };
    repaired.push('target metric set to "links"');
  }
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
  } else if (metric === 'links') {
    // Web-search link gathering: ensure a collect_links phase with a target.
    if (!has('collect_links')) {
      phases.push({ tool: 'collect_links', params: { target: plan.target.count } });
      repaired.push('added collect_links');
    }
    for (const p of phases) if (p.tool === 'collect_links' && !Number(p.params.target)) p.params.target = plan.target.count;
  } else if (metric === 'actions') {
    // Pure click/hover/scroll task — nothing to auto-complete.
  }

  // Reading pages is only useful if something summarizes them — small models
  // routinely forget the final step, so guarantee it. It must land right after
  // the LAST read_pages: appending it would drop it into a later segment (the
  // publish site), where it would summarize after the post was already written.
  if (has('read_pages') && !has('synthesize')) {
    let at = -1;
    for (let i = phases.length - 1; i >= 0; i--) if (phases[i].tool === 'read_pages') { at = i; break; }
    phases.splice(at + 1, 0, { tool: 'synthesize', params: {} });
    repaired.push('added synthesize');
  }

  // Research must FINISH before anything acts on its output. Models routinely
  // emit the posting step in the middle of the research block, and same-rank
  // sorting would keep it there — so the post gets composed from nothing.
  if (has('read_pages') || has('synthesize')) {
    const RESEARCH = ['collect_links', 'read_pages', 'synthesize'];
    const lead = phases[0]?.tool === 'navigate' ? [phases[0]] : [];
    const rest = lead.length ? phases.slice(1) : phases;
    const research = rest.filter((p) => RESEARCH.includes(p.tool));
    const after = rest.filter((p) => !RESEARCH.includes(p.tool));
    if (research.length && after.length && rest.indexOf(after[0]) < rest.lastIndexOf(research[research.length - 1])) {
      repaired.push('moved the research phases ahead of the steps that use them');
    }
    phases = [...lead, ...research, ...after];
  }

  // A skill only works on the site it was taught on. If the plan calls one
  // without navigating there first, it runs against whatever page is open —
  // the "No skill X for google.com" failure. Insert the missing navigate.
  phases = insertSkillNavigations(phases, skills, repaired);

  phases = orderPhases(phases);

  // Publishing is outward-facing and irreversible. Unless the user explicitly
  // opted out, confirm before the step that puts it live.
  // "scroll for 5 seconds" is a DURATION, not a step count. Models reliably
  // emit times:5 (and sometimes delay:1, which scrolls 5 times in 5ms).
  const secs = String(goal || '').match(/\b(?:for\s+)?(\d{1,3})\s*(seconds?|secs?|s)\b/i);
  if (secs && phases.some((p) => p.tool === 'scroll')) {
    for (const p of phases) {
      if (p.tool !== 'scroll') continue;
      if (!p.params.seconds) {
        p.params = { ...p.params, seconds: Number(secs[1]) };
        delete p.params.times;
        repaired.push(`scroll set to ${secs[1]}s (a duration, not a step count)`);
      }
    }
  }

  // "close the tab when you're done" needs a close_tab phase; models omit the
  // step entirely and the task then reports success having never closed it.
  if (/\b(close|shut)\b[^.]{0,30}\b(tab|window|page)\b/i.test(goal || '') && !phases.some((p) => p.tool === 'close_tab')) {
    phases.push({ tool: 'close_tab', params: {} });
    repaired.push('added the close_tab step the plan was missing');
  }

  // If the user wants the tab CLOSED afterwards, it must be a tab we opened —
  // silently reusing (and then closing) a tab of theirs is destructive.
  if (phases.some((p) => p.tool === 'close_tab')) {
    const nav = phases.find((p) => p.tool === 'navigate');
    if (nav && !nav.params.newTab) {
      nav.params = { ...nav.params, newTab: true };
      repaired.push('open in a NEW tab, since the task closes it afterwards');
    }
  }

  // A click that opens a composer is followed immediately by typing, but the
  // dialog needs a moment to render. Without the pause the text lands in
  // whatever field is already on the page (a feed comment box, in practice).
  for (let i = phases.length - 2; i >= 0; i--) {
    if (phases[i].tool !== 'click') continue;
    if (!['type', 'generate_text'].includes(phases[i + 1].tool)) continue;
    phases.splice(i + 1, 0, { tool: 'wait', params: { seconds: 2 } });
    repaired.push('added a short wait for the composer to open');
  }

  // Models reliably compose the post and then forget to submit it. If the user
  // asked for it to be PUBLISHED and the plan only writes text, add the submit
  // click. It is always gated by the confirmation added below, so a wrong guess
  // is declined rather than posted.
  if (/\b(post|publish|share|tweet|send)\b/i.test(goal || '')
      && phases.some((p) => ['generate_text', 'type'].includes(p.tool))
      && !phases.some(isPublishPhase)) {
    // Match the button the target surface actually shows.
    const label = /\b(send|message|dm|reply)\b/i.test(goal || '') ? 'Send'
      : /\b(share)\b/i.test(goal || '') ? 'Share' : 'Post';
    phases.push({ tool: 'click', params: { text: label } });
    repaired.push(`added the missing "${label}" click`);
  }

  // Confirmation is OPT-IN. The agent acts on the user's own accounts; if they
  // asked it to post, it posts. A confirmation is only inserted when they asked
  // to be asked ("confirm before posting", "let me review it first"). When they
  // do ask, EVERY publish step gets its own — a plan that posts to two sites
  // must not slip the second one through on the first approval.
  if (WANTS_APPROVAL.test(goal || '')) {
    let added = 0;
    for (let i = phases.length - 1; i >= 0; i--) {
      if (!isPublishPhase(phases[i])) continue;
      if (i > 0 && phases[i - 1].tool === 'ask_user') continue; // already guarded
      const site = siteOf(phases, i);
      phases.splice(i, 0, {
        tool: 'ask_user',
        params: { question: `Ready to publish this publicly${site ? ` on ${site}` : ''}. Post it?` },
      });
      added++;
    }
    if (added) repaired.push(`added ${added} confirmation(s) before publishing`);
  }

  return { plan: { target: plan.target, phases }, repaired };
}

// Did the user ask to approve before the agent acts? Only then does the planner
// insert an ask_user gate — otherwise "post it on my feed" means post it.
const WANTS_APPROVAL =
  /\b(ask|confirm|check|verify|approve|approval|permission|review|show)\b[^.;]{0,40}\b(me|first|before|with me)\b|\bbefore (posting|publishing|you post|sending)\b|\blet me (see|review|approve|check)\b|\bdon'?t post (it )?(until|before)\b/i;

// Relative order of tools WITHIN one site visit. Cross-site order is carried by
// the navigate phases themselves, so this only sorts inside a segment.
const PHASE_ORDER = {
  scroll: 1, click: 1, hover: 1, type: 1, press_key: 1, wait: 1, screenshot: 1,
  ask_user: 1, generate_text: 1, use_skill: 1, run_skill: 1, collect_by_skill: 1,
  collect_text: 1, collect_links: 1, read_pages: 2, ai_verify: 3, synthesize: 4,
  close_tab: 8, // always last in its segment — nothing can act on a closed tab
};

// A plan is a SEQUENCE OF SITE VISITS: each `navigate` opens a segment, and the
// phases after it act on that site. Sorting globally (the old behaviour) moved
// actions across sites — "research then post" ran the posting steps on the
// search page. Sort only within a segment, and keep every navigate.
function orderPhases(phases) {
  const segments = [];
  let cur = { nav: null, rest: [] };
  for (const p of phases) {
    if (p.tool === 'navigate') {
      if (cur.nav || cur.rest.length) segments.push(cur);
      cur = { nav: p, rest: [] };
    } else cur.rest.push(p);
  }
  segments.push(cur);

  const out = [];
  for (const seg of segments) {
    // Re-visiting the site we are already on is a wasted page load.
    const prevNav = [...out].reverse().find((p) => p.tool === 'navigate');
    if (seg.nav && !(prevNav && sameTarget(prevNav.params?.url, seg.nav.params?.url))) out.push(seg.nav);
    // Array.prototype.sort is stable, so same-rank phases keep the model's
    // intended order (click composer → type → click Post).
    out.push(...seg.rest.sort((a, b) => (PHASE_ORDER[a.tool] ?? 9) - (PHASE_ORDER[b.tool] ?? 9)));
  }
  return out;
}

function sameTarget(a, b) {
  try {
    const x = new URL(a), y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname && x.search === y.search;
  } catch { return false; }
}

// Ensure every skill phase is preceded by a navigate to the host that skill was
// taught on. Skills are host-scoped, so calling one on the wrong site fails with
// "No skill <name> for <host>" — and small models forget the hop constantly.
function insertSkillNavigations(phases, skills, repaired) {
  if (!Array.isArray(skills) || !skills.length) return phases;
  const byName = new Map(skills.map((s) => [String(s.name || '').toLowerCase(), s]));
  const bare = (h) => String(h || '').replace(/^www\./, '').toLowerCase();
  const out = [];
  let curHost = '';
  for (const p of phases) {
    if (p.tool === 'navigate') {
      try { curHost = bare(new URL(p.params?.url).hostname); } catch { curHost = ''; }
      out.push(p);
      continue;
    }
    if (['use_skill', 'run_skill', 'collect_by_skill'].includes(p.tool)) {
      const sk = byName.get(String(p.params?.skill || '').toLowerCase());
      const host = bare(sk?.host);
      if (host && host !== curHost) {
        out.push({ tool: 'navigate', params: { url: `https://${host}` } });
        repaired.push(`added navigate to ${host} for skill "${sk.name}"`);
        curHost = host;
      }
    }
    out.push(p);
  }
  return out;
}

// Host of the navigate that opened the segment containing phase `i` — so a
// confirmation can name the site it is about to post to.
function siteOf(phases, i) {
  for (let k = i; k >= 0; k--) {
    if (phases[k].tool !== 'navigate') continue;
    try { return new URL(phases[k].params?.url).hostname.replace(/^www\./, ''); } catch { return ''; }
  }
  return '';
}

// Does this phase publish something outward (post / tweet / share / send)?
function isPublishPhase(p) {
  const words = /\b(post|publish|share|tweet|send|submit)\b/i;
  if (p.tool === 'click') return words.test(String(p.params?.text || ''));
  if (p.tool === 'use_skill' || p.tool === 'run_skill') return words.test(String(p.params?.skill || ''));
  return false;
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
// Clauses that describe something to WRITE, not something to collect. "prepare
// a facebook post" was being read as "collect 1 item", capping the research at
// a single source. Drop those clauses before counting.
const COMPOSE_CLAUSE = /\b(prepare|write|create|compose|draft|make|generate|publish)\b[^.;,]*/gi;

function requestedCount(goal) {
  const g = ' ' + String(goal || '').replace(COMPOSE_CLAUSE, ' ').toLowerCase() + ' ';
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

// Installed models with their capabilities. /api/show is one round trip PER
// model, so the result is cached briefly — /models, model resolution and the
// vision lookup all hit this on nearly every request otherwise.
let CAPS_CACHE = { at: 0, list: [] };
async function installedModels({ maxAgeMs = 60000 } = {}) {
  if (Date.now() - CAPS_CACHE.at < maxAgeMs && CAPS_CACHE.list.length) return CAPS_CACHE.list;
  const list = (await (await fetch(`${OLLAMA_URL}/api/tags`)).json()).models || [];
  const out = [];
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
    out.push({ name: m.name, size: m.size, paramSize: m.details?.parameter_size || '', caps: Array.isArray(caps) ? caps : [] });
  }
  CAPS_CACHE = { at: Date.now(), list: out };
  return out;
}

// ---- Ollama proxy ----
// Default: tool-calling models (the only ones that can run a plan).
// ?capability=vision lists image-capable models instead — those usually do NOT
// have the "tools" capability, so they are invisible without this.
app.get('/models', async (req, res) => {
  try {
    const want = String(req.query.capability || 'tools');
    const models = (await installedModels())
      .filter((m) => m.caps.includes(want))
      .map(({ name, size, paramSize }) => ({ name, size, paramSize }));
    res.json({ ok: true, models });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'Ollama not reachable at ' + OLLAMA_URL, models: [] });
  }
});

// Pick a model that can actually see images: the session's own model if it is
// vision-capable, otherwise the largest installed vision model. null = none.
async function visionModel(current) {
  let list = [];
  try { list = await installedModels(); } catch { return null; }
  const vision = list.filter((m) => m.caps.includes('vision'));
  if (!vision.length) return null;
  if (current && vision.some((m) => m.name === current)) return current;
  return vision.sort((a, b) => (b.size || 0) - (a.size || 0))[0].name;
}

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
  // The extension's standing poll carries ?executor=1 — that is our heartbeat
  // that a browser executor (an open Chrome) is present. The desktop app also
  // lists tasks here, WITHOUT the flag, so it never counts as an executor.
  if (req.query.executor) lastExecutorSeenAt = Date.now();
  const tasks = await tasksColl().find({}, { projection: { _id: 0 } })
    .sort({ createdAt: -1 }).limit(50).toArray();
  res.json({ ok: true, tasks });
});

app.get('/tasks/:id', async (req, res) => {
  let task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  // Self-heal a tab-listing round that no executor will ever run — e.g. Chrome
  // was closed after it was dispatched (or the round predates this guard). If it
  // is still running with nothing done and we haven't heard from an executor in
  // a while, answer honestly instead of spinning forever. The filter pins
  // status:'running' so concurrent polls can't double-resolve it.
  if (task.status === 'running' && task.plan?.quiet
      && Array.isArray(task.plan?.phases) && task.plan.phases.length === 1
      && task.plan.phases[0]?.tool === 'list_tabs'
      && !(task.actions > 0) && !executorOnline()) {
    const r = task.round || 0;
    const upd = await tasksColl().findOneAndUpdate(
      { taskId: task.taskId, status: 'running' },
      {
        $set: { status: 'done', finishedAt: nowIso(), updatedAt: nowIso() },
        $push: {
          chat: { role: 'assistant', text: CHROME_NOT_OPEN_REPLY, at: nowIso(), round: r },
          events: { at: nowIso(), kind: 'obs', msg: 'No browser executor connected — resolved the tab question without listing tabs.', round: r },
        },
      },
      { returnDocument: 'after', projection: { _id: 0 } }
    );
    if (upd?.value || upd) task = upd.value || upd;
  }
  res.json({ ok: true, task });
});

// ============================= Projects ====================================
// A project groups sessions AND carries default settings its tasks inherit
// (model, skills, system prompt, schemas, workdir). Precedence at task
// creation: an explicit request field > the project default > the global
// default. Backend-authoritative (matches tasks/skills), keyed by a stable
// projectId — names get renamed and collide.
const projectsColl = () => collFor('projects');

// Whitelist the inheritable settings. Anything not here is dropped, so a client
// cannot smuggle arbitrary fields into a project's defaults.
function cleanProjectSettings(s) {
  const o = (s && typeof s === 'object') ? s : {};
  const out = {};
  if (typeof o.model === 'string') out.model = o.model.slice(0, 120);
  if (Array.isArray(o.skillIds)) out.skillIds = o.skillIds.map(String).slice(0, 100);
  if (typeof o.promptId === 'string') out.promptId = o.promptId || null;
  if (Array.isArray(o.schemaIds)) out.schemaIds = o.schemaIds.map(String).slice(0, 50);
  // The project's own "dynamic" system prompt — free text applied to its tasks.
  if (typeof o.systemPrompt === 'string') out.systemPrompt = o.systemPrompt.slice(0, 8000);
  // Project-scoped launchable apps (Phase 4): [{ appId, profile }]. appId must be
  // a known launchable app; profile is a free string (a Chrome profile NAME).
  if (Array.isArray(o.launchApps)) {
    out.launchApps = o.launchApps
      .filter((a) => a && typeof a === 'object' && LAUNCH_APP_IDS.has(String(a.appId || '').toLowerCase()))
      .slice(0, 20)
      .map((a) => ({ appId: String(a.appId).toLowerCase(), profile: String(a.profile || '').slice(0, 60) }));
  }
  return out;
}

app.get('/projects', async (_req, res) => {
  const projects = await projectsColl().find({}, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray();
  res.json({ ok: true, projects });
});

app.get('/projects/:id', async (req, res) => {
  const project = await projectsColl().findOne({ projectId: req.params.id }, { projection: { _id: 0 } });
  if (!project) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, project });
});

app.post('/projects', async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ ok: false, error: 'name required' });
  const project = {
    projectId: crypto.randomUUID(),
    name: String(b.name).slice(0, 120),
    dir: String(b.dir || ''),
    settings: cleanProjectSettings(b.settings),
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  await projectsColl().insertOne({ ...project });
  res.json({ ok: true, project });
});

app.patch('/projects/:id', async (req, res) => {
  const b = req.body || {};
  const set = { updatedAt: nowIso() };
  if (typeof b.name === 'string' && b.name.trim()) set.name = b.name.slice(0, 120);
  if (typeof b.dir === 'string') set.dir = b.dir;
  // settings is MERGED, not replaced, so a PATCH of one field keeps the rest.
  if (b.settings && typeof b.settings === 'object') {
    const cur = await projectsColl().findOne({ projectId: req.params.id }, { projection: { _id: 0, settings: 1 } });
    set.settings = { ...(cur?.settings || {}), ...cleanProjectSettings(b.settings) };
  }
  const doc = await projectsColl().findOneAndUpdate(
    { projectId: req.params.id }, { $set: set },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  const project = doc?.value || doc;
  if (!project) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, project });
});

app.delete('/projects/:id', async (req, res) => {
  await projectsColl().deleteOne({ projectId: req.params.id });
  // Tasks keep their {name,dir} snapshot, so deleting a project does not orphan
  // its history — the sessions stay grouped by the snapshot.
  res.json({ ok: true });
});

// ============================ DAILY TODOS ====================================
// Routines → per-day todo lists → items. Plan:
// plans/partially-done/daily-todos-scheduler.md. Phases 1-2 (build the list +
// run items by hand) are here; the clock is phase 3.
//
// The engine is GENERAL: an item is "one instruction the agent runs". It never
// knows what the work is — `POST /tasks` already routes on the instruction text
// (host command / launch / question / browse), so a routine can mix all of them.
const routinesColl = () => collFor('routines');
const todoListsColl = () => collFor('todolists');

// Run an item by POSTing to our OWN /tasks. Deliberately a self-call rather than
// an extracted helper: every guard that matters (placeholder refusal, publish
// verification, lessons, project inheritance, launch/host routing) lives on that
// path, and a second creation path would drift from it — and be the one that
// does damage. Loopback is auth-exempt; the caller's token is forwarded anyway
// in case AUTH_ENFORCE_LOCAL is on.
async function createTaskForItem(item, ctx = {}) {
  const body = {
    goal: item.instruction,
    model: ctx.model || undefined,
    useSkills: (item.skillIds && item.skillIds.length) ? item.skillIds : undefined,
    project: ctx.projectId ? { projectId: ctx.projectId } : undefined,
  };
  const r = await fetch(`http://127.0.0.1:${PORT}/tasks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(ctx.auth ? { authorization: ctx.auth } : {}) },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j || !j.task) throw new Error(j?.error || `task creation failed (${r.status})`);
  return j.task;
}

// Turn a parsed `/todo` or `/routine` into a pending proposal on the session,
// with the assistant turn that explains it. One helper, used by BOTH entry
// points — routing that lives at only one of them is a bug this repo has
// already shipped twice (the tab question, the launch branch).
async function pushAppProposal(task, cmd, round) {
  const { summary, detail } = appCommands.describeCommand(cmd);
  const proposal = {
    proposalId: crypto.randomUUID(),
    kind: cmd.kind,
    summary, detail,
    payload: { name: cmd.name, instruction: cmd.instruction, projectId: task.project?.projectId || null },
    status: 'pending', at: nowIso(),
  };
  await tasksColl().updateOne({ taskId: task.taskId }, {
    $push: {
      proposals: proposal,
      chat: { role: 'assistant', text: `${summary}\n\n${detail}`, at: nowIso(), round },
      events: { at: nowIso(), kind: 'think', msg: `Proposed: ${summary} (waiting for your approval)`, round, meta: { proposal: cmd.kind } },
    },
    $set: { updatedAt: nowIso() },
  });
  return proposal;
}

// Call one of our own endpoints over loopback. Same reasoning as
// `createTaskForItem`: reuse the real path (with its claim, its executor check
// and its guards) instead of a second copy that can drift.
async function selfPost(path, body, auth) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body || {}),
    });
    return await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// Today's catch-all list for todos created from chat. One per day, created on
// first use — so "/todo …" three times in a morning builds one list, not three.
async function chatTodoList(projectId = null) {
  const date = todos.localDate();
  const existing = await todoListsColl().findOne({ source: 'chat', date }, { projection: { _id: 0 } });
  if (existing) return existing;
  const list = {
    listId: crypto.randomUUID(), routineId: null, occurrenceKey: null,
    projectId: projectId || null, source: 'chat', date,
    title: `From chat — ${date}`,
    items: [], autoRun: false, note: '',
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  await todoListsColl().insertOne({ ...list });
  return list;
}

// A browser item cannot run with Chrome closed — creating the task anyway is
// what left a round hung "running" forever (PROJECT_MEMORY 2026-07-22). Host
// commands, launches and questions need no executor, so only browse work is
// gated. Detection mirrors the routing in POST /tasks.
function needsExecutor(instruction) {
  const g = String(instruction || '');
  if (HOST_PREFIX_RX.test(g)) return false;
  if (detectLaunch(g)) return false;
  return true;
}

// Mirror each running item's task status onto the item, then — if the list is in
// "Run all" mode — start the next one. This is what makes "Run all" SEQUENTIAL
// without a clock: nothing advances until the current item reaches a terminal
// state. It runs on GET, which the desktop polls, so the chain is driven by the
// UI watching it. Phase 3's tick loop will call the same function.
async function reconcileList(list, ctx = {}) {
  if (!list || !Array.isArray(list.items)) return list;
  let changed = false;
  // The model belongs to the RUN, not to whoever happens to be polling: the
  // request that pressed "Run all" is long gone by the time item 3 starts, and
  // phase 3's tick loop has no request context at all. So it is stamped on the
  // list when a run starts and read back here. (Without this, every item after
  // the first died with "model required".)
  ctx = { ...ctx, model: ctx.model || list.model || '' };

  const runningIds = list.items.filter((i) => i.taskId && (i.status === 'running' || i.status === 'queued')).map((i) => i.taskId);
  if (runningIds.length) {
    const tasks = await tasksColl().find({ taskId: { $in: runningIds } }, { projection: { _id: 0, taskId: 1, status: 1 } }).toArray();
    const byId = new Map(tasks.map((t) => [t.taskId, t.status]));
    for (const it of list.items) {
      if (!it.taskId || !byId.has(it.taskId)) continue;
      const next = todos.itemStatusFromTask(byId.get(it.taskId));
      if (!next || next === it.status) continue;
      it.status = next;
      if (['done', 'failed', 'skipped'].includes(next)) it.finishedAt = nowIso();
      changed = true;
    }
  }

  if (list.autoRun) {
    const busy = list.items.some((i) => i.status === 'running' || i.status === 'queued');
    if (!busy) {
      // Auto-advance takes only untouched items: a `failed` one is NOT retried
      // automatically (its side effect may already have fired — the RETRY RULE),
      // and a `skipped` one was a decision.
      const next = list.items.find((i) => i.status === 'todo');
      if (!next) { list.autoRun = false; changed = true; }
      else if (needsExecutor(next.instruction) && !executorOnline()) {
        // Wait rather than fail: Chrome may come back. The list stays in
        // autoRun, so the next poll retries.
        if (next.note !== 'Waiting for Chrome to be open…') { next.note = 'Waiting for Chrome to be open…'; changed = true; }
      } else {
        try {
          const task = await createTaskForItem(next, ctx);
          Object.assign(next, { status: 'running', taskId: task.taskId, startedAt: nowIso(), note: '' });
        } catch (e) {
          Object.assign(next, { status: 'failed', note: `Could not start: ${e.message || e}`, finishedAt: nowIso() });
          list.autoRun = false;      // stop the chain rather than fail every item
        }
        changed = true;
      }
    }
  }

  if (changed) {
    await todoListsColl().updateOne(
      { listId: list.listId },
      { $set: { items: list.items, autoRun: !!list.autoRun, updatedAt: nowIso() } },
    );
    list.updatedAt = nowIso();
  }
  return list;
}

app.get('/routines', async (_req, res) => {
  const routines = await routinesColl().find({}, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray();
  res.json({ ok: true, routines });
});

app.get('/routines/:id', async (req, res) => {
  const routine = await routinesColl().findOne({ routineId: req.params.id }, { projection: { _id: 0 } });
  if (!routine) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, routine });
});

app.post('/routines', async (req, res) => {
  const routine = {
    routineId: crypto.randomUUID(),
    ...todos.cleanRoutine(req.body),
    lastMaterialisedDate: null,
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  await routinesColl().insertOne({ ...routine });
  res.json({ ok: true, routine });
});

app.patch('/routines/:id', async (req, res) => {
  const prev = await routinesColl().findOne({ routineId: req.params.id }, { projection: { _id: 0 } });
  if (!prev) return res.status(404).json({ ok: false, error: 'not found' });
  const set = { ...todos.cleanRoutine(req.body, prev), updatedAt: nowIso() };
  const doc = await routinesColl().findOneAndUpdate(
    { routineId: req.params.id }, { $set: set },
    { returnDocument: 'after', projection: { _id: 0 } },
  );
  res.json({ ok: true, routine: doc?.value || doc });
});

app.delete('/routines/:id', async (req, res) => {
  await routinesColl().deleteOne({ routineId: req.params.id });
  // Lists keep their routineId so past days stay readable; they are history.
  res.json({ ok: true });
});

// Build one occurrence's list. Idempotent by (routineId, occurrenceKey): asking
// twice returns the SAME list rather than a second one — the unique index makes
// a duplicate impossible even if two callers race. A daily routine has one
// occurrence per date; an `interval` routine has one per fire.
app.post('/routines/:id/materialise', async (req, res) => {
  const routine = await routinesColl().findOne({ routineId: req.params.id }, { projection: { _id: 0 } });
  if (!routine) return res.status(404).json({ ok: false, error: 'not found' });
  const now = new Date();
  const date = todos.DATE_RX.test(req.body?.date || '') ? req.body.date : todos.localDate(now);
  const key = req.body?.date ? date : todos.occurrenceKey(routine, now);

  const existing = await todoListsColl().findOne({ routineId: routine.routineId, occurrenceKey: key }, { projection: { _id: 0 } });
  if (existing) return res.json({ ok: true, list: existing, already: true });

  const { list, usedRowIds } = todos.buildList(routine, { now, date, occurrenceKey: key });
  if (!list.items.length) return res.status(400).json({ ok: false, error: 'nothing to build — the routine has no enabled templates' });
  list.autoRun = false;
  try {
    await todoListsColl().insertOne({ ...list });
  } catch (e) {
    if (e && e.code === 11000) {                 // raced — return the winner
      const won = await todoListsColl().findOne({ routineId: routine.routineId, occurrenceKey: key }, { projection: { _id: 0 } });
      return res.json({ ok: true, list: won, already: true });
    }
    throw e;
  }
  // Rotation bookkeeping: stamp the rows this occurrence consumed so the next
  // one picks different ones. Done AFTER the insert, so a failed build never
  // burns inputs. `lastFiredAt` is what paces an interval routine.
  const rows = (routine.inputs?.rows || []).map((r) => (
    usedRowIds.includes(r.id) ? { ...r, lastUsedAt: nowIso(), useCount: (r.useCount || 0) + 1 } : r
  ));
  await routinesColl().updateOne(
    { routineId: routine.routineId },
    { $set: { 'inputs.rows': rows, lastMaterialisedDate: date, lastFiredAt: nowIso(), updatedAt: nowIso() } },
  );
  res.json({ ok: true, list });
});

// "Run it now" for a whole routine, whatever its trigger — the test button.
// Builds this occurrence's list if it does not exist yet (reusing it if it
// does), then starts it. A `schedule` routine can therefore be proven by hand
// before it is ever left to fire on its own, which is the only responsible way
// to turn one on.
app.post('/routines/:id/run-now', async (req, res) => {
  const routine = await routinesColl().findOne({ routineId: req.params.id }, { projection: { _id: 0 } });
  if (!routine) return res.status(404).json({ ok: false, error: 'not found' });
  const now = new Date();
  const key = todos.occurrenceKey(routine, now);
  let list = await todoListsColl().findOne({ routineId: routine.routineId, occurrenceKey: key }, { projection: { _id: 0 } });

  if (!list) {
    const built = todos.buildList(routine, { now, occurrenceKey: key });
    if (!built.list.items.length) return res.status(400).json({ ok: false, error: 'nothing to run — the routine has no enabled templates' });
    built.list.autoRun = false;
    try { await todoListsColl().insertOne({ ...built.list }); list = built.list; }
    catch (e) {
      if (e && e.code !== 11000) throw e;
      list = await todoListsColl().findOne({ routineId: routine.routineId, occurrenceKey: key }, { projection: { _id: 0 } });
    }
    const rows = (routine.inputs?.rows || []).map((r) => (
      built.usedRowIds.includes(r.id) ? { ...r, lastUsedAt: nowIso(), useCount: (r.useCount || 0) + 1 } : r
    ));
    await routinesColl().updateOne({ routineId: routine.routineId },
      { $set: { 'inputs.rows': rows, lastMaterialisedDate: todos.localDate(now), lastFiredAt: nowIso(), updatedAt: nowIso() } });
  }

  // A test press on a finished list should actually re-run it, not report
  // "nothing to do".
  if (req.body?.reset && !list.items.some((i) => ['running', 'queued'].includes(i.status))) {
    list.items = todos.resetItems(list.items, req.body.reset === true ? 'all' : String(req.body.reset));
  }
  const runnable = list.items.filter((i) => i.status === 'todo');
  if (!runnable.length) return res.json({ ok: true, list, started: 0, note: 'Nothing left to run — reset the list to run it again.' });

  // scope 'first' runs a single item (the cheap way to test a routine without
  // firing the whole day's work); default runs the list sequentially.
  const runModel = String(req.body?.model || list.model || '');
  await todoListsColl().updateOne({ listId: list.listId }, { $set: { autoRun: true, model: runModel, items: list.items, updatedAt: nowIso() } });
  list.autoRun = true; list.model = runModel;   // 'first' clears it again below
  const ctx = { projectId: list.projectId, model: runModel, auth: req.headers.authorization };
  const after = await reconcileList(list, ctx);
  if (req.body?.scope === 'first') {
    await todoListsColl().updateOne({ listId: list.listId }, { $set: { autoRun: false, updatedAt: nowIso() } });
    after.autoRun = false;
  }
  res.json({ ok: true, list: after, started: after.items.filter((i) => i.status === 'running').length });
});

app.get('/todolists', async (req, res) => {
  const q = {};
  if (req.query.date) q.date = String(req.query.date);
  if (req.query.routineId) q.routineId = String(req.query.routineId);
  const lists = await todoListsColl().find(q, { projection: { _id: 0 } })
    .sort({ date: -1, createdAt: -1 }).limit(Math.min(60, Number(req.query.limit) || 30)).toArray();
  res.json({ ok: true, lists });
});

app.get('/todolists/:id', async (req, res) => {
  const list = await todoListsColl().findOne({ listId: req.params.id }, { projection: { _id: 0 } });
  if (!list) return res.status(404).json({ ok: false, error: 'not found' });
  const ctx = { projectId: list.projectId, model: req.query.model || '', auth: req.headers.authorization };
  res.json({ ok: true, list: await reconcileList(list, ctx) });
});

// Ad-hoc list — a todo list with no routine behind it (the `manual` mode).
app.post('/todolists', async (req, res) => {
  const b = req.body || {};
  const now = new Date();
  const items = (Array.isArray(b.items) ? b.items : [])
    .map((i) => {
      const instruction = String(i?.instruction || '').trim().slice(0, 8000);
      if (!instruction) return null;
      return {
        itemId: crypto.randomUUID(), templateId: null,
        label: String(i.label || '').slice(0, 80) || instruction.slice(0, 60),
        instruction, inputId: null, values: {}, mode: i.mode === 'auto' ? 'auto' : 'draft',
        skillIds: Array.isArray(i.skillIds) ? i.skillIds.slice(0, 20) : [],
        runAt: null, status: 'todo', taskId: null, startedAt: null, finishedAt: null,
        note: '', reason: '', missing: todos.unfilledPlaceholders(instruction),
      };
    }).filter(Boolean).slice(0, 200);
  if (!items.length) return res.status(400).json({ ok: false, error: 'at least one item with an instruction is required' });
  const list = {
    listId: crypto.randomUUID(), routineId: null,
    projectId: b.projectId ? String(b.projectId) : null,
    date: todos.DATE_RX.test(b.date || '') ? b.date : todos.localDate(now),
    occurrenceKey: null,                       // ad-hoc lists have no occurrence
    title: String(b.title || 'Todo list').slice(0, 120),
    items, autoRun: false, note: '',
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  await todoListsColl().insertOne({ ...list });
  res.json({ ok: true, list });
});

app.delete('/todolists/:id', async (req, res) => {
  await todoListsColl().deleteOne({ listId: req.params.id });
  res.json({ ok: true });
});

// Re-run a list that already ran — the "my computer was off at 09:00" case.
// A missed or finished list is NEVER cleaned up behind the user's back: it stays
// there, and this puts its items back to `todo` so ▶ / Run all work again, right
// up until the routine's next occurrence builds a fresh list.
// `scope`: 'failed' (default — retry what broke) | 'unfinished' | 'all'.
app.post('/todolists/:id/reset', async (req, res) => {
  const list = await todoListsColl().findOne({ listId: req.params.id }, { projection: { _id: 0 } });
  if (!list) return res.status(404).json({ ok: false, error: 'not found' });
  if ((list.items || []).some((i) => i.status === 'running' || i.status === 'queued')) {
    return res.status(409).json({ ok: false, error: 'an item is still running — stop it first' });
  }
  const scope = ['failed', 'unfinished', 'all'].includes(req.body?.scope) ? req.body.scope : 'failed';
  const items = todos.resetItems(list.items, scope);
  const changed = items.filter((it, i) => it.status !== list.items[i].status).length;
  await todoListsColl().updateOne({ listId: list.listId }, { $set: { items, autoRun: false, updatedAt: nowIso() } });
  res.json({ ok: true, list: { ...list, items, autoRun: false }, reset: changed });
});

// Edit one item: its text, its label, its time, or reset it back to `todo`.
app.patch('/todolists/:id/items/:itemId', async (req, res) => {
  const b = req.body || {};
  const list = await todoListsColl().findOne({ listId: req.params.id }, { projection: { _id: 0 } });
  if (!list) return res.status(404).json({ ok: false, error: 'not found' });
  const it = (list.items || []).find((i) => i.itemId === req.params.itemId);
  if (!it) return res.status(404).json({ ok: false, error: 'item not found' });
  if (it.status === 'running' || it.status === 'queued') return res.status(409).json({ ok: false, error: 'item is running' });

  if (typeof b.instruction === 'string' && b.instruction.trim()) {
    it.instruction = b.instruction.trim().slice(0, 8000);
    it.missing = todos.unfilledPlaceholders(it.instruction);
  }
  if (typeof b.label === 'string' && b.label.trim()) it.label = b.label.trim().slice(0, 80);
  if (typeof b.note === 'string') it.note = b.note.slice(0, 500);
  if (b.runAt === null || todos.HHMM_RX.test(b.runAt || '')) it.runAt = b.runAt || null;
  // Reset for a retry — the run endpoint is what actually starts it, so this
  // never fires a side effect on its own.
  if (b.status === 'todo') Object.assign(it, { status: 'todo', taskId: null, startedAt: null, finishedAt: null, note: '' });

  await todoListsColl().updateOne({ listId: list.listId }, { $set: { items: list.items, updatedAt: nowIso() } });
  res.json({ ok: true, list });
});

app.post('/todolists/:id/items/:itemId/skip', async (req, res) => {
  const r = await todoListsColl().findOneAndUpdate(
    { listId: req.params.id, items: { $elemMatch: { itemId: req.params.itemId, status: { $in: ['todo', 'failed'] } } } },
    { $set: { 'items.$[it].status': 'skipped', 'items.$[it].finishedAt': nowIso(), 'items.$[it].reason': String(req.body?.reason || 'Skipped by hand').slice(0, 200), updatedAt: nowIso() } },
    { arrayFilters: [{ 'it.itemId': req.params.itemId }], returnDocument: 'after', projection: { _id: 0 } },
  );
  const list = r?.value || r;
  if (!list) return res.status(409).json({ ok: false, error: 'item not found, or not in a skippable state' });
  res.json({ ok: true, list });
});

// Start ONE item. The claim is an atomic findOneAndUpdate pinned to a startable
// status, so a double-click (or, later, a tick racing a manual press) can never
// start the same work twice — this is the double-post guard for the whole
// feature, and it lives in the query, not in a check-then-write.
//
// EVERYTHING is manually runnable, including an item that already ran: send
// `force:true` to re-run a `done` one. The user needs to press things to check
// they work — same reasoning as "Run again" in chat (PROJECT_MEMORY 2026-07-21):
// a manual press is a deliberate "do it again", and the automatic double-post
// guards are about AUTOMATIC retries, not human ones.
app.post('/todolists/:id/items/:itemId/run', async (req, res) => {
  const startable = req.body?.force ? [...todos.STARTABLE, 'done'] : [...todos.STARTABLE];
  const claimed = await todoListsColl().findOneAndUpdate(
    { listId: req.params.id, items: { $elemMatch: { itemId: req.params.itemId, status: { $in: startable } } } },
    { $set: { 'items.$[it].status': 'queued', 'items.$[it].startedAt': nowIso(), 'items.$[it].finishedAt': null, 'items.$[it].note': '', updatedAt: nowIso() } },
    { arrayFilters: [{ 'it.itemId': req.params.itemId }], returnDocument: 'after', projection: { _id: 0 } },
  );
  const list = claimed?.value || claimed;
  if (!list) return res.status(409).json({ ok: false, error: 'item not found, or already running' });
  const it = list.items.find((i) => i.itemId === req.params.itemId);

  const release = async (status, note) => {
    await todoListsColl().updateOne(
      { listId: list.listId },
      { $set: { 'items.$[it].status': status, 'items.$[it].note': note, updatedAt: nowIso() }, },
      { arrayFilters: [{ 'it.itemId': it.itemId }] },
    );
    it.status = status; it.note = note;
  };

  if (needsExecutor(it.instruction) && !executorOnline()) {
    await release('todo', 'Chrome is not open — this item needs the extension to run it.');
    return res.status(409).json({ ok: false, error: 'Chrome is not open — open it (with the extension loaded) and press ▶ again.', list });
  }

  try {
    const model = String(req.body?.model || list.model || '');
    if (model && model !== list.model) await todoListsColl().updateOne({ listId: list.listId }, { $set: { model } });
    const task = await createTaskForItem(it, {
      projectId: list.projectId, model, auth: req.headers.authorization,
    });
    await todoListsColl().updateOne(
      { listId: list.listId },
      { $set: { 'items.$[it].status': 'running', 'items.$[it].taskId': task.taskId, updatedAt: nowIso() } },
      { arrayFilters: [{ 'it.itemId': it.itemId }] },
    );
    it.status = 'running'; it.taskId = task.taskId;
    res.json({ ok: true, list, taskId: task.taskId });
  } catch (e) {
    await release('failed', `Could not start: ${e.message || e}`);
    res.status(500).json({ ok: false, error: String(e.message || e), list });
  }
});

// "Run all" — starts the FIRST untouched item and sets `autoRun`, which
// `reconcileList` uses to start the next one only once this one is terminal.
// Never parallel: two browser items at once means two tabs driving two flows,
// which is how the wrong dialog gets clicked.
app.post('/todolists/:id/run', async (req, res) => {
  const list = await todoListsColl().findOne({ listId: req.params.id }, { projection: { _id: 0 } });
  if (!list) return res.status(404).json({ ok: false, error: 'not found' });
  if (!list.items.some((i) => i.status === 'todo')) return res.status(400).json({ ok: false, error: 'nothing left to run' });
  const runModel = String(req.body?.model || list.model || '');
  await todoListsColl().updateOne({ listId: list.listId }, { $set: { autoRun: true, model: runModel, updatedAt: nowIso() } });
  list.autoRun = true; list.model = runModel;
  const ctx = { projectId: list.projectId, model: runModel, auth: req.headers.authorization };
  res.json({ ok: true, list: await reconcileList(list, ctx) });
});

app.post('/todolists/:id/stop', async (req, res) => {
  await todoListsColl().updateOne({ listId: req.params.id }, { $set: { autoRun: false, updatedAt: nowIso() } });
  const list = await todoListsColl().findOne({ listId: req.params.id }, { projection: { _id: 0 } });
  res.json({ ok: true, list });   // a task already running is left alone — stop it in Chat
});

app.post('/tasks', async (req, res) => {
  const { goal, model, mode, schemas, useSkills, promptId, project } = req.body || {};
  if (!goal) return res.status(400).json({ ok: false, error: 'goal required' });

  // Project-wise settings: a project supplies DEFAULTS its tasks inherit.
  // Precedence: an explicit request field > the project default > the global
  // default. A field the request OMITS inherits; a field it sends (even empty)
  // is an explicit override.
  let proj = null;
  const reqProjectId = project && typeof project === 'object' ? (project.projectId || null) : null;
  if (reqProjectId) proj = await projectsColl().findOne({ projectId: reqProjectId }, { projection: { _id: 0 } });
  const ps = (proj && proj.settings) || {};

  const effModel = model || ps.model || '';
  if (!effModel) return res.status(400).json({ ok: false, error: 'model required (none given and the project has no default model)' });

  const effPromptId = promptId || ps.promptId || null;
  const effUseSkills = Array.isArray(useSkills) ? useSkills : (Array.isArray(ps.skillIds) ? ps.skillIds : []);
  const effSchemaIds = Array.isArray(schemas) ? schemas : (Array.isArray(ps.schemaIds) ? ps.schemaIds : []);
  const projInlinePrompt = (typeof ps.systemPrompt === 'string' && ps.systemPrompt.trim()) ? ps.systemPrompt.trim() : '';

  // Snapshot the project onto the task (grouping survives project deletion).
  // Prefer the stored project's identity; fall back to a bare {name,dir}.
  const taskProject = proj
    ? { projectId: proj.projectId, name: proj.name, dir: proj.dir || '' }
    : (project && typeof project === 'object' && project.name
        ? { projectId: null, name: String(project.name).slice(0, 120), dir: String(project.dir || '') }
        : null);

  // App command as the OPENING goal ("/todo open chrome and …"). Must be routed
  // here too, not only in runChatTurn — runChatTurn never sees a first turn, and
  // a `/todo` typed into an empty composer would otherwise be browser-planned
  // and EXECUTED, which is the exact outcome the command exists to avoid.
  const appCmd0 = appCommands.parseAppCommand(goal);
  if (appCmd0) {
    const base = {
      taskId: crypto.randomUUID(),
      goal: String(goal), model: effModel, mode: 'once', project: taskProject,
      schemas: [], useSkills: [], systemPrompt: null,
      status: 'done', plan: null, currentPhaseIndex: 0,
      collected: [], extracted: [], scrolls: 0, scanY: 0, actions: 0,
      repeats: 0, maxRepeats: 3, messages: [],
      chat: [], queue: [], sessionSummary: '', currentInstruction: null, round: 0,
      events: [], errors: [], proposals: [],
      createdAt: nowIso(), updatedAt: nowIso(), finishedAt: nowIso(),
    };
    if (appCmd0.error) {
      base.chat.push({ role: 'assistant', text: appCmd0.error, at: nowIso(), round: 0 });
      await tasksColl().insertOne({ ...base });
      return res.json({ ok: false, task: base, error: appCmd0.error });
    }
    await tasksColl().insertOne({ ...base });
    const proposal = await pushAppProposal(base, appCmd0, 0);
    const task = await tasksColl().findOne({ taskId: base.taskId }, { projection: { _id: 0 } });
    return res.json({ ok: true, task, mode: 'app-command', proposal });
  }

  // Host-command session (goal starts with /run|/sh|/host): do NOT browser-plan.
  // Create an IDLE session (status 'done' so the extension never runs phases)
  // and propose the command for confirmation, like the /run chat path.
  const hostGoalMatch = String(goal).match(HOST_PREFIX_RX);
  if (hostGoalMatch) {
    const instruction = String(goal).slice(hostGoalMatch[0].length).trim();
    const resolved = await resolveModel(effModel, instruction);
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

  // Launch an installed app ("open chrome with my Work profile", "launch
  // vscode"): an idle session + a launch proposal the desktop app confirms and
  // runs via its host launcher. Never browser-planned — "open chrome" is not a
  // navigate. The desktop validates the appId against its own registry.
  const launchReq0 = detectLaunch(goal);
  if (launchReq0) {
    // Phase 4: scope to the project's launchable apps (allowlist + default
    // profile). Empty/absent list = unrestricted.
    const scoped = scopeLaunchToProject(launchReq0, ps.launchApps);
    if (scoped.error) return res.json({ ok: false, error: scoped.error });
    const launchReq = scoped.launch;
    const label = launchLabel(launchReq.appId, launchReq.profile, launchReq.url);
    const base = {
      taskId: crypto.randomUUID(),
      goal: String(goal), model: effModel, mode: 'once', project: taskProject,
      schemas: [], useSkills: [], systemPrompt: null,
      status: 'done', plan: null, currentPhaseIndex: 0,
      collected: [], extracted: [], scrolls: 0, scanY: 0, actions: 0,
      repeats: 0, maxRepeats: 3, messages: [],
      chat: [{ role: 'assistant', text: `🚀 Launching **${label}**…`, at: nowIso(), round: 0 }],
      queue: [], sessionSummary: '', currentInstruction: null, round: 0,
      events: [{ at: nowIso(), kind: 'think', msg: `App-launch session: ${label}.`, round: 0 }],
      errors: [], createdAt: nowIso(), updatedAt: nowIso(), finishedAt: nowIso(),
    };
    await tasksColl().insertOne({ ...base });
    return res.json({ ok: true, task: base, mode: 'launch', proposal: { appId: launchReq.appId, profile: launchReq.profile || '', url: launchReq.url || '', label, title: label } });
  }

  // "How many tabs are open?" as the OPENING goal — answer with list_tabs, same
  // as the follow-up path in runChatTurn. Without this, a fresh conversation goes
  // to the planner, which guesses a browser task ("click New Tab") that fails.
  // (detectLaunch already returned null above: it drops anything mentioning "tab".)
  if (isTabQuestion(goal)) {
    // No browser executor connected → list_tabs could never run (it would hang
    // "running" forever). Answer honestly in an idle session instead.
    if (!executorOnline()) {
      const task = {
        taskId: crypto.randomUUID(),
        goal: String(goal), model: effModel, mode: 'once', project: taskProject,
        schemas: [], useSkills: [], systemPrompt: null,
        status: 'done', plan: null, currentPhaseIndex: 0,
        collected: [], extracted: [], scrolls: 0, scanY: 0, actions: 0,
        repeats: 0, maxRepeats: 3, messages: [],
        chat: [{ role: 'assistant', text: CHROME_NOT_OPEN_REPLY, at: nowIso(), round: 0 }],
        queue: [], sessionSummary: '', currentInstruction: null, round: 0,
        events: [{ at: nowIso(), kind: 'obs', msg: 'No browser executor connected — answered the tab question without listing tabs.', round: 0 }],
        errors: [], createdAt: nowIso(), updatedAt: nowIso(), finishedAt: nowIso(),
      };
      await tasksColl().insertOne({ ...task });
      return res.json({ ok: true, task, mode: 'answer' });
    }
    const task = {
      taskId: crypto.randomUUID(),
      goal: String(goal), model: effModel, mode: 'once', project: taskProject,
      schemas: [], useSkills: [], systemPrompt: null,
      status: 'running',
      plan: { target: { metric: 'actions', count: 1 }, phases: [{ tool: 'list_tabs', params: {} }], quiet: true },
      currentPhaseIndex: 0,
      collected: [], extracted: [], scrolls: 0, scanY: 0, actions: 0,
      repeats: 0, maxRepeats: 3, messages: [],
      chat: [{ role: 'assistant', text: '🔎 Checking your open Chrome tabs…', at: nowIso(), round: 0 }],
      queue: [], sessionSummary: '', currentInstruction: null, round: 0,
      events: [{ at: nowIso(), kind: 'act', msg: 'Listing open tabs (list_tabs).', round: 0 }],
      errors: [], createdAt: nowIso(), updatedAt: nowIso(),
    };
    await tasksColl().insertOne({ ...task });
    return res.json({ ok: true, task, mode: 'browse' });
  }

  // A question ABOUT the agent's own skills/elements is not a browser task.
  // Answer it from the database in an idle session — planning it sent the agent
  // to Facebook to RUN the very skill the user was only asking about.
  if (isIntrospection(goal)) {
    const resolved = await resolveModel(effModel, String(goal));
    const useModel = resolved.name || model;
    const reply = await answerIntrospection(useModel, String(goal));
    const task = {
      taskId: crypto.randomUUID(),
      goal: String(goal), model: useModel, mode: 'once', project: taskProject,
      schemas: [], useSkills: [], systemPrompt: null,
      status: 'done', plan: null, currentPhaseIndex: 0,
      collected: [], extracted: [], scrolls: 0, scanY: 0, actions: 0,
      repeats: 0, maxRepeats: 3, messages: [],
      chat: [{ role: 'assistant', text: reply.slice(0, 8000), at: nowIso(), round: 0 }],
      queue: [], sessionSummary: '', currentInstruction: null, round: 0,
      events: [{ at: nowIso(), kind: 'ok', msg: 'Answered from my own skills/elements — no browsing needed.', round: 0 }],
      errors: [], createdAt: nowIso(), updatedAt: nowIso(), finishedAt: nowIso(),
    };
    await tasksColl().insertOne({ ...task });
    return res.json({ ok: true, task, mode: 'introspect', reply });
  }

  // Snapshot the chosen system prompt; its bundled skills join the task's skills.
  let systemPrompt = null;
  const extraSkillIds = [];
  if (effPromptId) {
    const p = await promptsColl().findOne({ promptId: effPromptId }, { projection: { _id: 0 } });
    if (p) { systemPrompt = { promptId: p.promptId, name: p.name, content: p.content }; extraSkillIds.push(...(p.skillIds || [])); }
  }
  // A project's own "dynamic" system prompt applies when no named prompt was
  // chosen — materialized into the same {name, content} shape the planner reads
  // (see task.systemPrompt?.content in the planning path).
  if (!systemPrompt && projInlinePrompt) {
    systemPrompt = { promptId: null, projectId: proj?.projectId || null, name: `Project: ${taskProject?.name || 'settings'}`, content: projInlinePrompt };
  }

  // Snapshot the chosen schemas onto the task so tools + resume stay stable
  // even if the schema is later edited or deleted.
  let taskSchemas = [];
  const ids = effSchemaIds;
  if (ids.length) {
    const docs = await collFor('schemas').find({ schemaId: { $in: ids } }, { projection: { _id: 0 } }).toArray();
    taskSchemas = docs.map(schemaSnapshot);
  }

  // Snapshot explicitly chosen learned skills so planning routes to them.
  let taskUseSkills = [];
  const skIds = [...new Set([...effUseSkills, ...extraSkillIds])];
  if (skIds.length) {
    const docs = await resolveSkills(await collFor('skills').find({ skillId: { $in: skIds } }, { projection: { _id: 0 } }).toArray());
    taskUseSkills = docs.map((s) => ({ skillId: s.skillId, name: s.name, kind: s.kind, action: s.action, fields: s.fields, steps: s.steps || null, urlPattern: s.urlPattern }));
  }

  const task = {
    taskId: crypto.randomUUID(),
    goal, model: effModel, mode: mode || 'once',
    project: taskProject,        // desktop-app folder grouping {projectId, name, dir}
    schemas: taskSchemas,        // schemas this task saves collected data into
    useSkills: taskUseSkills,    // learned skills the task should use
    systemPrompt,                // standing instructions attached to this task
    // `idle` creates a session the extension will NOT plan or execute — used
    // when the first turn is an image to analyze, not a browser instruction.
    status: req.body?.idle ? 'done' : 'planning', // planning|running|checking|done|error|stopped
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
    // The opening goal IS the first turn of the conversation. Leaving it out
    // rendered a blank transcript in the desktop app for any task started from
    // the composer: follow-up turns push to `chat`, but the first one never did,
    // so a task that ran fine looked like it had said nothing.
    chat: goal ? [{ role: 'user', text: String(goal).slice(0, 8000), at: nowIso(), round: 0 }] : [],
    sessionSummary: '',          // compacted context of earlier session rounds
    currentInstruction: null,    // latest chat instruction being planned/executed
    queue: [],                   // prompts typed while busy; run on terminal status
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

// ---- Version switcher: regenerate the last round in place, keep every attempt --
// The newest attempt is always the LIVE flat arrays (task.chat / task.events);
// older attempts live frozen in `variants[R].archived`, and `variants[R].viewIndex`
// records which attempt the UI shows. Regenerating freezes the current attempt,
// wipes round R from the flat arrays, rewinds `round`, and re-runs the SAME
// instruction through runChatTurn — so the round is rebuilt through the same
// routing (re-answers / re-plans a browse / re-proposes a launch). Because a
// browse round finishes asynchronously (the extension executes over polls), we
// NEVER snapshot the new attempt: it stays live in the flat arrays and streams in.
app.post('/tasks/:id/regenerate', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  if (BUSY_STATUSES.has(task.status)) return res.status(409).json({ ok: false, error: 'Task is busy — wait for it to finish.' });

  const R = task.round || 0;
  // The instruction that opened round R: the goal for round 0, else round R's
  // user turn. Re-running it reproduces the round through the same routing.
  const instruction = R === 0
    ? String(task.goal || '').trim()
    : String((([...(task.chat || [])].reverse().find((m) => (m.round || 0) === R && m.role === 'user')) || {}).text || '').trim();
  if (!instruction) return res.status(400).json({ ok: false, error: 'Nothing to run again.' });

  // Freeze the CURRENT attempt of round R as a version.
  const frozen = {
    at: nowIso(),
    chat: (task.chat || []).filter((m) => (m.round || 0) === R),
    events: (task.events || []).filter((e) => (e.round || 0) === R),
  };
  // archived holds previous attempts; the live one sits at index archived.length.
  const prevArchived = task.variants?.[String(R)]?.archived?.length || 0;
  const newLiveIndex = prevArchived + 1;

  // Wipe round R from the flat arrays and rewind so runChatTurn rebuilds it.
  // round: R-1 → runChatTurn bumps back to R (−1 → 0 for round 0).
  const reset = {
    chat: (task.chat || []).filter((m) => (m.round || 0) !== R),
    events: (task.events || []).filter((e) => (e.round || 0) !== R),
    round: R - 1,
    plan: null, currentInstruction: null, currentPhaseIndex: 0,
    repeats: 0, scanY: 0, pendingQuestion: null, updatedAt: nowIso(),
  };
  // Regenerating the whole task (round 0) is a RESTART: drop collected data +
  // counters so the re-run starts clean. Later rounds keep the cumulative
  // session data earlier rounds gathered (it is not round-stamped).
  if (R === 0) { reset.collected = []; reset.extracted = []; reset.scrolls = 0; reset.actions = 0; }

  await tasksColl().updateOne({ taskId: task.taskId }, {
    $set: { ...reset, [`variants.${R}.viewIndex`]: newLiveIndex },
    $push: { [`variants.${R}.archived`]: frozen },
  });

  // Bring the in-memory task in line with the wipe, then re-run the round.
  Object.assign(task, reset);
  const out = await runChatTurn(task, instruction, req.body?.platform);
  return res.status(out.status || 200).json({ ...(out.body || { ok: true }), regenerated: true, round: R, version: newLiveIndex + 1 });
});

// Switch which attempt of a round is SHOWN — view-only, no flat-array mutation
// (so it never fights a live-updating browse round). index == archived.length
// selects the live attempt; a smaller index selects a frozen one.
app.post('/tasks/:id/round/:r/view', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0, variants: 1, taskId: 1 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  const r = Number(req.params.r);
  const v = Number.isInteger(r) ? task.variants?.[String(r)] : null;
  if (!v || !Array.isArray(v.archived) || !v.archived.length) {
    return res.status(400).json({ ok: false, error: 'No versions for this round.' });
  }
  const index = Number(req.body?.index);
  const maxIndex = v.archived.length; // == the live attempt's index
  if (!Number.isInteger(index) || index < 0 || index > maxIndex) {
    return res.status(400).json({ ok: false, error: 'Version out of range.' });
  }
  const doc = await tasksColl().findOneAndUpdate(
    { taskId: task.taskId },
    { $set: { [`variants.${r}.viewIndex`]: index, updatedAt: nowIso() } },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  res.json({ ok: true, task: doc?.value || doc });
});

// Whitelisted field updates (the extension persists progress through here).
// `lastTypedText`: whatever the most recent type phase actually entered. The
// publish verification used to key on `generatedText` alone, so a post whose
// text the USER supplied (params.value, no generate_text phase) skipped the
// check entirely — and a run that clicked the wrong button reported success.
const PATCHABLE = new Set(['status', 'currentPhaseIndex', 'collected', 'extracted', 'scrolls', 'scanY', 'actions', 'generatedText', 'lastTypedText', 'pendingQuestion', 'repeats', 'plan', 'finishedAt', 'messages', 'model', 'project', 'round', 'title', 'rethinks']);
app.patch('/tasks/:id', async (req, res) => {
  const set = {};
  for (const [k, v] of Object.entries(req.body || {})) if (PATCHABLE.has(k)) set[k] = v;
  set.updatedAt = nowIso();
  const doc = await tasksColl().findOneAndUpdate(
    { taskId: req.params.id }, { $set: set },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  const task = doc?.value || doc;
  res.json({ ok: true, task });

  // The extension marks a round finished through here — that is the moment a
  // queued prompt may start. Drain AFTER responding: a turn can call the model,
  // and the extension must not wait on it.
  if (task && TERMINAL_STATUSES.has(task.status)) {
    attributeLessonOutcome(task).catch(() => {}); // phase 4: did the round's lessons help?
    if ((task.queue || []).length) drainQueue(task.taskId).catch(() => {});
  }
});

// Cancel a running task. The extension re-reads status between phases and at
// the top of its loop, so flipping it in the DB is what actually halts work —
// this also survives a torn-down service worker (nothing in memory to signal).
// Queued prompts are discarded: "stop" means stop everything.
app.post('/tasks/:id/stop', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  const dropped = (task.queue || []).length;
  const msg = 'Stopped by user.' + (dropped ? ` Discarded ${dropped} queued prompt(s).` : '');
  const doc = await tasksColl().findOneAndUpdate(
    { taskId: req.params.id },
    {
      $set: { status: 'stopped', queue: [], pendingQuestion: null, finishedAt: nowIso(), updatedAt: nowIso() },
      $push: {
        events: { at: nowIso(), kind: 'obs', msg, round: task.round || 0 },
        chat: { role: 'assistant', text: '⏹️ ' + msg, at: nowIso(), round: task.round || 0 },
      },
    },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  res.json({ ok: true, dropped, task: doc?.value || doc });
});

// Narrow (or clear) the learned skills this session plans with. Fewer skills =
// a smaller planning prompt = faster, more accurate routing. Empty array means
// "no restriction" (all skills are offered again).
app.post('/tasks/:id/skills', async (req, res) => {
  const ids = Array.isArray(req.body?.skillIds) ? req.body.skillIds.map(String) : [];
  let useSkills = [];
  if (ids.length) {
    const docs = await resolveSkills(await skillsColl().find({ skillId: { $in: ids } }, { projection: { _id: 0 } }).toArray());
    useSkills = docs.map((s) => ({ skillId: s.skillId, name: s.name, kind: s.kind, action: s.action, fields: s.fields, steps: s.steps || null, urlPattern: s.urlPattern }));
  }
  const doc = await tasksColl().findOneAndUpdate(
    { taskId: req.params.id }, { $set: { useSkills, updatedAt: nowIso() } },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  if (!doc && !doc?.value) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, task: doc?.value || doc });
});

// Drop a prompt that is still waiting in the queue.
app.delete('/tasks/:id/queue/:qid', async (req, res) => {
  const doc = await tasksColl().findOneAndUpdate(
    { taskId: req.params.id }, { $pull: { queue: { id: req.params.qid } }, $set: { updatedAt: nowIso() } },
    { returnDocument: 'after', projection: { _id: 0 } }
  );
  res.json({ ok: true, task: doc?.value || doc });
});

app.delete('/tasks/:id', async (req, res) => {
  await tasksColl().deleteOne({ taskId: req.params.id });
  await collFor('task_shots').deleteMany({ taskId: req.params.id });
  await collFor('debug_items').deleteMany({ taskId: req.params.id });
  await collFor('task_files').deleteMany({ taskId: req.params.id });
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
const TERMINAL_STATUSES = new Set(['done', 'error', 'stopped']);

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
      const docs = await recordsColl()
        .find({ schemaId: s.schemaId, _taskId: task.taskId }).limit(max).toArray();
      rows.push(...docs.map((d) => d.result || {}));
    } catch (e) {
      console.warn(`[sessionRecords] schema ${s.schemaId}: ${e?.message || e}`);
    }
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
// Questions about the agent ITSELF — its learned skills, elements, schemas —
// are answered from the database and must never touch the browser.
// "Check your facebook post skill, how many elements does it have?" used to be
// planned as a browser task: it navigated to Facebook and started RUNNING the
// posting skill. Asking about a capability is not asking to use it.
// The subject: does the message talk about the agent's own saved knowledge?
// Determiners matter — "that skill" / "this element" are as common as "my".
const INTROSPECT_SUBJECT_RX =
  /\b(skill|skills|element|elements|schema|schemas)\b/i;
// Reading ABOUT it. Deliberately generous: the cost of missing one of these is
// that a read-only question runs a POSTING skill against a live account, which
// is far worse than the cost of a false positive (an answer instead of a task).
const INTROSPECT_READ_RX =
  /\b(check|read|see|view|inspect|look at|tell me|show|list|describe|explain|write (it |them )?(here|out|down)|what|which|how many|how does|details?|instructions?|available|avail|do you have|is there|are there)\b/i;
// Explicitly asking the agent to USE the skill for work — a real browser task.
const INTROSPECT_ACTION_RX =
  /\b(use|using|run|execute|apply|perform)\b[^.?]{0,25}\b(skill|skills)\b|\b(post|publish|tweet|send|collect|scrape|navigate|log ?in|sign ?in)\b/i;

function isIntrospection(text) {
  const s = String(text || '');
  if (!INTROSPECT_SUBJECT_RX.test(s)) return false;
  if (!INTROSPECT_READ_RX.test(s)) return false;
  // "use my facebook skill to post about X" mentions a skill and reads like a
  // task — the action wins unless the message is clearly asking to be shown it.
  const clearlyReading = /\b(tell me|show me|write (it |them )?here|i want to (read|see|know)|how many|what (is|are)|list|describe|explain|details?|instructions?)\b/i.test(s);
  return clearlyReading || !INTROSPECT_ACTION_RX.test(s);
}

// "Save this flow as a skill" is a request to write the agent's own memory, NOT
// a browser task. Getting this wrong is expensive: a meta-request planned as a
// browse round has TWICE run the posting flow again against the live account
// (see PROJECT_MEMORY). So it is gated twice — this regex, and a routeChat
// class — exactly like introspection.
const SAVE_SKILL_RX =
  /\b(save|store|remember|keep|record)\b[^.?!]{0,40}\b(as|into|to|in)\b[^.?!]{0,20}\b(a |an |my |new )?(skill|workflow|flow|routine|recipe)\b/i;
const SAVE_SKILL_SHORT_RX =
  /\b(save|remember|keep)\b[^.?!]{0,30}\b(this|that|it|these steps|the flow|the steps|this flow|this one)\b[^.?!]{0,30}\b(skill|workflow|flow|routine)\b/i;

function isSaveSkillRequest(text) {
  const s = String(text || '');
  if (!/\b(skill|workflow|routine|recipe|flow)\b/i.test(s)) return false;
  // "use my facebook skill to post" also mentions a skill — but it asks the
  // agent to RUN one, not to write one. A save request never names a target.
  if (/\b(use|using|run|execute|apply|with) (my |the |your )?[\w\s]{0,20}skill\b/i.test(s)) return false;
  return SAVE_SKILL_RX.test(s) || SAVE_SKILL_SHORT_RX.test(s);
}

// A compact picture of what the agent knows, for answering questions about it.
async function agentInventory() {
  const skills = await resolveSkills(await skillsColl().find({}, { projection: { _id: 0 } }).toArray());
  const elements = await elementsColl().find({}, { projection: { _id: 0, elementId: 1, name: 1, host: 1, type: 1, route: 1, details: 1, action: 1 } }).toArray();
  const schemas = await schemasColl().find({}, { projection: { _id: 0, name: 1, fields: 1 } }).limit(40).toArray();

  const raw = await skillsColl().find({}, { projection: { _id: 0, skillId: 1, elements: 1 } }).toArray();
  const refCount = new Map(raw.map((s) => [s.skillId, (s.elements || []).length]));

  return {
    skills: skills.map((s) => ({
      name: s.name, host: s.host, urlPattern: s.urlPattern, kind: s.kind,
      elementCount: refCount.get(s.skillId) || 0,
      steps: (s.steps || []).map((x) => `${x.name} (${x.action})`),
      fields: (s.fields || []).map((f) => f.name),
      details: s.details || '',
      instructions: s.instructions || '',
      hintCount: (s.hints || []).length,
    })),
    elements: elements.map((e) => ({ name: e.name, host: e.host, type: e.type, route: e.route, action: e.action, details: e.details || '' })),
    schemas: schemas.map((s) => ({ name: s.name, fields: (s.fields || []).map((f) => f.key) })),
  };
}

// Answer a question about the agent's own configuration. Returns the reply text.
async function answerIntrospection(model, question) {
  const inv = await agentInventory();
  const lines = [];
  lines.push(`LEARNED SKILLS (${inv.skills.length}):`);
  for (const s of inv.skills) {
    lines.push(`- "${s.name}" on ${s.urlPattern} — kind: ${s.kind || 'action'}, `
      + (s.kind === 'instruction' ? `${s.hintCount} element hint(s)` : `${s.elementCount} element(s)`)
      + (s.steps.length ? `, steps: ${s.steps.join(' → ')}` : '')
      + (s.fields.length ? `, fields: ${s.fields.join(', ')}` : ''));
    // The instructions/details are often exactly what is being asked for.
    if (s.instructions) lines.push(`    instructions: ${s.instructions}`);
    else if (s.details) lines.push(`    details/instructions: ${s.details}`);
  }
  lines.push('', `INTRODUCED ELEMENTS (${inv.elements.length}):`);
  for (const e of inv.elements.slice(0, 60)) {
    lines.push(`- "${e.name}" (${e.type}) on ${e.route || e.host}`
      + (e.details ? ` — ${e.details}` : ''));
  }
  if (inv.schemas.length) {
    lines.push('', `DATA SCHEMAS (${inv.schemas.length}):`);
    for (const s of inv.schemas) lines.push(`- ${s.name}: ${s.fields.join(', ')}`);
  }

  try {
    const reply = await askChat(model, [
      { role: 'system', content:
        'You are the browser agent, answering a question about YOUR OWN configuration. '
        + 'Use ONLY the inventory below — it is the complete, current truth. Be exact with counts and names. '
        + 'If the answer is a number, state it plainly first. Do not offer to browse the web; this is about what you already know.\n\n'
        + lines.join('\n').slice(0, 9000) },
      { role: 'user', content: question },
    ], { temperature: 0.1 });
    if (reply.trim()) return reply.trim();
  } catch (e) {
    console.warn(`[directAnswer] model ${model}: ${e?.message || e}`);
  }
  // Model unavailable — the inventory itself is still a useful answer.
  return lines.join('\n');
}

// Turn the run that just happened into a skill, and reply in the transcript.
// Refuses rather than guessing when the run did not finish or there is nothing
// to attach it to — a skill built from a broken run records the wrong thing as
// if it were right, and it would be trusted on every later run.
async function saveSkillFromChat(task, message, round) {
  const say = async (text) => {
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $push: { chat: { role: 'assistant', text, at: nowIso(), round } },
      $set: { updatedAt: nowIso() },
    });
    return text;
  };

  if (task.status !== 'done') {
    return say(`This run is "${task.status}", not finished — I only save a flow once it has worked end to end. Let it finish (or re-run it), then ask again.`);
  }
  const instructions = String(task.currentInstruction || task.goal || '').trim();
  if (!instructions) return say('There is no instruction in this session to save.');

  const host = hostOfTask(task);
  if (!host) return say('I could not work out which site this flow belongs to — it has no navigate step or recorded page.');

  const hints = (task.resolutions || []).map((r) => ({
    descriptor: r.descriptor, matched: r.matched, selectorHint: r.selectorHint, tool: r.tool, depth: r.depth,
  }));
  // A name in the message ("save this as My Facebook Post") wins over the guess.
  const named = (message.match(/\b(?:as|called|named)\s+"([^"]{2,60})"/i) || message.match(/\b(?:as|called|named)\s+(?!a\b|an\b|my\b|the\b|new\b)([A-Za-z0-9][\w\s-]{2,40})\bskill\b/i) || [])[1];
  const name = (named || '').trim() || defaultSkillName(instructions, host);

  const { skill, merged } = await saveInstructionSkill({ name, host, instructions, hints, taskId: task.taskId });
  const detail = hints.length
    ? `I kept ${hints.length} element hint(s) from this run (${hints.map((h) => `"${h.matched}"`).slice(0, 4).join(', ')}${hints.length > 4 ? '…' : ''}).`
    : 'This run used no descriptor steps, so there are no element hints yet — the instructions alone are saved.';
  const text = `${merged ? 'Updated' : 'Saved'} **${skill.name}** for ${host}.\n\n${detail}\n\nRunning it still plans each time — the hints just tell me where things were, so I search less and guess less.`;
  await tasksColl().updateOne({ taskId: task.taskId }, {
    $push: { events: { at: nowIso(), kind: 'ok', msg: `${merged ? 'Updated' : 'Saved'} skill "${skill.name}" (${hints.length} hints).`, round, meta: { skillId: skill.skillId, merged } } },
  });
  return say(text);
}

async function routeChat(task, message) {
  const b = BROWSE_RX.test(message), a = ANSWER_RX.test(message);
  if (a && !b) return 'answer';
  if (b && !a) return 'browse';
  try {
    const out = JSON.parse(await askChat(task.model, [
      { role: 'system', content: 'Classify the user\'s follow-up message for a browser-automation task session. '
        + '"save_skill" = it asks to SAVE/REMEMBER what just ran as a skill/workflow/routine for later reuse. It does NOT ask to do anything in the browser. '
        + '"introspect" = it asks ABOUT the agent\'s own saved configuration — its learned skills, introduced elements, data schemas: what they are, how many, their names, details or instructions. Asking to SEE or READ a skill is "introspect", NOT "browse". '
        + '"browse" = it needs the browser to DO something (navigate, scroll, collect, click, post…) OR it asks for information that is NOT already in the collected data — current events, prices, news, product/company facts, anything that needs looking up on the web. '
        + '"answer" = it can be answered purely from the data ALREADY collected in this session (summaries, analysis of that data). '
        + 'If it mentions a skill or element and only wants to be TOLD about it, choose "introspect". Otherwise when in doubt choose "browse" — the agent can always search the web. '
        + 'Reply STRICT JSON {"mode":"browse"|"answer"|"introspect"|"save_skill"}.' },
      { role: 'user', content: message },
    ], { format: { type: 'object', properties: { mode: { type: 'string', enum: ['browse', 'answer', 'introspect', 'save_skill'] } }, required: ['mode'] } }));
    if (['answer', 'browse', 'introspect', 'save_skill'].includes(out.mode)) return out.mode;
  } catch (e) {
    console.warn(`[routeChat] model ${task.model}: ${e?.message || e}`);
  }
  return a ? 'answer' : 'browse';   // model unreachable — heuristic decides
}

// Host commands are EXPLICIT (message starts with /run, /sh or /host) — never
// auto-routed from natural language, so an ordinary browse/answer message can
// never trigger shell execution. The backend only PROPOSES a command (as an
// argv array — no shell string, no operators); the desktop app confirms and
// runs it in its own process. The backend never executes anything on a host.
const HOST_PREFIX_RX = /^\/(run|sh|host)(?:\s+|$)/i;

// ---- launch an installed app (desktop-app host launcher) --------------------
// "open chrome with my Work profile", "launch vscode", "/open explorer". The
// backend only PROPOSES an appId (+ optional profile NAME); the desktop app
// validates it against its own registry (launch-registry.ts) and runs it. A
// keyword map, not the model — a fixed 7-app mapping is more reliable and
// testable than a 7B, and the desktop rejects any appId it does not know.
const LAUNCH_PREFIX_RX = /^\/(launch|open)\s+/i;
const LAUNCH_VERB_RX = /\b(open|launch|start|run|fire up|boot up)\b/i;
const LAUNCH_ALIASES = [
  [/\b(google\s*)?chrome\b/i, 'chrome'],
  [/\b(microsoft\s*)?edge\b/i, 'edge'],
  [/\bfirefox\b/i, 'firefox'],
  [/\b(vs\s?code|visual studio code|vscode)\b/i, 'vscode'],
  [/\b(file\s*)?explorer\b|\bfinder\b|\bfile manager\b/i, 'explorer'],
  [/\bnotepad\b|\btext\s?edit\b|\btext editor\b/i, 'notepad'],
  [/\bterminal\b|\bcommand prompt\b|\bpowershell\b|\bconsole\b/i, 'terminal'],
];

const LAUNCH_BROWSERS = new Set(['chrome', 'edge', 'firefox']);
// Known launchable appIds (mirrors the desktop registry) — used to validate a
// project's launchApps allowlist.
const LAUNCH_APP_IDS = new Set(['chrome', 'edge', 'firefox', 'vscode', 'explorer', 'notepad', 'terminal']);

// Apply a project's launchApps scope to a detected launch (Phase 4).
// Empty/absent list = no restriction (the "empty = all" convention). Otherwise
// the appId must be listed (ALLOWLIST), and a browser launched with no named
// profile inherits the list entry's profile (DEFAULT PROFILE — an explicit
// profile in the message still wins because launchReq.profile is set already).
function scopeLaunchToProject(launchReq, launchApps) {
  const list = Array.isArray(launchApps) ? launchApps : [];
  if (!list.length) return { launch: launchReq };
  const entry = list.find((a) => a && a.appId === launchReq.appId);
  if (!entry) {
    return { error: `${launchLabel(launchReq.appId)} isn't in this project's launchable apps. Add it in the project's settings (the tune icon on the folder) to open it here.` };
  }
  const profile = launchReq.profile || entry.profile || null;
  return { launch: { ...launchReq, profile } };
}
// A few common site words → URL, so "open chrome and go to gmail" navigates.
// Deliberately small; anything with a real domain is handled generically.
const SITE_ALIASES = {
  gmail: 'https://mail.google.com', youtube: 'https://youtube.com', facebook: 'https://facebook.com',
  twitter: 'https://x.com', x: 'https://x.com', github: 'https://github.com', reddit: 'https://reddit.com',
  maps: 'https://maps.google.com', drive: 'https://drive.google.com', linkedin: 'https://linkedin.com',
  whatsapp: 'https://web.whatsapp.com', chatgpt: 'https://chatgpt.com',
};

// A destination to open in a launched BROWSER: an explicit URL, a domain, or a
// known site word after "go to / visit / open". Pure — unit-tested.
function detectLaunchUrl(s) {
  const explicit = s.match(/\bhttps?:\/\/[^\s"'<>]+/i);
  if (explicit) return explicit[0];
  const domain = s.match(/\b([a-z0-9-]+\.(?:com|org|net|io|dev|co|ai|gov|edu|app)(?:\/[^\s"'<>]*)?)\b/i);
  if (domain) return 'https://' + domain[1];
  const m = s.match(/\b(?:go to|goto|visit|navigate to|then open|and open|open up)\s+"?([a-z][a-z0-9-]{1,30})"?/i);
  if (m && SITE_ALIASES[m[1].toLowerCase()]) return SITE_ALIASES[m[1].toLowerCase()];
  return null;
}

// Returns { appId, profile, url } or null. Pure — unit-tested.
function detectLaunch(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const explicit = LAUNCH_PREFIX_RX.test(s);
  if (!explicit && !LAUNCH_VERB_RX.test(s)) return null;
  // "open a new chrome TAB" is a browser op, not a launch — unless the user
  // explicitly says window/app/program.
  if (/\btab\b/i.test(s) && !/\b(window|app|program|application)\b/i.test(s)) return null;

  let appId = null;
  for (const [rx, id] of LAUNCH_ALIASES) if (rx.test(s)) { appId = id; break; }
  if (!appId) return null;

  // Profile: "with my Work profile", "using the Default profile" (SUFFIX form,
  // tried first — it is unambiguous), else "profile Work" (PREFIX form, a single
  // word only, so it cannot swallow a trailing "and go to …" clause).
  const pm =
    s.match(/\b(?:with|using|in)\s+(?:my\s+|the\s+)?"?([A-Za-z0-9][\w .-]{0,39}?)"?\s+profile\b/i) ||
    s.match(/\bprofile\s+"?([A-Za-z0-9][\w.-]{0,39})"?/i);
  let profile = pm ? pm[1].trim() : null;
  if (profile && /^(and|then|go|to|the|a|an|open|it|please|now)$/i.test(profile)) profile = null;
  // A destination only makes sense for a browser (Phase 4: launch + navigate).
  const url = LAUNCH_BROWSERS.has(appId) ? detectLaunchUrl(s) : null;
  return { appId, profile, url };
}

function launchLabel(appId, profile, url) {
  const names = { chrome: 'Google Chrome', edge: 'Microsoft Edge', firefox: 'Firefox', vscode: 'VS Code', explorer: 'File Explorer', notepad: 'Text Editor', terminal: 'Terminal' };
  let host = '';
  if (url) { try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { host = url; } }
  return `${names[appId] || appId}${profile ? ` (${profile} profile)` : ''}${host ? ` → ${host}` : ''}`;
}

// This session started (or has since performed) an app launch. Used to answer a
// "did it open?" follow-up honestly rather than plan a doomed browser task.
function sessionHasLaunch(task) {
  return (task.events || []).some((e) =>
    e.meta?.launch === true || /(app-launch session|proposed launch|^launch:)/i.test(e.msg || ''));
}

// A "did the app I launched open / is it running?" question. Deliberately narrow
// AND only consulted inside a launch session (sessionHasLaunch), so a real browse
// follow-up ("is the page loaded?") does not match.
function isLaunchStatusQuestion(text) {
  const s = String(text || '').toLowerCase().trim();
  const asking = /\b(is|are|did|has|have|was|does|do|check|confirm)\b/.test(s) || s.endsWith('?');
  const about = /\b(open(ed|ing)?|launch(ed|ing)?|start(ed|ing)?|run(ning)?|work(ing|ed|s)?|show(ed|ing|n)?\s*up)\b/.test(s);
  return asking && about;
}

// "how many tabs are open?", "list my tabs", "what tabs are open" — answerable by
// the extension's list_tabs (chrome.tabs.query in its own Chrome; no content
// script, so it avoids the 'Receiving end does not exist' failure). Distinct from
// a launch-status question, and NOT an imperative like "open a new tab".
function isTabQuestion(text) {
  const s = String(text || '').toLowerCase();
  if (!/\btabs?\b/.test(s)) return false;
  return /\b(how many|how much|number of|count of|list|what|which)\b[^.?!]*\btabs?\b/.test(s)
    || /\btabs?\b[^.?!]*\b(open|opened|running)\b/.test(s);
}

// --- Browser executor presence ---------------------------------------------
// The Chrome extension is the ONLY thing that can run browser tools (list_tabs,
// clicks, …), and it exists only while Chrome is open. It announces itself by
// polling GET /tasks?executor=1 every ~30s (its ba-task-poll alarm). We remember
// the last time we heard from it so a browser round we CANNOT possibly run — e.g.
// "how many tabs are open?" when Chrome is closed — is answered honestly instead
// of hanging forever on a list_tabs round no executor will ever pick up (the exact
// symptom: a task stuck "running · Checking your open Chrome tabs…").
// In-memory: after a backend restart this reads "offline" until the extension next
// polls (≤30s). We UNDER-claim presence on purpose — a brief honest "not open" is
// better than an infinite spinner.
let lastExecutorSeenAt = 0;
const EXECUTOR_ONLINE_MS = 70_000; // ~2 missed 30s polls of grace
function executorOnline() { return Date.now() - lastExecutorSeenAt < EXECUTOR_ONLINE_MS; }

// The honest answer when a tab question arrives but no browser executor is
// connected (Chrome not open, or the extension disabled/not reloaded).
const CHROME_NOT_OPEN_REPLY =
  "Chrome doesn't appear to be open — I don't see a connected browser, so there "
  + 'are no tabs to list. Open Chrome (with the Kajkor extension installed) and ask again.';

// The most recent thing this session launched, for the honest reply. Strips the
// "Launch: " / "App-launch session: " prefix and any trailing period.
function lastLaunchLabel(task) {
  // Require the "keyword: label" colon so this does NOT match the launch-status
  // OBS event ("…launch-status question…") — that produced a garbled label
  // ("-status question — answered directly…") on a re-run.
  const evs = (task.events || []).filter((e) =>
    e.meta?.launch === true || /(app-launch session|proposed launch|^launch):\s/i.test(e.msg || ''));
  const e = evs[evs.length - 1];
  const m = e && /(?:app-launch session|proposed launch|launch):\s*(.+)$/i.exec(e.msg || '');
  return (m && m[1] ? m[1] : '').replace(/\.\s*$/, '').trim() || 'the app';
}


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

// The desktop reports back the outcome of a launch proposal (approved/denied/
// error), recorded in the transcript. Success = "launch requested" — a detached
// GUI app gives no exit code, so we never claim more than that.
app.post('/tasks/:id/launch-result', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { round: 1 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  const b = req.body || {};
  const label = String(b.label || b.appId || 'app').slice(0, 120);
  let text, kind;
  if (b.denied) { text = `🚫 Launch cancelled: ${label}`; kind = 'obs'; }
  else if (b.error) { text = `❌ Could not launch ${label} — ${String(b.error).slice(0, 300)}`; kind = 'err'; }
  else { text = `🚀 Launch requested: ${label}. (I can start it — I can't drive that window from here.)`; kind = 'ok'; }
  const rn = task.round || 0;
  await tasksColl().updateOne({ taskId: req.params.id }, {
    $push: {
      chat: { role: 'assistant', text, at: nowIso(), round: rn },
      events: { at: nowIso(), kind, msg: `Launch: ${label}`.slice(0, 200), round: rn, meta: { launch: true, appId: String(b.appId || ''), denied: !!b.denied } },
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
  } catch (e) {
    console.warn(`[compactSession] model ${task.model}: ${e?.message || e}`);
  }
  if (!summary) summary = `${task.goal} — ${stats}. ${chat.length} chat turns compacted (model offline; details in the event log).`;
  const keep = chat.slice(-2);
  await tasksColl().updateOne({ taskId: task.taskId }, {
    $set: { sessionSummary: summary.slice(0, 2000), chat: keep, updatedAt: nowIso() },
    $push: { events: { at: nowIso(), kind: 'think', msg: `Session compacted: ${chat.length} → ${keep.length} turns kept + summary.`, round: task.round || 0 } },
  });
  task.sessionSummary = summary; task.chat = keep;
  return summary;
}

// Prefer a general/instruct model for prose work (summarizing, judging
// relevance, writing the answer). Coder models are markedly worse at it — they
// over-trigger the relevance gate and format poorly. Falls back to `current`.
async function proseModel(current) {
  if (!/coder/i.test(String(current || ''))) return current;
  try {
    const list = (await (await fetch(`${OLLAMA_URL}/api/tags`)).json()).models || [];
    const alt = list.map((m) => m.name).find((n) => !/coder|embed/i.test(n));
    return alt || current;
  } catch {
    return current;
  }
}

// Synthesize the researched sources into the final answer, with citations.
// MAP-REDUCE, because ten full web pages never fit a local model's context:
//   map    — summarize each source ALONE against the question (small calls)
//   reduce — write the answer from just those digests, citing [n] by index
// The answer is pushed as an assistant chat turn; the sources stay on
// task.collected so the UI can reveal them behind "Show sources".
app.post('/tasks/:id/synthesize', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  const question = String(req.body?.question || task.currentInstruction || task.goal || '').trim();
  // Summarizing/judging prose is a poor fit for a *coder* model — if the task is
  // running on one, borrow an installed instruct model just for this step.
  const model = await proseModel(task.model);

  const sources = (task.collected || [])
    .filter((s) => s && s.url && String(s.text || '').trim())
    .slice(0, 12)
    .map((s, i) => ({ index: i + 1, url: s.url, title: s.title || s.url, text: String(s.text) }));
  if (!sources.length) return res.json({ ok: false, error: 'No readable sources to summarize — run read_pages first.' });

  // ---- MAP: one small call per source ----
  // The relevance gate is deliberately LENIENT: dropping a partly-useful page
  // loses real information, while a weak page only adds a little noise.
  const digests = [];
  for (const s of sources) {
    let d = '';
    try {
      d = (await askChat(model, [
        { role: 'system', content:
          'You condense ONE web page so it can help answer a question. Output 3-6 short bullet points containing ONLY facts stated in the SOURCE. No preamble. '
          + 'Be generous: if the page contains ANY information that is even partly related to the question, summarize that part. '
          + 'Reply with exactly NOT_RELEVANT only when the page is about a COMPLETELY different subject.' },
        { role: 'user', content: `QUESTION: ${question}\n\nSOURCE "${s.title}":\n${s.text.slice(0, 6000)}` },
      ], { temperature: 0.2 })).trim();
    } catch { /* a dead source must not kill the run */ }
    // Reject on the token ANYWHERE (models append it mid-text), and scrub any
    // stray occurrence so the control token can never leak into the answer.
    if (d && !/NOT_RELEVANT/i.test(d)) digests.push({ ...s, digest: d.slice(0, 1500) });
  }

  // Safety net: if the gate rejected nearly everything (a known failure mode of
  // small/coder models), fall back to raw extracts so the answer is still built
  // from the pages actually gathered rather than from one lucky source.
  const floor = Math.min(3, sources.length);
  if (digests.length < floor) {
    for (const s of sources) {
      if (digests.length >= floor) break;
      if (digests.some((d) => d.index === s.index)) continue;
      digests.push({ ...s, digest: s.text.slice(0, 900) });
    }
    digests.sort((a, b) => a.index - b.index);
  }
  if (!digests.length) return res.json({ ok: false, error: 'None of the sources were relevant to the question.' });

  // ---- REDUCE: one call over the digests only ----
  const allowed = digests.map((d) => d.index);
  const allowedSet = new Set(allowed);
  // Phase 3: research-style lessons ("read at least 5 sources", "be concise").
  // Host-scoped ones don't fit a multi-site research answer; global + the
  // research task-type + the synthesize tool do.
  const synthLessons = await injectLessons({ taskType: 'research', tools: ['synthesize'] },
    'USER PREFERENCES (learned from past feedback — follow these):');
  const lessonBlock = synthLessons.block;
  // Merge into this round's attribution set (the planner may have stamped it too).
  if (synthLessons.ids.length) {
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $set: { 'pendingLesson.round': task.round || 0 },
      $addToSet: { 'pendingLesson.lessonIds': { $each: synthLessons.ids } },
    });
  }
  let answer = '';
  try {
    answer = (await askChat(model, [
      { role: 'system', content:
        'You write a clear, well-structured answer using ONLY the numbered SOURCES below. '
        + `Cite claims with the source number in square brackets. You may ONLY use these exact numbers: ${allowed.join(', ')}. `
        + 'NEVER cite any other number, and never invent facts or sources beyond those given. '
        + 'If the sources disagree, say so. Answer the question directly first, then the supporting detail.'
        + lessonBlock },
      { role: 'user', content:
        `QUESTION\n${question}\n\nSOURCES (cite only these numbers: ${allowed.join(', ')})\n`
        + digests.map((d) => `[${d.index}] ${d.title}\n${d.digest}`).join('\n\n') },
    ], { temperature: 0.3 })).trim();
  } catch (e) {
    return res.json({ ok: false, error: 'Could not reach the model to summarize. ' + (e.message || '') });
  }
  if (!answer) return res.json({ ok: false, error: 'The model returned an empty summary.' });

  // Models still hallucinate citations to sources they were never given — strip
  // any marker that doesn't point at a real digest, so every [n] the user can
  // click is genuine.
  let dropped = 0;
  answer = answer
    // any bracketed marker — [3], [2][4], or malformed ones like [1 NOT_RELEVANT]
    .replace(/\[([^\]]*)\]/g, (m, inner) => {
      const nums = String(inner).match(/\d+/g) || [];
      const keep = nums.filter((n) => allowedSet.has(Number(n)));
      if (!nums.length) return m;                       // not a citation, leave alone
      if (!keep.length) { dropped++; return ''; }       // entirely invalid → remove
      if (keep.length !== nums.length || !/^\s*\d+\s*$/.test(inner)) dropped++;
      return keep.map((n) => `[${n}]`).join('');        // normalize to clean markers
    })
    .replace(/NOT_RELEVANT/gi, '')                      // scrub any leaked control token
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const round = task.round || 0;
  const note = digests.length < sources.length
    ? `\n\n_Based on ${digests.length} of ${sources.length} sources gathered._` : '';
  const evMsg = `Summarized ${digests.length}/${sources.length} source(s)`
    + (model !== task.model ? ` using ${model}` : '')
    + (dropped ? `; removed ${dropped} invalid citation(s)` : '') + '.';
  await tasksColl().updateOne({ taskId: task.taskId }, {
    $set: { summary: answer, updatedAt: nowIso() },
    $push: {
      chat: { role: 'assistant', text: (answer + note).slice(0, 12000), at: nowIso(), round },
      events: { at: nowIso(), kind: 'ok', msg: evMsg, round, meta: { synthesized: digests.length, sources: sources.length, model, droppedCitations: dropped } },
    },
  });
  res.json({ ok: true, answer, used: digests.length, total: sources.length, model, dropped });
});

// ---- adaptive recovery: think → act → observe → think ----
// A fixed plan cannot react. When a phase fails (or a verification says the
// page is not what the plan assumed), the agent looks at what is ACTUALLY on
// screen and decides what to do instead. Deliberately failure-gated: phases
// that behave as expected just run, so a local model is not asked to deliberate
// on every step.
const MAX_RETHINKS = 3;

// Render the descriptor finder's `diagnosis` for the recovery prompt. Each
// field points at a DIFFERENT cause, and saying which one it was stops the
// model guessing: the observed failure mode is it inventing a control that was
// never on the page. Empty string when the phase carried no descriptor.
function describeDiagnosis(d) {
  if (!d || typeof d !== 'object') return '';
  const want = (d.searched?.value || []).join('" / "');
  const out = [`WHY THE LOOKUP MISSED (searched for "${want}"):`];
  if (d.scopeEmpty) {
    out.push(`- The ${d.searched?.scope} it was told to search inside is NOT OPEN. The step before this one did not do what it was supposed to — recover by opening it, not by retrying this step.`);
  } else if (Array.isArray(d.ascentRejected) && d.ascentRejected.length) {
    out.push(`- That text IS on the page (${d.ascentRejected.map((t) => `"${t}"`).join(', ')}) but it is not inside anything clickable. It is probably a label or heading, not a control.`);
  } else if (Array.isArray(d.nearest) && d.nearest.length) {
    out.push(`- Nothing matched. The nearest text actually on the page: ${d.nearest.map((t) => `"${t}"`).join(', ')}. The wording has probably changed — use one of these EXACTLY if it is the right control.`);
  } else {
    out.push('- Nothing on the page matched, and there is no close alternative.');
  }
  if (d.retries) out.push(`- Already retried ${d.retries}x with backoff, so it is not a slow-render problem.`);
  return out.join('\n');
}

// ---- instruction skills: record what resolved, then promote a good run ------
// A run that worked is the only trustworthy source of "where things are on this
// page". Descriptors that resolved are recorded as they happen; when the user
// says the flow is good, they become a skill. See
// plans/partially-done/instruction-skills.md.

const MAX_RESOLUTIONS = 60;

// Pushed by the extension after a descriptor phase succeeds. A separate
// endpoint rather than PATCH: PATCH replaces whole fields, and two phases
// finishing close together would clobber each other's entries.
app.post('/tasks/:id/resolution', async (req, res) => {
  const b = req.body || {};
  const descriptor = cleanDescriptor(b.descriptor);
  if (!descriptor) return res.json({ ok: true, skipped: 'no descriptor' });
  const entry = {
    at: nowIso(),
    tool: String(b.tool || '').slice(0, 40),
    descriptor,
    matched: String(b.matched || '').slice(0, 120),
    selectorHint: String(b.selectorHint || '').slice(0, 200),
    depth: Number.isInteger(b.depth) ? b.depth : null,
    url: String(b.url || '').slice(0, 300),
  };
  await tasksColl().updateOne({ taskId: req.params.id }, {
    $push: { resolutions: { $each: [entry], $slice: -MAX_RESOLUTIONS } },
    $set: { updatedAt: nowIso() },
  });
  res.json({ ok: true });
});

function hostOfTask(task) {
  const nav = (task.plan?.phases || []).find((p) => p.tool === 'navigate' && p.params?.url);
  const fromRes = (task.resolutions || []).find((r) => r.url);
  const url = nav?.params?.url || fromRes?.url || '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// The ONE place an instruction skill is written. Merges into an existing skill
// of the same name+host rather than piling up duplicates: a hint that resolved
// again is confirmed, one that stopped resolving is replaced by whatever worked
// instead — so the skill improves each run instead of going stale.
async function saveInstructionSkill({ name, host, instructions, hints, taskId }) {
  const key = { host, name: String(name).trim(), kind: 'instruction' };
  const existing = await skillsColl().findOne(key, { projection: { _id: 0 } });

  // Dedupe by descriptor identity, newest wins.
  const idOf = (h) => `${h.descriptor?.by}:${JSON.stringify(h.descriptor?.value)}:${h.descriptor?.scope || 'page'}`;
  const merged = new Map((existing?.hints || []).map((h) => [idOf(h), h]));
  for (const h of hints) merged.set(idOf(h), { ...(merged.get(idOf(h)) || {}), ...h, uses: ((merged.get(idOf(h))?.uses) || 0) + 1 });
  const hintList = [...merged.values()].slice(-MAX_RESOLUTIONS);

  if (existing) {
    await skillsColl().updateOne({ skillId: existing.skillId }, {
      $set: { instructions, hints: hintList, updatedAt: nowIso(), provenance: { taskId, at: nowIso() } },
    });
    return { skill: { ...existing, instructions, hints: hintList }, merged: true };
  }
  const skill = {
    skillId: crypto.randomUUID(),
    host,
    urlPattern: `${host}/*`,
    name: String(name).trim(),
    kind: 'instruction',
    details: String(instructions).slice(0, 1200),
    instructions: String(instructions).slice(0, 4000),
    hints: hintList,
    provenance: { taskId, at: nowIso() },
    // Instruction skills carry NO element refs and NO selectors — that is the
    // whole point. Kept null so resolveSkills leaves them alone.
    elements: null, action: null, selectors: [], item: null, fields: [],
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  await skillsColl().insertOne({ ...skill });
  return { skill, merged: false };
}

// Promote THIS task's run into a skill. Only a run that actually finished:
// saving a failed flow records the wrong thing as if it were right.
app.post('/tasks/:id/save-as-skill', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  if (task.status !== 'done') {
    return res.status(400).json({ ok: false, error: `this run is "${task.status}", not done — only a run that completed can be saved as a skill` });
  }
  const instructions = String(req.body?.instructions || task.goal || '').trim();
  if (!instructions) return res.status(400).json({ ok: false, error: 'nothing to save — this session has no instruction' });

  const host = String(req.body?.host || hostOfTask(task) || '').trim();
  if (!host) return res.status(400).json({ ok: false, error: 'could not work out which site this flow is for — pass host' });

  const name = String(req.body?.name || '').trim() || defaultSkillName(instructions, host);
  const hints = (task.resolutions || []).map((r) => ({
    descriptor: r.descriptor, matched: r.matched, selectorHint: r.selectorHint, tool: r.tool, depth: r.depth,
  }));

  const { skill, merged } = await saveInstructionSkill({ name, host, instructions, hints, taskId: task.taskId });
  const msg = `${merged ? 'Updated' : 'Saved'} skill "${skill.name}" for ${host} — ${hints.length} element hint(s) from this run.`;
  await tasksColl().updateOne({ taskId: task.taskId }, {
    $push: {
      chat: { role: 'assistant', text: msg, at: nowIso(), round: task.round || 0 },
      events: { at: nowIso(), kind: 'ok', msg, round: task.round || 0, meta: { skillId: skill.skillId, merged } },
    },
    $set: { updatedAt: nowIso() },
  });
  res.json({ ok: true, skill, merged, message: msg });
});

function defaultSkillName(instructions, host) {
  const verb = (instructions.match(/\b(post|publish|share|send|message|comment|search|collect|apply|book|order|upload)\b/i) || [])[0];
  const site = host.split('.')[0];
  const label = `${site[0].toUpperCase()}${site.slice(1)} ${verb ? verb.toLowerCase() : 'flow'}`;
  return label.slice(0, 60);
}

app.post('/tasks/:id/rethink', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });

  const used = task.rethinks || 0;
  if (used >= MAX_RETHINKS) {
    return res.json({ ok: true, decision: { action: 'abort', reason: `Already rethought ${used} time(s) — stopping instead of looping.` } });
  }

  const { failedPhase, error, snapshot, phaseIndex, diagnosis } = req.body || {};

  // Never rethink an outward action whose outcome is unclear. A publish step is
  // only safe to retry when we have POSITIVE evidence nothing happened — the
  // draft still sitting in the composer, or the control never being found. Any
  // other publish failure aborts: repeating it risks double-posting, and asking
  // a model to judge that has already been observed to improvise instead.
  if (isPublishPhase(failedPhase)) {
    const nothingHappened = /still in the composer|no element|not found|no field|no editable/i.test(String(error || ''));
    if (!nothingHappened) {
      const reason = 'The publish step may already have gone through — stopping rather than risking a duplicate post.';
      await tasksColl().updateOne({ taskId: task.taskId }, {
        $push: { events: { at: nowIso(), kind: 'err', msg: reason, round: task.round || 0 } },
        $set: { updatedAt: nowIso() },
      });
      return res.json({ ok: true, decision: { action: 'abort', reason } });
    }
  }
  const remaining = (task.plan?.phases || []).slice(Number(phaseIndex) + 1);
  const done = (task.plan?.phases || []).slice(0, Number(phaseIndex));

  const view = (snapshot && typeof snapshot === 'object') ? snapshot : {};
  // Annotations use (parens), not [brackets]: a bracketed note next to a quoted
  // label got copied into params as if it were part of the selector.
  const controls = (view.controls || []).map((c) =>
    `- "${c.text}"${c.dialog ? ' (in dialog)' : ''}${c.disabled ? ' (disabled)' : ''}`).join('\n');
  const fields = (view.fields || []).map((f) =>
    `- "${f.text}"${f.dialog ? ' (in dialog)' : ''} (${f.filled ? 'has text' : 'empty'})`).join('\n');

  const sys = [
    'You are recovering a browser-automation task whose step just failed.',
    'You are shown the ORIGINAL goal, what already ran, the step that failed, and WHAT IS ACTUALLY ON THE PAGE right now.',
    'Decide what to do instead, using ONLY these tools:',
    TOOL_CATALOG.map((t) => `- ${t.name}(${t.params.join(', ')})`).join('\n'),
    '',
    'Reply with STRICT JSON only, no prose:',
    '{"action":"replace","reason":"<one short sentence>","phases":[{"tool":"...","params":{...}}]}',
    '  - "replace": run these phases INSTEAD of the failed step, then continue with the rest of the plan.',
    '  - {"action":"skip","reason":"..."} : the step is unnecessary; carry on.',
    '  - {"action":"abort","reason":"..."} : cannot be done; stop and tell the user.',
    '',
    'RULES:',
    '- Target things that appear in the page listing below — do NOT invent button text that is not there.',
    '- To target a control, put its EXACT quoted label in params.text — e.g. {"tool":"click","params":{"text":"Post"}}.',
    '- params.selector is for a real CSS selector ONLY (like "div[aria-label=\'Post\']"). If you do not have one, omit it.',
    '- "(in dialog)" / "(disabled)" are NOTES about an item, never part of its label — never put them in params.',
    '- Prefer a control marked (in dialog) when a dialog is open: that is the surface the task just opened.',
    '- If an action that changes something outward (posting, sending) may ALREADY have happened, do NOT repeat it — abort and say so.',
    '- Keep it to the fewest phases that recover the step.',
  ].join('\n');

  const user = [
    `GOAL: ${task.currentInstruction || task.goal}`,
    done.length ? `ALREADY RAN: ${done.map((p) => p.tool).join(' → ')}` : 'ALREADY RAN: (nothing)',
    `FAILED STEP: ${failedPhase?.tool}(${JSON.stringify(failedPhase?.params || {})})`,
    `ERROR: ${String(error || '').slice(0, 400)}`,
    remaining.length ? `REMAINING PLAN: ${remaining.map((p) => p.tool).join(' → ')}` : 'REMAINING PLAN: (none)',
    describeDiagnosis(diagnosis),
    '',
    `PAGE: ${view.title || ''} — ${view.url || ''}`,
    `A dialog is ${view.dialogOpen ? 'OPEN' : 'not open'}.`,
    controls ? `CLICKABLE ON SCREEN:\n${controls}` : 'CLICKABLE ON SCREEN: (none found)',
    fields ? `INPUT FIELDS ON SCREEN:\n${fields}` : '',
  ].filter(Boolean).join('\n');

  let decision = null;
  try {
    const raw = await askChat(task.model, [
      { role: 'system', content: sys }, { role: 'user', content: user },
    ], { temperature: 0.1, format: 'json' });
    decision = JSON.parse(String(raw).replace(/```json|```/g, '').trim());
  } catch (e) {
    decision = { action: 'abort', reason: 'Could not reach the model to rethink: ' + (e.message || e) };
  }

  decision = sanitizeDecision(decision, failedPhase);

  await tasksColl().updateOne({ taskId: task.taskId }, {
    $set: { rethinks: used + 1, updatedAt: nowIso() },
    $push: { events: {
      at: nowIso(), kind: 'think', round: task.round || 0,
      msg: `Rethinking after a failed step (${used + 1}/${MAX_RETHINKS}): ${decision.reason || decision.action}`,
      meta: { rethink: decision.action, phases: (decision.phases || []).map((p) => p.tool) },
    } },
  });

  res.json({ ok: true, decision });
});

// Does this look like a real CSS selector, or a button label the model dropped
// into the wrong field? A bare word like "Post" is a label; "div[aria-label]"
// is a selector. Guessing wrong either way just fails, so prefer treating an
// ambiguous value as text — findTarget can search by text, not by fake CSS.
function looksLikeSelector(s) {
  const v = String(s || '').trim();
  if (!v) return false;
  if (/\s/.test(v) && !/[.#[>~+:]/.test(v)) return false; // "What's on your mind" — a label
  return /[.#[\]>~+:=]/.test(v) || /^(a|p|div|span|button|input|form|textarea|li|ul|ol|h[1-6]|img|table|tr|td|section|nav|header|footer|main|article)$/i.test(v);
}

// Strip the annotations the model copies out of the page listing, and move a
// mis-filed label out of `selector` into `text`.
function cleanParams(params) {
  const p = liftDescriptor(params && typeof params === 'object' ? { ...params } : {});
  const clean = (v) => String(v).replace(/[[(](in dialog|disabled|has text|empty)[\])]/gi, '').replace(/^["'\s]+|["'\s]+$/g, '');

  if (typeof p.text === 'string') p.text = clean(p.text);
  if (typeof p.selector === 'string') {
    const sel = clean(p.selector);
    if (!sel) delete p.selector;
    else if (looksLikeSelector(sel)) p.selector = sel;
    else { if (!p.text) p.text = sel; delete p.selector; } // it was a label
  }
  if (p.text === '') delete p.text;
  p.descriptor = cleanDescriptor(p.descriptor);
  if (!p.descriptor) delete p.descriptor;
  return p;
}

// A descriptor the model produced is model output like any other: validated
// against the enum, not trusted. The precedent is the run that returned
// {selector:"Post", text:"[in dialog]"} — a label in the CSS field. A malformed
// descriptor reaching the finder searches for nonsense and reports a confusing
// miss, so drop it and let the phase fall back to selector/text.
const DESCRIPTOR_BY = new Set(['text', 'exactText', 'attr', 'placeholder', 'label', 'role', 'css']);

// Models emit the descriptor FLAT — `{"tool":"click","params":{"exactText":"Next"}}`
// instead of nesting it under `descriptor`. Observed on the first real run: the
// model picked exactly the right strategy and the wrong shape, so the phase
// executed with NO target at all, failed "no element for " four times over 15s,
// and dragged the task into a recovery that clicked the wrong things.
// Cheap to accept, so accept it.
function liftDescriptor(params) {
  if (!params || typeof params !== 'object' || params.descriptor) return params;
  let d = null;
  if (params.by && params.value != null) d = { by: params.by, value: params.value };
  else if (params.exactText != null) d = { by: 'exactText', value: params.exactText };
  else if (params.placeholder != null) d = { by: 'placeholder', value: params.placeholder };
  else if (params.label != null) d = { by: 'label', value: params.label };
  else if (params.contenteditable != null) d = { by: 'attr', attr: 'contenteditable', value: params.contenteditable };
  else if (params.attr && params.attrValue != null) d = { by: 'attr', attr: params.attr, value: params.attrValue };
  if (!d) return params;
  if (params.scope) d.scope = params.scope;
  if (params.tag) d.tag = params.tag;
  const out = { ...params, descriptor: d };
  for (const k of ['by', 'exactText', 'placeholder', 'label', 'contenteditable', 'attr', 'attrValue', 'scope', 'tag']) delete out[k];
  // `value` is a real param for `type`; only strip it when it fed the descriptor.
  if (params.by && params.value != null) delete out.value;
  return out;
}

function cleanDescriptor(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const by = String(d.by || '').trim();
  if (!DESCRIPTOR_BY.has(by)) return null;
  const strip = (v) => String(v).replace(/[[(](in dialog|disabled|has text|empty)[\])]/gi, '').replace(/^["'\s]+|["'\s]+$/g, '');
  // `value` is a string OR a list of alternates (localization); keep the shape.
  const raw = Array.isArray(d.value) ? d.value : [d.value];
  const value = raw.map(strip).filter(Boolean).slice(0, 5);
  if (!value.length) return null;

  const out = { by, value: value.length === 1 ? value[0] : value };
  if (d.tag && /^[a-z][a-z0-9]*$/i.test(String(d.tag))) out.tag = String(d.tag).toLowerCase();
  if (by === 'attr') out.attr = /^[a-z-]+$/i.test(String(d.attr || '')) ? String(d.attr) : 'contenteditable';
  const scope = String(d.scope || '').trim();
  if (scope === 'dialog' || scope === 'page' || scope.startsWith('within:')) out.scope = scope;
  return out;
}

// Never let a recovery decision introduce unknown tools or unbounded work.
function sanitizeDecision(d, failedPhase = null) {
  const known = new Set(TOOL_CATALOG.map((t) => t.name));
  const action = ['replace', 'skip', 'abort'].includes(d?.action) ? d.action : 'abort';
  const reason = String(d?.reason || '').slice(0, 300);
  if (action !== 'replace') return { action, reason: reason || 'no reason given' };
  let phases = (Array.isArray(d.phases) ? d.phases : [])
    .filter((p) => p && known.has(p.tool))
    .slice(0, 4)
    .map((p) => ({ tool: p.tool, params: cleanParams(p.params) }));

  // Recovering a PUBLISH step may only click something that looks like a
  // publish control. Recovering "click Post", the model clicked a carousel
  // arrow and then "React with Like to <user>'s post" — it LIKED the user's own
  // post while trying to publish. The page is full of controls whose text
  // contains "post"; only the ones that read as a publish verb are candidates.
  if (isPublishPhase(failedPhase)) {
    const targetOf = (p) => String(p.params?.text
      || (Array.isArray(p.params?.descriptor?.value) ? p.params.descriptor.value[0] : p.params?.descriptor?.value)
      || '').trim();
    const bad = phases.filter((p) => /^(click|hover)$/.test(p.tool) && !isPublishControlLabel(targetOf(p)));
    if (bad.length) {
      return {
        action: 'abort',
        reason: `Recovering the publish step suggested clicking ${bad.map((p) => `"${targetOf(p).trim()}"`).join(', ')}, which is not a publish control — stopping rather than clicking something else on your account.`,
      };
    }
  }
  if (!phases.length) return { action: 'abort', reason: reason || 'the model proposed no usable step' };
  return { action, reason, phases };
}

// Does this label read as a publish BUTTON rather than something else on the
// page that merely mentions posting?
//
// Containing the word is not enough — "React with Like to Minhaj Sorder's post"
// contains "post" as a whole word and is the Like button, which is exactly what
// got clicked. A real publish control is a short label that essentially IS the
// verb: "Post", "Share now", "Send". Length is the discriminator that separates
// them, because descriptive labels are long by nature.
const PUBLISH_WORD_RX = /\b(post|publish|share|send|tweet|submit)\b/i;

function isPublishControlLabel(label) {
  const s = String(label || '').trim();
  if (!s) return false;
  if (/^(post|publish|share|send|tweet|submit)$/i.test(s)) return true;   // exactly the verb
  return s.length <= 15 && PUBLISH_WORD_RX.test(s);                        // "Share now", "Post it"
}

// ---- feedback learning, phase 1: capture + storage --------------------------
// The user corrects the agent; the correction is stored WITH the round's context
// so it can later become a proposal (Tier 1) or a scoped lesson (Tier 2). Phase 1
// only CAPTURES — no behaviour change yet — so real examples accumulate before
// the risky retrieval/injection work. See plans/not-started/feedback-learning.md.
const feedbackColl = () => collFor('feedback');
const lessonsColl = () => collFor('lessons'); // phase 3: scoped guidance
const FEEDBACK_SCOPES = new Set(['host', 'skill', 'tool', 'task-type', 'global']);

// Build a feedback doc from a request body + the task's round context. Shared by
// the explicit 👎/👍 endpoint and the natural-language capture path (phase 4), so
// both store the SAME round-scoped context that makes feedback actionable later.
function buildFeedbackDoc(task, b) {
  const kind = b.kind === 'up' ? 'up' : b.kind === 'down' ? 'down' : 'note';
  const whatWrong = String(b.whatWrong || '').slice(0, 1000).trim();
  const scopeType = FEEDBACK_SCOPES.has(b.scope?.type) ? b.scope.type : 'global';
  const host = hostOfTask(task);
  // Feedback is on a SPECIFIC round, not the whole session (user's point,
  // 2026-07-20) — its instruction, its turns, its events.
  const round = Number.isInteger(b.round) ? b.round : (task.round || 0);
  const roundChat = (task.chat || []).filter((m) => (m.round || 0) === round);
  const roundEvents = (task.events || []).filter((e) => (e.round || 0) === round);
  const roundInstruction = roundChat.find((m) => m.role === 'user')?.text || (round === 0 ? task.goal : '');
  return {
    feedbackId: crypto.randomUUID(),
    taskId: task.taskId,
    round,
    messageAt: b.messageAt ? String(b.messageAt) : null,
    kind,
    whatWrong,
    whatExpected: String(b.whatExpected || '').slice(0, 1000).trim(),
    scope: { type: scopeType, value: String(b.scope?.value || (scopeType === 'host' ? host : '')).slice(0, 120) },
    context: {
      goal: String(task.goal || '').slice(0, 500),
      instruction: String(roundInstruction || '').slice(0, 500),
      host,
      plan: (task.plan?.phases || []).map((p) => p.tool),
      messages: roundChat.slice(-6).map((m) => ({ role: m.role, text: String(m.text || '').slice(0, 300) })),
      events: roundEvents.slice(-15).map((e) => ({ kind: e.kind, msg: String(e.msg || '').slice(0, 200) })),
    },
    status: 'open',
    source: b.source || 'button',   // 'button' (👎/👍) | 'nl' (typed correction)
    createdAt: nowIso(), updatedAt: nowIso(),
  };
}

// Store a feedback doc + add the round note. Returns the stored doc.
async function recordFeedback(task, b) {
  const feedback = buildFeedbackDoc(task, b);
  await feedbackColl().insertOne({ ...feedback });
  const noteMsg = feedback.kind === 'up' ? 'Marked this step as correct' : `Feedback noted: ${feedback.whatWrong.slice(0, 80)}`;
  await tasksColl().updateOne({ taskId: task.taskId }, {
    $push: { events: { at: nowIso(), kind: 'obs', msg: noteMsg, round: task.round || 0 } },
    $set: { updatedAt: nowIso() },
  });
  return feedback;
}

// Capture feedback on a round. The context (goal, the plan's tools, the last
// events, what was clicked/typed) is what makes it actionable later — a bare
// "that was wrong" with no context cannot be turned into a fix.
app.post('/tasks/:id/feedback', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  const b = req.body || {};
  const kind = b.kind === 'up' ? 'up' : b.kind === 'down' ? 'down' : 'note';
  if (kind !== 'up' && !String(b.whatWrong || '').trim()) {
    return res.status(400).json({ ok: false, error: 'whatWrong is required' });
  }
  const feedback = await recordFeedback(task, b);
  res.json({ ok: true, feedback });
});

// Review captured feedback (a page will list these). Filter by host or status.
app.get('/feedback', async (req, res) => {
  const q = {};
  if (req.query.host) q['context.host'] = String(req.query.host);
  if (req.query.status) q.status = String(req.query.status);
  const items = await feedbackColl().find(q, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(200).toArray();
  res.json({ ok: true, feedback: items });
});

app.delete('/feedback/:id', async (req, res) => {
  await feedbackColl().deleteOne({ feedbackId: req.params.id });
  res.json({ ok: true });
});

// Dismiss a feedback item without acting on it (review page). Kept separate from
// delete so the record survives for effectiveness tracking later.
app.post('/feedback/:id/dismiss', async (req, res) => {
  const r = await feedbackColl().updateOne({ feedbackId: req.params.id },
    { $set: { status: 'dismissed', updatedAt: nowIso() } });
  if (!r.matchedCount) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true });
});

// ---- feedback learning, phase 2: correction → approval-gated proposal --------
// The pure validation/proposal-building lives in ./feedback-triage.js so it can
// be unit tested without a model or DB. Here we only gather the candidates,
// run the model, and — if the triage is actionable — push a proposal onto the
// task exactly as a live recovery would, so it waits for the same approval gate.

// The skills/elements a correction on `host` could realistically point at.
// Compact + capped: a 7B has a small budget, and the decision is about names,
// not markup.
async function feedbackCandidates(host) {
  const h = String(host || '').replace(/^www\./, '');
  if (!h) return { elements: [], skills: [] };
  const elements = await elementsColl()
    .find({ host: h }, { projection: { _id: 0, elementId: 1, name: 1, type: 1, route: 1, details: 1 } })
    .limit(40).toArray();
  const skills = await skillsColl()
    .find({ $or: [{ host: h }, { urlPattern: new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }] },
      { projection: { _id: 0, skillId: 1, name: 1, kind: 1, elements: 1 } })
    .limit(20).toArray();
  return { elements, skills };
}

// Turn one feedback item into an approval-gated proposal (or record that it maps
// to nothing). Returns { status, ok, proposal?, error? } where status is an HTTP
// hint. Shared by the /analyze endpoint and the NL capture path (phase 4).
async function runFeedbackAnalysis(fb, requestedModel) {
  if (fb.kind === 'up') return { status: 400, ok: false, error: 'likes have nothing to fix' };
  const task = await tasksColl().findOne({ taskId: fb.taskId }, { projection: { round: 1, taskId: 1, model: 1 } });
  if (!task) return { status: 404, ok: false, error: 'the task this feedback came from is gone' };
  // Resolve 'auto'/empty to a real installed model, same as the planner does.
  const requested = String(requestedModel || task.model || '').trim();
  let model;
  try { model = (await resolveModel(requested, fb.whatWrong || '')).name; } catch { model = requested; }
  if (!model) return { status: 400, ok: false, error: 'no model to analyze with' };
  // Candidates power the data-fix kinds; a `lesson` needs none, so we run the
  // model even when the host has nothing learned yet.
  const candidates = await feedbackCandidates(fb.context?.host || '');

  let analysis;
  try {
    const messages = feedbackTriage.buildTriageMessages(fb, candidates);
    analysis = JSON.parse(await askChat(model, messages, { format: feedbackTriage.TRIAGE_FORMAT }));
  } catch (e) {
    return { status: 502, ok: false, error: 'could not analyze (is the model running?): ' + (e.message || e) };
  }

  const built = feedbackTriage.proposalFromAnalysis(analysis, candidates, fb);
  if (built.error) {
    await feedbackColl().updateOne({ feedbackId: fb.feedbackId },
      { $set: { status: 'triaged', analysis: { kind: analysis.kind || 'none', error: built.error }, updatedAt: nowIso() } });
    return { status: 200, ok: false, error: built.error, analysis: { kind: analysis.kind || 'none' } };
  }

  // Attach the proposal to the feedback's own task, so it surfaces in that
  // session's transcript and rides the existing approval → applyProposal path.
  const proposal = { proposalId: crypto.randomUUID(), status: 'pending', at: nowIso(), source: 'feedback', ...built.proposal };
  await tasksColl().updateOne({ taskId: task.taskId }, {
    $push: {
      proposals: proposal,
      events: { at: nowIso(), kind: 'think', round: task.round || 0, msg: `From your feedback: ${proposal.summary} (waiting for your approval)`, meta: { proposal: proposal.kind } },
    },
    $set: { updatedAt: nowIso() },
  });
  await feedbackColl().updateOne({ feedbackId: fb.feedbackId },
    { $set: { status: 'triaged', proposalId: proposal.proposalId, analysis: { kind: analysis.kind }, updatedAt: nowIso() } });
  return { status: 200, ok: true, proposal };
}

app.post('/feedback/:id/analyze', async (req, res) => {
  const fb = await feedbackColl().findOne({ feedbackId: req.params.id }, { projection: { _id: 0 } });
  if (!fb) return res.status(404).json({ ok: false, error: 'not found' });
  const r = await runFeedbackAnalysis(fb, req.body?.model);
  const { status, ...body } = r;
  res.status(status).json(body);
});

// Load the lessons matching `ctx` and return { block, ids }: the prompt block
// ('' if none) and the ids injected (so the round's outcome can be attributed to
// them — phase 4). Bumps each lesson's injectedCount. Shared by the planner and
// synthesize sites — never throws (a lesson lookup must not break planning).
async function injectLessons(ctx, heading) {
  try {
    const all = await lessonsColl()
      .find({ active: { $ne: false } }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 }).limit(200).toArray();
    const picked = lessons.selectLessons(all, ctx);
    if (!picked.length) return { block: '', ids: [] };
    const ids = picked.map((l) => l.lessonId);
    lessonsColl().updateMany({ lessonId: { $in: ids } },
      { $inc: { injectedCount: 1 }, $set: { lastInjectedAt: nowIso() } })
      .catch((e) => console.warn(`[injectLessons] injectedCount bump failed: ${e?.message || e}`));
    return { block: '\n\n' + lessons.formatLessons(picked, heading), ids };
  } catch (e) {
    // Never throws by contract — a lesson lookup must not break planning — but a
    // silent return made "my lessons stopped applying" undiagnosable.
    console.warn(`[injectLessons] ${e?.message || e}`);
    return { block: '', ids: [] };
  }
}

// Credit/debit the lessons injected during a round once it reaches a terminal
// state — the only cheap way to spot a lesson that HURTS. 'done' → success,
// 'error' → failure; 'stopped' is the user, not the lesson, so it counts as
// neither. Cleared after so a repeated terminal PATCH cannot double-count.
async function attributeLessonOutcome(task) {
  const a = lessons.attributionFor(task);
  if (!a) return;
  if (a.field) {
    await lessonsColl().updateMany({ lessonId: { $in: a.lessonIds } },
      { $inc: { [a.field]: 1 }, $set: { updatedAt: nowIso() } });
  }
  await tasksColl().updateOne({ taskId: task.taskId }, { $unset: { pendingLesson: '' } });
}

// Review/manage learned lessons (a page will list these).
app.get('/lessons', async (req, res) => {
  const q = {};
  if (req.query.host) q['scope.value'] = String(req.query.host).replace(/^www\./, '');
  if (req.query.active === '1') q.active = { $ne: false };
  const items = await lessonsColl().find(q, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(200).toArray();
  res.json({ ok: true, lessons: items });
});

app.delete('/lessons/:id', async (req, res) => {
  await lessonsColl().deleteOne({ lessonId: req.params.id });
  res.json({ ok: true });
});

// ---- agent-proposed changes to its own elements / skills ----
// The agent may PROPOSE creating, repointing or deleting the knowledge it runs
// on, but never writes it. Every proposal waits for explicit approval — this is
// the agent editing its own memory, which is a different matter from carrying
// out a task the user asked for.
// Non-blocking by design: the task keeps running; the proposal sits in the
// transcript until it is answered.
// `todo.add` / `routine.create` come from an explicit `/todo` or `/routine`
// chat command. They ride the SAME approval gate as everything else the agent
// wants to write, because "do this and save it as a todo" is genuinely
// ambiguous — the card is what asks whether to run it as well as save it.
const PROPOSAL_KINDS = new Set(['element.create', 'element.repoint', 'skill.update', 'skill.delete', 'lesson.create', 'todo.add', 'routine.create']);

app.post('/tasks/:id/propose', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { round: 1, taskId: 1 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  const { kind, summary, detail, payload } = req.body || {};
  if (!PROPOSAL_KINDS.has(kind)) return res.status(400).json({ ok: false, error: 'unknown proposal kind' });

  const proposal = {
    proposalId: crypto.randomUUID(),
    kind,
    summary: String(summary || kind).slice(0, 200),
    detail: String(detail || '').slice(0, 600),
    payload: payload && typeof payload === 'object' ? payload : {},
    status: 'pending',
    at: nowIso(),
  };
  await tasksColl().updateOne({ taskId: task.taskId }, {
    $push: {
      proposals: proposal,
      events: { at: nowIso(), kind: 'think', round: task.round || 0, msg: `Proposed: ${proposal.summary} (waiting for your approval)`, meta: { proposal: kind } },
    },
    $set: { updatedAt: nowIso() },
  });
  res.json({ ok: true, proposal });
});

app.post('/tasks/:id/proposals/:pid', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { _id: 0 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  const p = (task.proposals || []).find((x) => x.proposalId === req.params.pid);
  if (!p) return res.status(404).json({ ok: false, error: 'proposal not found' });
  if (p.status !== 'pending') return res.json({ ok: false, error: `already ${p.status}` });

  const approve = String(req.body?.decision || '').toLowerCase() === 'approve';
  let result = { ok: true };
  if (approve) {
    // `options.run` is the card's "Save and run now" button — the explicit
    // answer to the ambiguity, given by the user rather than guessed at.
    const opts = { run: !!req.body?.options?.run, task, auth: req.headers.authorization };
    try { result = await applyProposal(p, opts); } catch (e) { result = { ok: false, error: e.message || String(e) }; }
  }

  const status = !approve ? 'declined' : result.ok ? 'approved' : 'failed';
  const note = !approve ? `Declined: ${p.summary}`
    : result.ok ? `Applied: ${p.summary}`
    : `Could not apply "${p.summary}": ${result.error}`;

  await tasksColl().updateOne(
    { taskId: task.taskId, 'proposals.proposalId': p.proposalId },
    {
      $set: {
        'proposals.$.status': status,
        'proposals.$.decidedAt': nowIso(),
        'proposals.$.result': result.ok ? (result.summary || 'done') : String(result.error || 'failed'),
        updatedAt: nowIso(),
      },
      $push: { events: { at: nowIso(), kind: status === 'approved' ? 'ok' : 'obs', round: task.round || 0, msg: note } },
    }
  );
  res.json({ ok: result.ok, status, error: result.error });
});

// Carry out an APPROVED proposal. Kept in one place so nothing else can write
// element/skill records on the agent's behalf.
async function applyProposal(p, opts = {}) {
  const d = p.payload || {};

  // ---- chat-created todos / routines (phase 1 of chat-app-control) ---------
  // Both write through the SAME shapes the Todos page uses, so a chat-made
  // routine is indistinguishable from a hand-made one.
  if (p.kind === 'routine.create') {
    const instruction = String(d.instruction || '').trim();
    if (!instruction) return { ok: false, error: 'instruction required' };
    const routine = {
      routineId: crypto.randomUUID(),
      ...todos.cleanRoutine({
        name: d.name || 'Untitled routine',
        // ALWAYS manual: a routine that starts firing on a schedule because of
        // one typed sentence is exactly what the approval card exists to stop.
        // The user turns on a schedule in the Todos page, deliberately.
        trigger: 'manual',
        projectId: d.projectId || null,
        templates: [{ label: d.name || 'Step', instruction, mode: 'draft' }],
      }),
      lastMaterialisedDate: null,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    await routinesColl().insertOne({ ...routine });
    if (!opts.run) return { ok: true, summary: `saved routine "${routine.name}" (manual — run it from Todos)` };
    const r = await selfPost(`/routines/${routine.routineId}/run-now`, { scope: 'first', model: opts.task?.model || '' }, opts.auth);
    return r?.ok
      ? { ok: true, summary: `saved routine "${routine.name}" and started it` }
      : { ok: true, summary: `saved routine "${routine.name}" — could not start it (${r?.error || 'unknown'})` };
  }

  if (p.kind === 'todo.add') {
    const instruction = String(d.instruction || '').trim();
    if (!instruction) return { ok: false, error: 'instruction required' };
    const list = await chatTodoList(d.projectId || null);
    const item = {
      itemId: crypto.randomUUID(), templateId: null,
      label: String(d.name || instruction).slice(0, 80),
      instruction, inputId: null, values: {}, mode: 'draft', skillIds: [],
      runAt: null, status: 'todo', taskId: null, startedAt: null, finishedAt: null,
      note: '', reason: '', missing: todos.unfilledPlaceholders(instruction),
    };
    await todoListsColl().updateOne({ listId: list.listId }, { $push: { items: item }, $set: { updatedAt: nowIso() } });
    if (!opts.run) return { ok: true, summary: `added a todo — “${item.label}” (run it from Todos)` };
    const r = await selfPost(`/todolists/${list.listId}/items/${item.itemId}/run`, { model: opts.task?.model || '' }, opts.auth);
    return r?.ok
      ? { ok: true, summary: `added the todo and started it` }
      : { ok: true, summary: `added the todo — could not start it (${r?.error || 'unknown'})` };
  }
  if (p.kind === 'element.create') {
    if (!d.host || !d.name || !d.type) return { ok: false, error: 'host, name and type required' };
    if (!ELEMENT_TYPES.has(d.type)) return { ok: false, error: 'bad element type' };
    const host = String(d.host).replace(/^www\./, '');
    const element = {
      elementId: crypto.randomUUID(), host,
      route: normalizeRoute(d.route, host),
      name: await uniqueElementName(host, d.name),
      details: String(d.details || 'Proposed by the agent after recovering a failed step.'),
      type: d.type, action: d.action || null, attr: d.attr || null, key: d.key || null,
      parentId: null,
      selectors: Array.isArray(d.selectors) ? d.selectors : [],
      sample: d.sample || null, sampleHtml: null,
      version: 1, createdAt: nowIso(), updatedAt: nowIso(),
    };
    await elementsColl().insertOne(element);
    return { ok: true, summary: `created element "${element.name}" on ${host}` };
  }

  if (p.kind === 'element.repoint') {
    const el = await elementsColl().findOne({ elementId: d.elementId });
    if (!el) return { ok: false, error: 'element no longer exists' };
    const fresh = Array.isArray(d.selectors) ? d.selectors : [];
    if (!fresh.length) return { ok: false, error: 'selectors required' };
    // Same merge as /elements/:id/repoint: keep the old ones, demoted.
    const demoted = (el.selectors || []).map((s) => ({ ...s, score: Math.max(1, (s.score || 50) - 20) }));
    const seen = new Set();
    const merged = [...fresh, ...demoted].filter((s) => {
      const k = s.strategy + '|' + (s.value || s.text || '');
      if (seen.has(k)) return false; seen.add(k); return true;
    }).slice(0, 6);
    await elementsColl().updateOne({ elementId: el.elementId },
      { $set: { selectors: merged, version: (el.version || 1) + 1, updatedAt: nowIso() } });
    return { ok: true, summary: `repointed element "${el.name}"` };
  }

  if (p.kind === 'skill.update') {
    const set = {};
    for (const [k, v] of Object.entries(d.patch || {})) if (SKILL_PATCHABLE.has(k)) set[k] = v;
    if (!Object.keys(set).length) return { ok: false, error: 'nothing patchable in the proposal' };
    set.updatedAt = nowIso();
    const r = await skillsColl().updateOne({ skillId: d.skillId }, { $set: set });
    if (!r.matchedCount) return { ok: false, error: 'skill no longer exists' };
    return { ok: true, summary: `updated skill (${Object.keys(set).filter((k) => k !== 'updatedAt').join(', ')})` };
  }

  if (p.kind === 'skill.delete') {
    const r = await skillsColl().deleteOne({ skillId: d.skillId });
    if (!r.deletedCount) return { ok: false, error: 'skill no longer exists' };
    return { ok: true, summary: `deleted skill "${d.name || d.skillId}"` };
  }

  if (p.kind === 'lesson.create') {
    const text = String(d.text || '').trim();
    if (!text) return { ok: false, error: 'lesson text required' };
    const scope = {
      type: lessons.LESSON_SCOPES.has(d.scope?.type) ? d.scope.type : 'global',
      value: String(d.scope?.value || '').replace(/^www\./, '').slice(0, 120),
    };
    // Supersede (not accumulate) near-duplicate active lessons in the same scope.
    const sameScope = await lessonsColl()
      .find({ 'scope.type': scope.type, 'scope.value': scope.value, active: { $ne: false } }).toArray();
    const dead = lessons.supersededIds(sameScope, { text });
    if (dead.length) await lessonsColl().updateMany({ lessonId: { $in: dead } },
      { $set: { active: false, supersededAt: nowIso(), updatedAt: nowIso() } });
    const lesson = {
      lessonId: crypto.randomUUID(),
      text: text.slice(0, 300), scope, source: 'feedback',
      active: true, supersedes: dead, injectedCount: 0,
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    await lessonsColl().insertOne(lesson);
    const where = scope.type === 'global' ? 'everywhere' : (scope.value || scope.type);
    return { ok: true, summary: `learned a lesson for ${where}${dead.length ? ` (replaced ${dead.length})` : ''}` };
  }

  return { ok: false, error: 'unknown proposal kind' };
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
  const imageIds = (Array.isArray(req.body?.imageIds) ? req.body.imageIds : []).map(String).slice(0, MAX_IMAGES_PER_TURN);
  // An image on its own is a valid turn ("what is this?" is implied).
  if (!message && !imageIds.length) return res.status(400).json({ ok: false, error: 'message required' });

  // Busy → QUEUE it instead of rejecting. The prompt runs automatically when
  // the current round reaches a terminal status (see drainQueue).
  if (BUSY_STATUSES.has(task.status)) {
    const item = { id: crypto.randomUUID(), text: message, at: nowIso(), platform: String(req.body?.platform || ''), imageIds };
    const doc = await tasksColl().findOneAndUpdate(
      { taskId: task.taskId },
      {
        $push: { queue: item, events: { at: nowIso(), kind: 'think', msg: `Queued: ${message || `${imageIds.length} image(s)`}`, round: task.round || 0 } },
        $set: { updatedAt: nowIso() },
      },
      { returnDocument: 'after', projection: { _id: 0 } }
    );
    const t = doc?.value || doc;
    return res.json({ ok: true, mode: 'queued', queued: (t?.queue || []).length, item });
  }

  const out = await runChatTurn(task, message, req.body?.platform, imageIds);
  res.status(out.status || 200).json(out.body);
});

// One conversational turn. Returns { status?, body } rather than writing to a
// response, so the queue drainer can run a turn with no HTTP request in flight.
async function runChatTurn(task, message, platform, imageIds = []) {
  // Each user turn opens a new round; everything the backend/extension records
  // until the next user turn is stamped with this index (exact client grouping).
  const round = (task.round || 0) + 1;
  task.round = round;
  // Attachment metadata rides on the turn (id + name only) so the transcript can
  // render thumbnails; the bytes stay in task_files and are fetched by URL.
  let attachments = [];
  if (imageIds.length) {
    attachments = (await filesColl()
      .find({ fileId: { $in: imageIds }, taskId: task.taskId }, { projection: { _id: 0, fileId: 1, name: 1, mime: 1 } })
      .toArray());
  }
  const userTurn = { role: 'user', text: message, at: nowIso(), round, ...(attachments.length ? { attachments } : {}) };
  await tasksColl().updateOne({ taskId: task.taskId }, { $push: { chat: userTurn }, $set: { round, updatedAt: nowIso() } });
  task.chat = [...(task.chat || []), userTurn];

  // Keep the transcript small enough for a local model — compact automatically.
  if (task.chat.length > 24 || JSON.stringify(task.chat).length > 9000) await compactSession(task);

  // Explicit app command (/todo …, /routine …): save work for later instead of
  // doing it now. Checked FIRST, before every other route, because the whole
  // point is that the instruction inside it must NOT be executed — planning it
  // as a browse round is what would post to a live account while the "save
  // this" half of the sentence got silently dropped.
  const appCmd = appCommands.parseAppCommand(message);
  if (appCmd) {
    if (appCmd.error) {
      await tasksColl().updateOne({ taskId: task.taskId }, {
        $push: { chat: { role: 'assistant', text: appCmd.error, at: nowIso(), round } }, $set: { updatedAt: nowIso() },
      });
      return { body: { ok: false, error: appCmd.error } };
    }
    const proposal = await pushAppProposal(task, appCmd, round);
    return { body: { ok: true, mode: 'app-command', proposal } };
  }

  // Explicit host command (/run …): PROPOSE only — the desktop app confirms and
  // executes. Never touches browser state; never auto-triggered.
  const hostMatch = message.match(HOST_PREFIX_RX);
  if (hostMatch) {
    const instruction = message.slice(hostMatch[0].length).trim();
    if (!instruction) return { body: { ok: false, error: 'Say what to run after /run.' } };
    let proposal;
    try {
      proposal = await proposeHostCommand(task.model, instruction, String(platform || process.platform));
    } catch (e) {
      const msg = 'Could not propose a command (is the model running?). ' + (e.message || '');
      await tasksColl().updateOne({ taskId: task.taskId }, {
        $push: { chat: { role: 'assistant', text: msg, at: nowIso(), round } }, $set: { updatedAt: nowIso() },
      });
      return { body: { ok: false, error: msg } };
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
    return { body: { ok: true, mode: 'host', proposal } };
  }

  // Launch an installed app from a follow-up ("open chrome", "launch vscode").
  // Propose only — the desktop confirms + runs. Checked before browser routing
  // so "open chrome" is not planned as a navigate.
  const launchReq0 = detectLaunch(message);
  if (launchReq0) {
    // Phase 4: scope to the session's project launchable apps. The task only
    // snapshots {projectId,name,dir}, so fetch the project's settings.
    let projLaunchApps = [];
    if (task.project?.projectId) {
      const proj = await projectsColl().findOne({ projectId: task.project.projectId }, { projection: { 'settings.launchApps': 1 } });
      projLaunchApps = proj?.settings?.launchApps || [];
    }
    const scoped = scopeLaunchToProject(launchReq0, projLaunchApps);
    if (scoped.error) {
      await tasksColl().updateOne({ taskId: task.taskId }, {
        $push: { chat: { role: 'assistant', text: `🚫 ${scoped.error}`, at: nowIso(), round } },
        $set: { updatedAt: nowIso() },
      });
      return { body: { ok: true, mode: 'answer', reply: scoped.error } };
    }
    const launchReq = scoped.launch;
    const label = launchLabel(launchReq.appId, launchReq.profile, launchReq.url);
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $push: {
        chat: { role: 'assistant', text: `🚀 Launching **${label}**…`, at: nowIso(), round },
        events: { at: nowIso(), kind: 'think', msg: `Proposed launch: ${label}.`, round },
      },
      $set: { updatedAt: nowIso() },
    });
    return { body: { ok: true, mode: 'launch', proposal: { appId: launchReq.appId, profile: launchReq.profile || '', url: launchReq.url || '', label, title: label } } };
  }

  // Images attached to this turn → answer with a vision model. This runs before
  // routing: the answer is in the picture, not in session data or on the web.
  if (imageIds.length) {
    const files = await filesColl()
      .find({ fileId: { $in: imageIds }, taskId: task.taskId }).limit(MAX_IMAGES_PER_TURN).toArray();
    if (!files.length) return { body: { ok: false, error: 'Those images are no longer available.' } };

    const vm = await visionModel(task.model);
    if (!vm) {
      const msg = 'No vision-capable model is installed. Pull one first, e.g. `ollama pull llama3.2-vision` or `ollama pull qwen2.5vl`.';
      await tasksColl().updateOne({ taskId: task.taskId }, {
        $push: { chat: { role: 'assistant', text: msg, at: nowIso(), round } }, $set: { updatedAt: nowIso() },
      });
      return { body: { ok: false, error: msg } };
    }

    let reply = '';
    try {
      // Ollama takes images as bare base64 on the user message.
      reply = (await askChat(vm, [
        { role: 'system', content:
          'You are analyzing images the user uploaded. Describe exactly what you see and answer their question about it. '
          + 'Be concrete and specific — quote any text visible in the image verbatim. If the image does not show what they asked about, say so plainly instead of guessing.' },
        { role: 'user', content: message || 'Describe this image in detail.', images: files.map((f) => f.b64) },
      ], { temperature: 0.2 })).trim();
    } catch (e) {
      reply = '';
    }
    if (!reply) reply = `Could not get a reply from ${vm} — is Ollama running and the model pulled?`;

    const label = files.length > 1 ? `${files.length} images` : files[0].name;
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $push: {
        chat: { role: 'assistant', text: reply.slice(0, 8000), at: nowIso(), round },
        events: { at: nowIso(), kind: 'ok', msg: `Analyzed ${label} with ${vm}.`, round, meta: { vision: files.length, model: vm } },
      },
      $set: { updatedAt: nowIso() },
    });
    return { body: { ok: true, mode: 'vision', reply, model: vm, images: files.length } };
  }

  // "Save this flow as a skill" — write the agent's own memory from the run that
  // just happened. Checked BEFORE introspection and before routeChat: planning
  // this as a browser task would re-run the flow, which on a posting task means
  // posting again.
  if (isSaveSkillRequest(message)) {
    const reply = await saveSkillFromChat(task, message, round);
    return { body: { ok: true, mode: 'save_skill', reply } };
  }

  // A question about the agent's own skills/elements — answer from the DB.
  // Never plan a browser task for it: running a skill is not the same as
  // describing one.
  if (isIntrospection(message)) {
    const reply = await answerIntrospection(task.model, message);
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $push: {
        chat: { role: 'assistant', text: reply.slice(0, 8000), at: nowIso(), round },
        events: { at: nowIso(), kind: 'ok', msg: 'Answered from my own skills/elements — no browsing needed.', round },
      },
      $set: { updatedAt: nowIso() },
    });
    return { body: { ok: true, mode: 'introspect', reply } };
  }

  // Phase 4 — a typed correction ("no, that was wrong — you should have used my
  // skill"). Captured as feedback on the PREVIOUS round and turned into a fix
  // proposal, instead of being planned as a new browser task (which on a posting
  // task would post again). Strict detector + a guard that the previous round
  // actually did something, so an off-hand "that's not right" mid-chat is safe.
  const prevRound = round - 1;
  const prevRoundRan = (task.events || []).some((e) => (e.round || 0) === prevRound);
  if (prevRoundRan && feedbackTriage.isCorrectionMessage(message)) {
    const fb = await recordFeedback(task, { kind: 'down', round: prevRound, whatWrong: message, source: 'nl', scope: { type: 'host' } });
    let reply = "Got it — I've noted that as feedback on the previous step.";
    try {
      const r = await runFeedbackAnalysis(fb, task.model);
      if (r.ok && r.proposal) reply += ` I've suggested a fix to review: ${r.proposal.summary}`;
    } catch { /* analysis is best-effort; the feedback is already stored */ }
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $push: { chat: { role: 'assistant', text: reply, at: nowIso(), round } },
      $set: { updatedAt: nowIso() },
    });
    return { body: { ok: true, mode: 'feedback', reply } };
  }

  // "How many tabs are open?" — the extension CAN answer this via list_tabs
  // (chrome.tabs.query in its own Chrome; no content script, so no "Receiving
  // end" failure). Run a deterministic single-phase list_tabs round rather than
  // the canned launch-status answer or a guessed browser plan. metric:'actions'
  // completes after one pass (executeLoop never repeats it). Checked BEFORE the
  // launch-status branch so "is chrome open, how many tabs?" lists tabs.
  if (isTabQuestion(message)) {
    // No browser executor connected → don't dispatch a list_tabs round that would
    // hang forever; answer honestly (same as the launch-status branch below).
    if (!executorOnline()) {
      await tasksColl().updateOne({ taskId: task.taskId }, {
        $push: {
          chat: { role: 'assistant', text: CHROME_NOT_OPEN_REPLY, at: nowIso(), round },
          events: { at: nowIso(), kind: 'obs', msg: 'No browser executor connected — answered the tab question without listing tabs.', round },
        },
        $set: { updatedAt: nowIso() },
      });
      return { body: { ok: true, mode: 'answer' } };
    }
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $set: {
        currentInstruction: message,
        // `quiet`: list_tabs posts the tab list itself as the chat answer, so the
        // generic "Task complete" line should NOT also post to chat (executeLoop
        // reads this) — otherwise the completion noise buries the answer.
        plan: { target: { metric: 'actions', count: 1 }, phases: [{ tool: 'list_tabs', params: {} }], quiet: true },
        status: 'running', currentPhaseIndex: 0, repeats: 0, scanY: 0, pendingQuestion: null, updatedAt: nowIso(),
      },
      $push: {
        chat: { role: 'assistant', text: '🔎 Checking your open Chrome tabs…', at: nowIso(), round },
        events: { at: nowIso(), kind: 'act', msg: 'Listing open tabs (list_tabs).', round },
      },
    });
    return { body: { ok: true, mode: 'browse' } };
  }

  // "Did it open?" after a launch. A launch is fire-and-forget — the app starts
  // in a detached window we don't control, and the extension isn't present in a
  // freshly-launched Chrome profile — so this CANNOT be verified, and must not be
  // planned as a browser task (which clicks blindly in the wrong window: the real
  // failure that motivated this — "element 'Minhaj' not found / Receiving end
  // does not exist"). Answer honestly instead.
  if (sessionHasLaunch(task) && isLaunchStatusQuestion(message)) {
    const label = lastLaunchLabel(task);
    const reply = `I launched **${label}** on your machine, but I can't confirm from here whether the window actually opened. `
      + `I start apps in a detached process I don't keep a handle on, and I can't see into a freshly-launched Chrome profile — `
      + `so please check your screen. (Reading or driving a launched profile window isn't something I can do yet.)`;
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $push: {
        chat: { role: 'assistant', text: reply, at: nowIso(), round },
        events: { at: nowIso(), kind: 'obs', msg: 'Answered a launch-status question directly (a detached launch cannot be verified).', round },
      },
      $set: { updatedAt: nowIso() },
    });
    return { body: { ok: true, mode: 'answer', reply } };
  }

  const mode = await routeChat(task, message);

  // Second line of defence for the save request, same reasoning as introspect.
  if (mode === 'save_skill') {
    const reply = await saveSkillFromChat(task, message, round);
    return { body: { ok: true, mode: 'save_skill', reply } };
  }

  // Second line of defence: the classifier also recognises introspection, so a
  // phrasing the regex missed still gets answered instead of being planned as
  // a browser task that could run a posting skill.
  if (mode === 'introspect') {
    const reply = await answerIntrospection(task.model, message);
    await tasksColl().updateOne({ taskId: task.taskId }, {
      $push: {
        chat: { role: 'assistant', text: reply.slice(0, 8000), at: nowIso(), round },
        events: { at: nowIso(), kind: 'ok', msg: 'Answered from my own skills/elements — no browsing needed.', round },
      },
      $set: { updatedAt: nowIso() },
    });
    return { body: { ok: true, mode: 'introspect', reply } };
  }

  if (mode === 'answer') {
    const rows = await sessionRecords(task, 60);
    let reply = '';
    try {
      reply = (await askChat(task.model, [
        { role: 'system', content:
          'You are the assistant inside a browser-automation task session. Answer the user using ONLY the session context and collected data below. Be concise and concrete; use numbers from the data.\n'
          + 'IMPORTANT: if the collected data does not contain the answer — or the question needs current/live information from the web — reply with EXACTLY the single token NEEDS_WEB and nothing else. '
          + 'You have a browser and CAN look things up, so NEVER reply that you lack real-time data, lack internet access, or cannot browse: reply NEEDS_WEB instead and the system will search the web for you.\n\n'
          + `Original goal: ${task.goal}\n`
          + (task.sessionSummary ? `Session summary: ${task.sessionSummary}\n` : '')
          + `Collected records this session: ${rows.length}\n`
          + (rows.length ? `Data (JSON):\n${JSON.stringify(rows).slice(0, 9000)}` : 'No data collected yet.') },
        ...task.chat.slice(-11, -1).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        { role: 'user', content: message },
      ], { temperature: 0.2 })).trim();
    } catch (e) {
      console.warn(`[answerFromSession] model ${task.model}: ${e?.message || e}`);
    }
    if (!reply) reply = 'I could not reach the model to analyze the data — is Ollama running?';

    // The session data can't answer it → don't tell the user we lack real-time
    // data. We have a browser: escalate into a web-research round instead.
    // (Also catches models that ignore the NEEDS_WEB instruction and refuse.)
    const needsWeb = /\bNEEDS_WEB\b/i.test(reply)
      || /\b(don'?t|do not|doesn'?t) have (access to )?(real[\s-]?time|live|current|up[\s-]?to[\s-]?date)\b/i.test(reply)
      || /\b(cannot|can'?t) (browse|access the internet|search the web)\b/i.test(reply)
      || /\bno (access to the )?internet\b/i.test(reply);
    if (needsWeb) {
      await tasksColl().updateOne({ taskId: task.taskId }, {
        $set: {
          currentInstruction: message, plan: null, status: 'planning',
          currentPhaseIndex: 0, repeats: 0, scanY: 0, pendingQuestion: null, updatedAt: nowIso(),
        },
        $push: {
          chat: { role: 'assistant', text: '🌐 That is not in this session yet — searching the web…', at: nowIso(), round },
          events: { at: nowIso(), kind: 'act', msg: `Not answerable from session data → web research round: ${message}`, round },
        },
      });
      return { body: { ok: true, mode: 'browse', escalated: true } };
    }

    await tasksColl().updateOne({ taskId: task.taskId }, {
      $push: { chat: { role: 'assistant', text: reply.slice(0, 8000), at: nowIso(), round }, events: { at: nowIso(), kind: 'obs', msg: 'Chat: answered from session data.', round } },
      $set: { updatedAt: nowIso() },
    });
    return { body: { ok: true, mode: 'answer', reply } };
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
  return { body: { ok: true, mode: 'browse' } };
}

// Run queued prompts once the session goes idle. Loops because an "answer"
// turn finishes immediately (the next prompt can start right away); a "browse"
// turn leaves the task busy, so the loop exits and the drain resumes from the
// PATCH that later marks it done. IN_FLIGHT guards against two drains racing
// (the extension PATCHes terminal status more than once in some paths).
const DRAINING = new Set();
async function drainQueue(taskId) {
  if (DRAINING.has(taskId)) return;
  DRAINING.add(taskId);
  try {
    for (;;) {
      const task = await tasksColl().findOne({ taskId }, { projection: { _id: 0 } });
      if (!task || BUSY_STATUSES.has(task.status)) break;
      const next = (task.queue || [])[0];
      if (!next) break;
      await tasksColl().updateOne({ taskId }, {
        $pull: { queue: { id: next.id } },
        $push: { events: { at: nowIso(), kind: 'act', msg: `Running queued prompt: ${next.text}`, round: task.round || 0 } },
        $set: { updatedAt: nowIso() },
      });
      const fresh = await tasksColl().findOne({ taskId }, { projection: { _id: 0 } });
      if (!fresh) break;
      try {
        await runChatTurn(fresh, next.text, next.platform, next.imageIds || []);
      } catch (e) {
        await tasksColl().updateOne({ taskId }, {
          $push: { events: { at: nowIso(), kind: 'err', msg: `Queued prompt failed: ${e.message || e}`, round: fresh.round || 0 } },
          $set: { updatedAt: nowIso() },
        });
      }
    }
  } finally {
    DRAINING.delete(taskId);
  }
}

// Screenshots captured by the screenshot tool (kept out of the task doc — data
// URLs are large). Loaded on demand by the dashboard.
app.post('/tasks/:id/screenshot', async (req, res) => {
  const dataUrl = String(req.body?.dataUrl || '');
  if (!dataUrl.startsWith('data:image/')) return res.status(400).json({ ok: false, error: 'dataUrl required' });
  await collFor('task_shots').insertOne({ taskId: req.params.id, at: nowIso(), url: String(req.body?.url || ''), dataUrl: dataUrl.slice(0, 3_000_000) });
  res.json({ ok: true });
});

// ---- image attachments (vision) ----
// Kept in their OWN collection, never on the task doc: a few photos would blow
// past Mongo's 16MB document cap and every task read would drag them along.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES_PER_TURN = 4;
function filesColl() { return collFor('task_files'); }

app.post('/tasks/:id/attachments', async (req, res) => {
  const task = await tasksColl().findOne({ taskId: req.params.id }, { projection: { taskId: 1 } });
  if (!task) return res.status(404).json({ ok: false, error: 'not found' });
  const images = Array.isArray(req.body?.images) ? req.body.images.slice(0, MAX_IMAGES_PER_TURN) : [];
  if (!images.length) return res.status(400).json({ ok: false, error: 'images required' });

  const saved = [];
  for (const img of images) {
    const dataUrl = String(img?.dataUrl || '');
    const m = dataUrl.match(/^data:(image\/[a-z.+-]+);base64,(.+)$/i);
    if (!m) return res.status(400).json({ ok: false, error: 'each image needs a base64 image dataUrl' });
    const b64 = m[2];
    // base64 is 4 chars per 3 bytes — check the decoded size, not the string.
    if (Math.floor(b64.length * 0.75) > MAX_IMAGE_BYTES) {
      return res.status(413).json({ ok: false, error: `"${img?.name || 'image'}" is larger than 8MB.` });
    }
    const doc = {
      fileId: crypto.randomUUID(), taskId: task.taskId,
      name: String(img?.name || 'image').slice(0, 200),
      mime: m[1], b64, bytes: Math.floor(b64.length * 0.75), at: nowIso(),
    };
    await filesColl().insertOne(doc);
    saved.push({ fileId: doc.fileId, name: doc.name, mime: doc.mime, bytes: doc.bytes });
  }
  res.json({ ok: true, files: saved });
});

// Serve one attachment as a real image response so <img src> can point at it
// (embedding data URLs in the transcript would bloat every task fetch).
app.get('/tasks/:id/files/:fileId', async (req, res) => {
  const f = await filesColl().findOne({ fileId: req.params.fileId, taskId: req.params.id });
  if (!f) return res.status(404).end();
  res.set('Content-Type', f.mime).set('Cache-Control', 'private, max-age=86400');
  res.send(Buffer.from(f.b64, 'base64'));
});

app.get('/tasks/:id/screenshots', async (req, res) => {
  const shots = await collFor('task_shots').find({ taskId: req.params.id }, { projection: { _id: 0 } }).sort({ at: 1 }).toArray();
  res.json({ ok: true, shots });
});

app.post('/tasks/:id/event', async (req, res) => {
  const { kind, msg, meta, chat } = req.body || {};
  // Stamp the task's CURRENT round so the extension's execution events group
  // under the user turn that started them — no round tracking needed client-side
  // (round only changes on /chat, which is blocked while a task is running).
  const t = await tasksColl().findOne({ taskId: req.params.id }, { projection: { round: 1 } });
  const ev = { at: nowIso(), kind: kind || 'obs', msg: msg || '', round: t?.round || 0 };
  if (meta && typeof meta === 'object') ev.meta = meta;
  // `chat: true` also posts the message as an assistant turn. Used for the few
  // events the USER needs to see in the transcript (a round finishing, a round
  // failing) — the rest belong in the event log only, which is the detail view.
  const push = { events: ev };
  if (chat && msg) push.chat = { role: 'assistant', text: String(msg).slice(0, 4000), at: nowIso(), round: t?.round || 0 };
  await tasksColl().updateOne(
    { taskId: req.params.id },
    { $push: push, $set: { updatedAt: nowIso() } }
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
  // and field-subset logic see real field lists. When the user narrowed the
  // session to specific skills, only those go into the prompt — every extra
  // skill is prompt weight the model has to read and reason past.
  const pickedIds = (task.useSkills || []).map((s) => s.skillId).filter(Boolean);
  const skillQuery = pickedIds.length ? { skillId: { $in: pickedIds } } : {};
  const skills = await resolveSkills(await skillsColl().find(skillQuery, { projection: { _id: 0 } }).toArray());
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
  // Phase 3: scoped lessons the user taught through past feedback. Host-scoped +
  // global load here (the plan isn't built yet, so task-type/tool scopes match at
  // most weakly); capped hard by selectLessons so a 7B's budget is protected.
  const planLessons = await injectLessons({ host: hostOfTask(task) });
  sysExtra += planLessons.block;
  // Phase 4: remember which lessons shaped THIS round, to attribute its outcome
  // when it finishes (see attributeLessonOutcome in the terminal PATCH hook).
  if (planLessons.ids.length) {
    await tasksColl().updateOne({ taskId: task.taskId },
      { $set: { pendingLesson: { round: task.round || 0, lessonIds: planLessons.ids } } });
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

  const fixed = repairPlan(plan, instr, skills);
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
    // collect_links yields title + url; with read_pages each row also carries
    // the page's readable content (the source text used for analysis).
    if (!fields.length && plan.target.metric === 'links') {
      const reads = plan.phases.some((p) => p.tool === 'read_pages');
      fields = normFields([
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'url', label: 'URL', type: 'url' },
        ...(reads ? [{ key: 'text', label: 'Page content', type: 'text' }] : []),
      ]);
      chosen = reads ? 'researched sources' : 'search result links';
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
// ---- solve_with_code: write JS for the current page ----
// Small local models write poor raw-DOM code but decent code against a tiny,
// documented helper API. `BA` is that API; it is injected alongside the code.
const BA_API_DOC = [
  'BA.$(sel)            → first matching element, or null',
  'BA.$$(sel)           → array of matching elements',
  'BA.text(el)          → trimmed visible text of an element',
  'BA.attr(el, name)    → an attribute value',
  'BA.visible(el)       → true if the element is actually on screen',
  'BA.byText(t, sel)    → elements whose text contains t (sel defaults to *)',
].join('\n');

app.post('/ai/codegen', async (req, res) => {
  const { model, goal, expect, digest, attempts } = req.body || {};
  if (!model || !goal) return res.json({ ok: false, error: 'model and goal required' });

  const past = (Array.isArray(attempts) ? attempts : []).slice(-3).map((a, i) =>
    `ATTEMPT ${i + 1}:\n${String(a.code || '').slice(0, 700)}\nRESULT: ${String(a.error || a.note || 'did not satisfy the check').slice(0, 300)}`
  ).join('\n\n');

  const sys = [
    'You write a SHORT JavaScript snippet that runs on a web page and RETURNS data.',
    'Output ONLY the code — no markdown fences, no explanation, no function wrapper.',
    '',
    'Available helpers (prefer these over raw DOM):',
    BA_API_DOC,
    '',
    'RULES:',
    '- The last expression / an explicit `return` is the result. Return plain JSON-serializable data (arrays, objects, numbers, strings).',
    '- READ ONLY. Never click, type, submit, navigate, or modify the page. No .click(), no .value =, no location changes.',
    '- No network calls, no timers, no async/await — it must finish immediately.',
    '- Do not assume class names you have not seen; use the page structure shown below.',
    '- If several containers could match, prefer the one that yields the most complete rows.',
    past ? '- Previous attempts FAILED. Do something structurally DIFFERENT — do not repeat a failed selector.' : '',
  ].filter(Boolean).join('\n');

  const user = [
    `GOAL: ${goal}`,
    expect ? `SUCCESS MEANS: ${expect}` : '',
    '',
    'PAGE:',
    String(digest || '').slice(0, 6000),
    past ? `\nWHAT ALREADY FAILED:\n${past}` : '',
  ].filter(Boolean).join('\n');

  try {
    let code = await askChat(model, [
      { role: 'system', content: sys }, { role: 'user', content: user },
    ], { temperature: past ? 0.5 : 0.2 }); // hotter after a failure — force a different idea
    code = String(code).replace(/```[a-z]*\n?|```/gi, '').trim();
    if (!code) return res.json({ ok: false, error: 'model returned no code' });
    // Cheap static guard — the sandbox enforces this too, but failing here
    // costs nothing and gives the model a specific reason to try again.
    const banned = /\.(click|submit|focus)\s*\(|\.value\s*=|location\s*=|location\.(href|assign|replace)|fetch\s*\(|XMLHttpRequest|document\.write|innerHTML\s*=/;
    if (banned.test(code)) return res.json({ ok: false, error: 'generated code tried to modify the page or make a request (read-only tool)', code });
    res.json({ ok: true, code });
  } catch (e) {
    res.json({ ok: false, error: 'Ollama error: ' + e.message });
  }
});

// Judge whether a result satisfies `expect`. Deterministic checks happen in the
// extension; this is the judgement call the extension cannot make.
app.post('/ai/verify-code', async (req, res) => {
  const { model, goal, expect, sample } = req.body || {};
  if (!model) return res.json({ ok: false, error: 'model required' });
  try {
    const raw = await askChat(model, [
      { role: 'system', content:
        'Decide whether a result satisfies the requirement. Reply STRICT JSON: {"pass":true|false,"reason":"<short>","hint":"<what to change if it failed>"}. '
        + 'Be strict about emptiness and obviously wrong shapes, but do NOT demand more than the requirement asks for.' },
      { role: 'user', content: `GOAL: ${goal}\nSUCCESS MEANS: ${expect || 'a non-empty, sensible result'}\n\nRESULT SAMPLE:\n${String(sample || '').slice(0, 2500)}` },
    ], { temperature: 0, format: 'json' });
    const out = JSON.parse(String(raw).replace(/```json|```/g, '').trim());
    res.json({ ok: true, pass: !!out.pass, reason: String(out.reason || '').slice(0, 200), hint: String(out.hint || '').slice(0, 300) });
  } catch (e) {
    // Model unreachable — let the deterministic checks decide rather than block.
    res.json({ ok: true, pass: true, reason: 'verifier unavailable; accepted on deterministic checks' });
  }
});

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
// User-defined data schemas. Collected data for EVERY schema lives in the one
// shared `records` collection; each doc references its schema and keeps the
// field values under `result`:
//   { schemaId, _taskId, _sourceUrl, result: {…fields}, createdAt, updatedAt }
// The HTTP API still speaks flat records (field keys at the top level next to
// _taskId/_sourceUrl) — wrapping/unwrapping happens here, so the extension and
// desktop app are unaffected.

const schemasColl = () => collFor('schemas');
const recordsColl = () => collFor('records');

// Meta keys that stay at the doc top level; everything else is schema data.
const RECORD_META = new Set(['_taskId', '_sourceUrl']);

// flat record → stored doc shape
function wrapRecord(schemaId, r) {
  const result = {};
  const meta = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === '_id') continue;
    if (RECORD_META.has(k)) meta[k] = v; else result[k] = v;
  }
  return { schemaId, ...meta, result };
}

// stored doc → flat record the clients expect
const unwrapRecord = (d) => {
  const { _id, schemaId, result, createdAt, updatedAt, ...meta } = d;
  return { ...(result || {}), ...meta };
};

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
  if (metric === 'links') {
    return normFields([{ key: 'title', label: 'Title', type: 'text' }, { key: 'url', label: 'URL', type: 'url' }]);
  }
  return normFields([{ key: 'name', label: 'Name', type: 'text' }, { key: 'url', label: 'URL', type: 'url' }]);
}

// Create + persist a schema. Returns the schema doc, or null if no valid
// fields. Shared by the API and the planner's auto-create.
async function createSchemaDoc(name, fields) {
  const cleanFields = normFields(fields);
  if (!cleanFields.length) return null;
  let slug = slugify(name || 'schema');
  if (await schemasColl().findOne({ slug })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const schema = {
    schemaId: crypto.randomUUID(),
    name: (String(name).trim() || slug),
    slug,
    fields: cleanFields,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await schemasColl().insertOne({ ...schema });
  return schema;
}

const schemaSnapshot = (s) => ({ schemaId: s.schemaId, name: s.name, slug: s.slug, fields: s.fields });

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
    await recordsColl().deleteMany({ schemaId: schema.schemaId });
  }
  res.json({ ok: true });
});

// Records for a schema (optionally scoped to a task).
app.get('/schemas/:id/records', async (req, res) => {
  const schema = await schemasColl().findOne({ schemaId: req.params.id });
  if (!schema) return res.status(404).json({ ok: false, error: 'not found' });
  const q = { schemaId: schema.schemaId };
  if (req.query.taskId) q._taskId = req.query.taskId;
  const docs = await recordsColl().find(q).limit(1000).toArray();
  res.json({ ok: true, records: docs.map(unwrapRecord), fields: schema.fields });
});

// Upsert records for a schema into the shared `records` collection
// (dedup by _sourceUrl within the schema, when present).
app.post('/schemas/:id/records', async (req, res) => {
  const schema = await schemasColl().findOne({ schemaId: req.params.id });
  if (!schema) return res.status(404).json({ ok: false, error: 'not found' });
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  const coll = recordsColl();
  let added = 0, updated = 0;
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    const doc = wrapRecord(schema.schemaId, r);
    if (doc._sourceUrl) {
      const u = await coll.updateOne(
        { schemaId: schema.schemaId, _sourceUrl: doc._sourceUrl },
        { $set: { ...doc, updatedAt: nowIso() }, $setOnInsert: { createdAt: nowIso() } },
        { upsert: true }
      );
      if (u.upsertedCount) added++; else updated++;
    } else {
      await coll.insertOne({ ...doc, createdAt: nowIso(), updatedAt: nowIso() });
      added++;
    }
  }
  const total = await coll.countDocuments({ schemaId: schema.schemaId });
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
    } catch (e) {
      console.warn(`[llmRefineNames] model ${d.model}: ${e?.message || e}`);
    }
  }
  res.json({ ok: true, skill, changes });
});

// Last middleware: turn an error into JSON. Without this a rejected CORS origin
// (which throws inside the cors middleware) came back as Express's default HTML
// 500 page, so a caller saw a parse error instead of the actual reason.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const cors = /origin .* is not allowed/.test(err?.message || '');
  if (!cors) console.error('[unhandled]', err?.message || err);
  res.status(cors ? 403 : 500).json({ ok: false, error: err?.message || 'internal error' });
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
