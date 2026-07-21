// Curated app registry + pure launch RESOLVER for the host launcher.
//
// This file has NO node imports on purpose: it is the pure core (registry +
// resolveLaunch), so it can be unit-tested in isolation across all three
// platforms without spawning anything. The side-effecting parts (spawn, fs,
// allowlist persistence) live in launcher.ts.
//
// Design decisions (see plans/partially-done/host-launch-tools.md):
// - The model may ONLY pick an appId from this registry — never a raw path.
// - Chrome/Edge accept --profile-directory; that is how "open Chrome with the
//   Work profile" works. Other browsers' profile flags differ and are out of v1.

export type Platform = 'win32' | 'darwin' | 'linux'

export interface WinSpec {
  // Candidate executables, tried in order. May contain ${ENV} placeholders.
  // A candidate WITH a path separator is used only if it exists on disk; a bare
  // name (e.g. "explorer.exe", "code") is assumed resolvable on PATH.
  candidates: string[]
}
export interface MacSpec {
  // App display name for `open -a "<app>"`, OR a bare binary for direct spawn.
  app?: string
  bin?: string
}
export interface LinuxSpec {
  // Binary names tried on PATH, in order; else the .desktop id via gtk-launch.
  bin?: string[]
  desktop?: string
}
export interface AppSpec {
  label: string
  win?: WinSpec
  mac?: MacSpec
  linux?: LinuxSpec
  // Accepts Chrome-style --profile-directory=<dir>.
  chromeProfiles?: boolean
}

export const APP_REGISTRY: Record<string, AppSpec> = {
  chrome: {
    label: 'Google Chrome',
    chromeProfiles: true,
    win: {
      candidates: [
        '${ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe',
        '${ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe',
        '${LocalAppData}\\Google\\Chrome\\Application\\chrome.exe'
      ]
    },
    mac: { app: 'Google Chrome' },
    linux: { bin: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'] }
  },
  edge: {
    label: 'Microsoft Edge',
    chromeProfiles: true,
    win: {
      candidates: [
        '${ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe',
        '${ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe'
      ]
    },
    mac: { app: 'Microsoft Edge' },
    linux: { bin: ['microsoft-edge', 'microsoft-edge-stable'] }
  },
  firefox: {
    label: 'Mozilla Firefox',
    win: {
      candidates: ['${ProgramFiles}\\Mozilla Firefox\\firefox.exe', '${ProgramFiles(x86)}\\Mozilla Firefox\\firefox.exe']
    },
    mac: { app: 'Firefox' },
    linux: { bin: ['firefox'] }
  },
  vscode: {
    label: 'Visual Studio Code',
    win: { candidates: ['${LocalAppData}\\Programs\\Microsoft VS Code\\Code.exe', 'code'] },
    mac: { app: 'Visual Studio Code' },
    linux: { bin: ['code'] }
  },
  explorer: {
    label: 'File Explorer',
    win: { candidates: ['explorer.exe'] },
    mac: { app: 'Finder' },
    // NOT xdg-open — that opens a given file, it does not launch a file manager
    // with no target. Real managers, tried in order (bare names resolved on PATH).
    linux: { bin: ['nautilus', 'dolphin', 'thunar', 'pcmanfm'] }
  },
  notepad: {
    label: 'Text Editor',
    win: { candidates: ['notepad.exe'] },
    mac: { app: 'TextEdit' },
    linux: { bin: ['gedit', 'gnome-text-editor'] }
  },
  terminal: {
    label: 'Terminal',
    win: { candidates: ['wt.exe', 'cmd.exe'] },
    mac: { app: 'Terminal' },
    linux: { bin: ['gnome-terminal', 'konsole', 'x-terminal-emulator'] }
  }
}

export interface LaunchDeps {
  platform: Platform
  env: Record<string, string | undefined>
  exists: (p: string) => boolean
}
export interface LaunchResolved {
  argv: string[]
  app: string
}
export interface LaunchError {
  error: string
}

export function isKnownApp(appId: string): boolean {
  return Object.prototype.hasOwnProperty.call(APP_REGISTRY, String(appId || '').toLowerCase())
}

export function knownApps(): { id: string; label: string }[] {
  return Object.entries(APP_REGISTRY).map(([id, s]) => ({ id, label: s.label }))
}

// A Chrome profile directory name is untrusted (it can come from the model).
// spawn(shell:false) already blocks shell injection, but a value like
// "--foo" would inject a SECOND Chrome flag, so restrict it hard.
export function isValidProfileDir(dir: string): boolean {
  const d = String(dir || '')
  return /^[A-Za-z0-9 ._-]+$/.test(d) && !d.startsWith('-')
}

function expandEnv(tpl: string, env: Record<string, string | undefined>): string {
  return tpl.replace(/\$\{([^}]+)\}/g, (_m, name) => env[name] ?? '')
}

function hasSep(p: string): boolean {
  return p.includes('/') || p.includes('\\')
}

// Pick the first usable Windows/Linux candidate: an absolute-ish path is usable
// only if it exists; a bare command name is assumed on PATH.
function pickCandidate(candidates: string[], deps: LaunchDeps): string | null {
  for (const raw of candidates) {
    const c = expandEnv(raw, deps.env)
    if (!c || /\$\{/.test(c)) continue // an env var was missing → skip
    if (hasSep(c)) {
      if (deps.exists(c)) return c
    } else {
      return c // bare name — rely on PATH
    }
  }
  return null
}

// Resolve an appId to a concrete argv for the current platform. Pure: all I/O is
// injected via deps, so this is fully unit-testable.
export function resolveLaunch(
  appId: string,
  opts: { args?: string[]; profileDir?: string },
  deps: LaunchDeps
): LaunchResolved | LaunchError {
  const id = String(appId || '').toLowerCase()
  const spec = APP_REGISTRY[id]
  if (!spec) return { error: `"${appId}" is not a known app. Known: ${Object.keys(APP_REGISTRY).join(', ')}.` }

  const extraArgs = (opts.args || []).map((a) => String(a)).filter((a) => a && !a.startsWith('-'))
  let profileArgs: string[] = []
  if (opts.profileDir) {
    if (!spec.chromeProfiles) return { error: `${spec.label} does not support profile selection here.` }
    if (!isValidProfileDir(opts.profileDir)) return { error: `Invalid profile name "${opts.profileDir}".` }
    profileArgs = [`--profile-directory=${opts.profileDir}`]
  }

  if (deps.platform === 'win32') {
    if (!spec.win) return { error: `${spec.label} has no Windows launcher configured.` }
    const exe = pickCandidate(spec.win.candidates, deps)
    if (!exe) return { error: `${spec.label} was not found on this machine.` }
    return { argv: [exe, ...profileArgs, ...extraArgs], app: spec.label }
  }

  if (deps.platform === 'darwin') {
    if (!spec.mac) return { error: `${spec.label} has no macOS launcher configured.` }
    if (spec.mac.bin) return { argv: [spec.mac.bin, ...profileArgs, ...extraArgs], app: spec.label }
    // `open -a "<App>"`; flags/args after --args are passed to the app.
    const tail = [...profileArgs, ...extraArgs]
    const argv = ['open', '-a', spec.mac.app as string, ...(tail.length ? ['--args', ...tail] : [])]
    return { argv, app: spec.label }
  }

  // linux
  if (!spec.linux) return { error: `${spec.label} has no Linux launcher configured.` }
  const bin = spec.linux.bin ? pickCandidate(spec.linux.bin, deps) : null
  if (bin) return { argv: [bin, ...profileArgs, ...extraArgs], app: spec.label }
  if (spec.linux.desktop) return { argv: ['gtk-launch', spec.linux.desktop], app: spec.label }
  return { error: `${spec.label} was not found on this machine.` }
}
