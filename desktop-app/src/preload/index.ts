import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    // Base URL of the backend the renderer should call (dev: the standalone
    // server on :34730; packaged: the embedded server on the same fixed port).
    getBackendUrl: (): Promise<string> => ipcRenderer.invoke('app:getBackendUrl')
  },
  host: {
    run: (opts: { argv: string[]; cwd?: string; timeoutMs?: number }) =>
      ipcRenderer.invoke('host:run', opts),
    getAllowlist: (): Promise<string[]> => ipcRenderer.invoke('host:getAllowlist'),
    setAllowlist: (list: string[]): Promise<string[]> => ipcRenderer.invoke('host:setAllowlist', list),
    platform: (): Promise<string> => ipcRenderer.invoke('host:platform'),
    pickDirectory: (): Promise<string> => ipcRenderer.invoke('host:pickDirectory')
  },
  launch: {
    // Launch a registered app. Returns { ok, launched } | { needsConfirm, app }
    // (first-time) | { ok:false, error }. Pass approved:true after confirming.
    app: (req: { appId: string; args?: string[]; profileDir?: string; approved?: boolean }) =>
      ipcRenderer.invoke('launch:app', req),
    remember: (appId: string): Promise<void> => ipcRenderer.invoke('launch:remember', appId),
    knownApps: (): Promise<{ id: string; label: string }[]> => ipcRenderer.invoke('launch:knownApps'),
    profiles: (): Promise<{ dir: string; name: string }[]> => ipcRenderer.invoke('launch:profiles'),
    getRemembered: (): Promise<string[]> => ipcRenderer.invoke('launch:getRemembered'),
    setRemembered: (list: string[]): Promise<string[]> => ipcRenderer.invoke('launch:setRemembered', list)
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onChecking: (cb: () => void) => ipcRenderer.on('updater:checking', cb),
    onAvailable: (cb: (_e: unknown, data: unknown) => void) =>
      ipcRenderer.on('updater:available', cb),
    onNotAvailable: (cb: () => void) => ipcRenderer.on('updater:not-available', cb),
    onProgress: (cb: (_e: unknown, data: unknown) => void) =>
      ipcRenderer.on('updater:progress', cb),
    onDownloaded: (cb: (_e: unknown, data: unknown) => void) =>
      ipcRenderer.on('updater:downloaded', cb),
    onError: (cb: (_e: unknown, data: unknown) => void) => ipcRenderer.on('updater:error', cb)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
