// API integration harness. Boots a SECOND backend instance (default port 4010 —
// never the user's 34730), waits for /health, runs the api-*.js suites against
// it, then shuts it down. The suites delete every document they create, but
// they DO write to the real shared Mongo — that is the point of the exercise.
//
// Requires MONGODB_URI in the environment (the backend refuses to boot without
// it). Run with: npm run test:api
const { spawn, spawnSync } = require('child_process');
const path = require('path');

const PORT = process.env.API_TEST_PORT || '4010';
const BASE = `http://127.0.0.1:${PORT}`;
const SUITES = ['api-app-commands.js', 'api-todos.js'];

if (!process.env.MONGODB_URI) {
  console.error('test:api needs MONGODB_URI — the suites write to (and clean up) the real shared DB.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealthy(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`);
      const body = await r.json();
      if (body.ok && body.db) return true;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  return false;
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  server.stdout.on('data', () => {}); // drain so the child cannot block on a full pipe

  let code = 1;
  try {
    if (!(await waitHealthy())) {
      console.error(`backend did not become healthy on ${BASE} within 20s`);
    } else {
      code = 0;
      for (const suite of SUITES) {
        console.log(`\n=== ${suite} ===`);
        const r = spawnSync(process.execPath, [path.join(__dirname, suite)], {
          env: { ...process.env, BASE },
          stdio: 'inherit',
        });
        if (r.status !== 0) code = r.status || 1;
      }
    }
  } finally {
    server.kill();
  }
  process.exit(code);
})().catch((e) => { console.error('run-api crashed', e); process.exit(1); });
