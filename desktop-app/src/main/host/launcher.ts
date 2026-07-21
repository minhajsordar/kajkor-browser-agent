import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { userDataDir } from '../embedded/paths'
import { createLogger } from '../utils/logger'
import { APP_REGISTRY, isKnownApp, knownApps, resolveLaunch, type Platform } from './launch-registry'

const log = createLogger('Launch')

// Apps the user has approved to launch WITHOUT a prompt ("always allow this
// app"). Confirm-first-time (user's choice): an app not in this list needs an
// explicit approval for the launch to proceed. Kept separate from the CLI
// host-allowlist — launching a GUI app and running a shell command are
// different trust decisions.
function rememberedFile(): string {
  return path.join(userDataDir(), 'launch-allowlist.json')
}

export function getRememberedApps(): string[] {
  try {
    const f = rememberedFile()
    if (fs.existsSync(f)) {
      const a = JSON.parse(fs.readFileSync(f, 'utf8'))
      if (Array.isArray(a)) return a.map((s) => String(s).toLowerCase())
    }
  } catch {
    /* fall back to empty */
  }
  return []
}

export function setRememberedApps(list: string[]): string[] {
  const clean = [...new Set((list || []).map((s) => String(s).trim().toLowerCase()).filter(isKnownApp))]
  try {
    fs.writeFileSync(rememberedFile(), JSON.stringify(clean, null, 2))
  } catch (e) {
    log.error('setRememberedApps failed', { message: (e as Error).message })
  }
  return clean
}

export function rememberApp(appId: string): void {
  const id = String(appId || '').toLowerCase()
  if (!isKnownApp(id)) return
  const list = getRememberedApps()
  if (!list.includes(id)) setRememberedApps([...list, id])
}

export interface LaunchRequest {
  appId: string
  args?: string[]
  profileDir?: string
  // The renderer sets this once the user has confirmed a first-time launch.
  approved?: boolean
}
export interface LaunchOutcome {
  ok: boolean
  launched?: boolean
  needsConfirm?: boolean
  app?: string
  error?: string
}

// Launch a registered GUI app, DETACHED — success means "it started", not "it
// exited". A GUI app never exits on its own and produces no stdout, so waiting
// (as runHostCommand does) would report a timeout for a fine launch.
export function launchApp(req: LaunchRequest): LaunchOutcome {
  const id = String(req.appId || '').toLowerCase()
  if (!isKnownApp(id)) {
    return { ok: false, error: `"${req.appId}" is not a known app. Known: ${knownApps().map((a) => a.id).join(', ')}.` }
  }

  const resolved = resolveLaunch(id, { args: req.args, profileDir: req.profileDir }, {
    platform: process.platform as Platform,
    env: process.env,
    exists: (p) => {
      try {
        return fs.existsSync(p)
      } catch {
        return false
      }
    }
  })
  if ('error' in resolved) return { ok: false, error: resolved.error }

  // Confirm-first-time gate: an un-remembered app needs the renderer to confirm.
  if (!req.approved && !getRememberedApps().includes(id)) {
    return { ok: false, needsConfirm: true, app: resolved.app }
  }

  try {
    const child = spawn(resolved.argv[0], resolved.argv.slice(1), {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    child.unref()
    log.info('Launched app', { app: resolved.app, argv: resolved.argv })
    return { ok: true, launched: true, app: resolved.app }
  } catch (e) {
    return { ok: false, error: (e as Error).message, app: resolved.app }
  }
}

// Chrome's profile display names, so a user (or the model) can say "the Work
// profile" and we map it to its "Profile N" directory. Reads Chrome's own
// Local State — we do NOT guess directory names.
export interface ChromeProfile {
  dir: string
  name: string
}
function chromeUserDataDir(): string | null {
  const home = os.homedir()
  if (process.platform === 'win32') {
    const base = process.env.LocalAppData || path.join(home, 'AppData', 'Local')
    return path.join(base, 'Google', 'Chrome', 'User Data')
  }
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome')
  return path.join(home, '.config', 'google-chrome')
}

export function listChromeProfiles(): ChromeProfile[] {
  try {
    const dir = chromeUserDataDir()
    if (!dir) return []
    const local = path.join(dir, 'Local State')
    if (!fs.existsSync(local)) return []
    const state = JSON.parse(fs.readFileSync(local, 'utf8'))
    const cache = state?.profile?.info_cache || {}
    return Object.entries(cache).map(([d, info]) => ({
      dir: d,
      name: String((info as { name?: string })?.name || d)
    }))
  } catch (e) {
    log.error('listChromeProfiles failed', { message: (e as Error).message })
    return []
  }
}

export { APP_REGISTRY, knownApps }
