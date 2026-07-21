import { ElectronAPI } from '@electron-toolkit/preload'

interface UpdaterApi {
  check: () => Promise<unknown>
  install: () => Promise<void>
  onChecking: (cb: () => void) => void
  onAvailable: (cb: (_event: unknown, data: unknown) => void) => void
  onNotAvailable: (cb: () => void) => void
  onProgress: (cb: (_event: unknown, data: unknown) => void) => void
  onDownloaded: (cb: (_event: unknown, data: unknown) => void) => void
  onError: (cb: (_event: unknown, data: unknown) => void) => void
}

interface AppInfoApi {
  getVersion: () => Promise<string>
  getBackendUrl: () => Promise<string>
}

interface HostRunResult {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  error?: string
}

interface HostApi {
  run: (opts: { argv: string[]; cwd?: string; timeoutMs?: number }) => Promise<HostRunResult>
  getAllowlist: () => Promise<string[]>
  setAllowlist: (list: string[]) => Promise<string[]>
  platform: () => Promise<string>
  pickDirectory: () => Promise<string>
}

interface LaunchOutcome {
  ok: boolean
  launched?: boolean
  needsConfirm?: boolean
  app?: string
  error?: string
}
interface LaunchApi {
  app: (req: { appId: string; args?: string[]; profileDir?: string; approved?: boolean }) => Promise<LaunchOutcome>
  remember: (appId: string) => Promise<void>
  knownApps: () => Promise<{ id: string; label: string }[]>
  profiles: () => Promise<{ dir: string; name: string }[]>
  getRemembered: () => Promise<string[]>
  setRemembered: (list: string[]) => Promise<string[]>
}

interface AppApi {
  app: AppInfoApi
  host: HostApi
  launch: LaunchApi
  updater: UpdaterApi
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: AppApi
  }
}
