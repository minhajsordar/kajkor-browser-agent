// Bundles ../backend/server.js -> resources/server/server.cjs (same options as
// the old esbuild CLI one-liner, plus build-time config injection).
//
// MONGODB_URI — taken from ../backend/.env or the environment — is baked into
// the bundle as EMBEDDED_MONGODB_URI. That is a DEFAULT only: at runtime an
// explicit MONGODB_URI or backend-config.json mongoUri in userData still wins.
// The URI lives in the local .env (gitignored) and the shipped bundle — never
// in committed source.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

function readEnvFile(file) {
  const out = {};
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env */ }
  return out;
}

const mongoUri = process.env.MONGODB_URI
  || readEnvFile(path.join(__dirname, '..', '..', 'backend', '.env')).MONGODB_URI;
if (!mongoUri) {
  console.warn('[build-server] no MONGODB_URI in env or ../backend/.env — the packaged app will need backend-config.json in userData to boot.');
}

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '..', '..', 'backend', 'server.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: path.join(__dirname, '..', 'resources', 'server', 'server.cjs'),
  format: 'cjs',
  external: [
    'mongodb-client-encryption', 'aws4', 'kerberos', '@mongodb-js/zstd',
    'snappy', 'bson-ext', 'gcp-metadata', 'socks', '@aws-sdk/*',
  ],
  define: mongoUri ? { EMBEDDED_MONGODB_URI: JSON.stringify(mongoUri) } : {},
});

console.log(`[build-server] wrote resources/server/server.cjs${mongoUri ? ' (MONGODB_URI default baked in)' : ''}`);
