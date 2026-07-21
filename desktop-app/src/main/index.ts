import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initLogger, createLogger } from './utils/logger'
import { setupAutoUpdater } from './auto-updater'
import { startServer, EMBEDDED_PORT } from './embedded/server'
import { isPortFree } from './embedded/util'
import { runHostCommand, getAllowlist, setAllowlist } from './host/executor'
import { launchApp, getRememberedApps, setRememberedApps, rememberApp, listChromeProfiles, knownApps } from './host/launcher'

const log = createLogger('Main')

let mainWindow: BrowserWindow | null = null
let backendUrl = ''

process.on('uncaughtException', (e) => {
  log.error('Uncaught exception', { message: e.message, stack: e.stack })
})
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  log.error('Unhandled rejection', { message: msg })
})

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((d) => {
    shell.openExternal(d.url)
    return { action: 'deny' }
  })
  return win
}

// Embed the backend IN-PROCESS by default (dev and packaged) so the extension
// and renderer always reach it at the fixed port — no separate terminal needed.
// If something is ALREADY listening on that port (e.g. a standalone
// `node server.js` the developer runs), reuse it instead of double-booting.
// BA_BACKEND_URL forces an explicit external backend (e.g. a remote one).
async function resolveBackend(): Promise<string> {
  if (process.env.BA_BACKEND_URL) {
    const url = process.env.BA_BACKEND_URL
    log.info('Using external backend (BA_BACKEND_URL)', { url })
    return url.endsWith('/') ? url : `${url}/`
  }
  const port = EMBEDDED_PORT
  if (await isPortFree(port)) {
    await startServer({ port })
    log.info('Embedded backend started', { port })
  } else {
    log.info('Backend already running on port — reusing', { port })
  }
  return `http://127.0.0.1:${port}/`
}

async function loadRenderer(): Promise<void> {
  if (!mainWindow) return
  if (is.dev) {
    try {
      await mainWindow.webContents.session.clearCache()
    } catch (e) {
      log.warn('clearCache failed', { message: (e as Error).message })
    }
  }
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  backendUrl = await resolveBackend()
  log.info('Backend resolved', { backendUrl, embeddedPort: EMBEDDED_PORT })

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:getBackendUrl', () => backendUrl)

  // Host command execution lives in the MAIN process only — never the backend
  // (which may be remote) and never the extension. Renderer confirms first.
  ipcMain.handle('host:run', (_e, opts) => runHostCommand(opts))
  ipcMain.handle('host:getAllowlist', () => getAllowlist())
  ipcMain.handle('host:setAllowlist', (_e, list) => setAllowlist(list))
  ipcMain.handle('host:platform', () => process.platform)
  ipcMain.handle('host:pickDirectory', async () => {
    const r = await dialog.showOpenDialog(mainWindow ?? undefined!, { properties: ['openDirectory'] })
    return r.canceled ? '' : r.filePaths[0] || ''
  })

  // App launcher (open Chrome/apps) — main process only, like host:run.
  // Confirm-first-time lives here: an un-remembered app returns needsConfirm
  // and the renderer prompts, then calls back with approved:true.
  ipcMain.handle('launch:app', (_e, req) => launchApp(req))
  ipcMain.handle('launch:remember', (_e, appId) => rememberApp(appId))
  ipcMain.handle('launch:knownApps', () => knownApps())
  ipcMain.handle('launch:profiles', () => listChromeProfiles())
  ipcMain.handle('launch:getRemembered', () => getRememberedApps())
  ipcMain.handle('launch:setRemembered', (_e, list) => setRememberedApps(list))

  mainWindow = createWindow()
  await loadRenderer()
}

// Single instance: a second launch would try to bind the same embedded port.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId('com.softvasion.browseragent')
    initLogger()
    log.info('App starting', { version: app.getVersion(), platform: process.platform })

    app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w))

    try {
      await bootstrap()
    } catch (e) {
      const msg = (e as Error).message
      log.error('Bootstrap failed', { message: msg })
      dialog.showErrorBox(
        'Kajkor Agent — Failed to Start',
        `The application could not start.\n\n${msg}`
      )
      app.quit()
      return
    }

    if (!is.dev && mainWindow) setupAutoUpdater(mainWindow)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) bootstrap()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
