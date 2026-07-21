import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { serverBundlePath, userDataDir } from './paths'
import { waitForHttp } from './util'
import { createLogger } from '../utils/logger'

const log = createLogger('Server')

// Fixed port so the Chrome extension (which polls a configured BACKEND_URL) can
// find the embedded backend without discovery. Overridable via BA_PORT.
export const EMBEDDED_PORT = Number(process.env.BA_PORT) || 34730

let started = false
let serverPort: number | null = null

// Persist a JWT signing secret in userData so tokens survive restarts. In dev
// the standalone backend uses its own AUTH_SECRET; this only applies when the
// desktop app boots the server itself (packaged builds).
function loadOrCreateAuthSecret(): string {
  const f = path.join(userDataDir(), 'auth-secret')
  try {
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim()
  } catch {
    /* fall through to regenerate */
  }
  const s = crypto.randomBytes(48).toString('hex')
  fs.writeFileSync(f, s, { mode: 0o600 })
  return s
}

export interface ServerStartOptions {
  // Remote (shared) MongoDB URI. When omitted the backend's own default
  // (the shared cluster) is used.
  mongoUri?: string
  dbName?: string
  port?: number
}

// Optional per-install overrides: a packaged app can be repointed at a
// different Mongo (or given an AUTH_SECRET) by dropping a backend-config.json
// in userData — no rebuild. Explicit ServerStartOptions still win.
function loadInstallConfig(): { mongoUri?: string; dbName?: string; authSecret?: string } {
  try {
    const f = path.join(userDataDir(), 'backend-config.json')
    if (fs.existsSync(f)) {
      const c = JSON.parse(fs.readFileSync(f, 'utf8'))
      return {
        mongoUri: c.mongoUri || c.MONGODB_URI,
        dbName: c.dbName || c.MONGODB_DB,
        authSecret: c.authSecret || c.AUTH_SECRET
      }
    }
  } catch {
    /* ignore malformed config */
  }
  return {}
}

// Boot the Browser Agent backend in-process. server.js reads PORT / MONGODB_URI
// at module load and calls app.listen(), so every env var must be set BEFORE the
// require. Resolves once /health responds.
export async function startServer(opts: ServerStartOptions = {}): Promise<number> {
  if (started && serverPort) return serverPort

  const bundle = serverBundlePath()
  if (!fs.existsSync(bundle)) {
    throw new Error(`Backend not found at ${bundle}. In a packaged build, run the server bundle step.`)
  }

  const cfg = loadInstallConfig()
  const port = opts.port || EMBEDDED_PORT
  process.env.PORT = String(port)
  const mongoUri = opts.mongoUri || cfg.mongoUri
  const dbName = opts.dbName || cfg.dbName
  if (mongoUri) process.env.MONGODB_URI = mongoUri
  if (dbName) process.env.MONGODB_DB = dbName
  process.env.AUTH_SECRET = process.env.AUTH_SECRET || cfg.authSecret || loadOrCreateAuthSecret()

  log.info('Starting embedded Browser Agent backend', { port, bundle })

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(bundle)

  await waitForHttp(`http://127.0.0.1:${port}/health`, 30000)
  started = true
  serverPort = port
  log.info('Backend ready', { port })
  return port
}

export function getServerPort(): number | null {
  return serverPort
}
