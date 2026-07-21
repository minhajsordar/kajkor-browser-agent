import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { userDataDir } from '../embedded/paths'
import { createLogger } from '../utils/logger'

const log = createLogger('Host')

// Only programs on this list may run. Kept deliberately conservative; the user
// extends it in Settings. Compared by BASENAME (no path, no extension), so
// "C:\...\git.exe" and "/usr/bin/git" both match "git".
const DEFAULT_ALLOWLIST = [
  'git', 'npm', 'npx', 'pnpm', 'yarn', 'node', 'python', 'python3', 'pip', 'pip3',
  'ls', 'dir', 'cat', 'type', 'echo', 'pwd', 'whoami', 'mkdir', 'cp', 'copy',
  'move', 'tar', 'zip', 'unzip', 'curl'
]

const OUT_CAP = 100_000 // per stream
const DEFAULT_TIMEOUT = 60_000

function allowlistFile(): string {
  return path.join(userDataDir(), 'host-allowlist.json')
}

function baseName(cmd: string): string {
  return path
    .basename(String(cmd || '').toLowerCase())
    .replace(/\.(exe|cmd|bat|ps1|com)$/i, '')
}

export function getAllowlist(): string[] {
  try {
    const f = allowlistFile()
    if (fs.existsSync(f)) {
      const a = JSON.parse(fs.readFileSync(f, 'utf8'))
      if (Array.isArray(a)) return a.map((s) => String(s))
    }
  } catch {
    /* fall back to defaults */
  }
  return [...DEFAULT_ALLOWLIST]
}

export function setAllowlist(list: string[]): string[] {
  const clean = [...new Set((list || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean))]
  try {
    fs.writeFileSync(allowlistFile(), JSON.stringify(clean, null, 2))
  } catch (e) {
    log.error('setAllowlist failed', { message: (e as Error).message })
  }
  return clean
}

export interface HostRunOptions {
  argv: string[]
  cwd?: string
  timeoutMs?: number
}
export interface HostRunResult {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  error?: string
}

// Run argv[0] with argv[1..] — NO shell (shell:false), so pipes/redirects/glob
// never expand and model output can't inject a second command. Allowlist-gated,
// cwd-validated, timeout-killed, output-capped.
export function runHostCommand(opts: HostRunOptions): Promise<HostRunResult> {
  return new Promise((resolve) => {
    const argv = (opts.argv || []).map((s) => String(s))
    if (!argv.length) {
      return resolve({ ok: false, exitCode: null, stdout: '', stderr: '', timedOut: false, error: 'empty command' })
    }
    const prog = baseName(argv[0])
    const allow = getAllowlist().map(baseName)
    if (!allow.includes(prog)) {
      return resolve({
        ok: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        error: `"${prog}" is not in the allowlist. Add it in Settings to allow it.`
      })
    }

    let cwd = opts.cwd && opts.cwd.trim() ? opts.cwd : os.homedir()
    try {
      if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) cwd = os.homedir()
    } catch {
      cwd = os.homedir()
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let child

    log.info('Running host command', { argv, cwd })
    try {
      child = spawn(argv[0], argv.slice(1), { cwd, shell: false, windowsHide: true })
    } catch (e) {
      return resolve({ ok: false, exitCode: null, stdout: '', stderr: '', timedOut: false, error: (e as Error).message })
    }

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }, opts.timeoutMs || DEFAULT_TIMEOUT)

    child.stdout?.on('data', (b) => {
      if (stdout.length < OUT_CAP) stdout += b.toString()
    })
    child.stderr?.on('data', (b) => {
      if (stderr.length < OUT_CAP) stderr += b.toString()
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, exitCode: null, stdout, stderr: stderr || e.message, timedOut, error: e.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({
        ok: code === 0 && !timedOut,
        exitCode: code,
        stdout: stdout.slice(0, OUT_CAP),
        stderr: stderr.slice(0, OUT_CAP),
        timedOut
      })
    })
  })
}
